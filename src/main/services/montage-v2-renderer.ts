import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { buildSizeLimitedShareVideoArguments, type ShareVideoEncoder } from './clip-library';
import { editedDurationMs, videoTextSize } from '../../shared/video-edits';
import type { Clip, ClipExportPreset } from '../../shared/contracts';
import type { MontageMusicTrack, MontageProjectV2, MontageV2Segment } from '../../shared/montage-v2';

export type MontageV2RenderEntry = {
  clip: Clip;
  segment: MontageV2Segment;
};

export type MontageV2RenderInput = {
  project: MontageProjectV2;
  entries: readonly MontageV2RenderEntry[];
  musicPath?: string;
  destination: string;
  preset: ClipExportPreset;
  targetSizeMb?: number;
  encoder?: ShareVideoEncoder;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
};

type MontageVideoTarget = {
  width: number;
  height: number;
  fps: number;
  canvasSize: MontageProjectV2['canvasSize'];
};

type MusicMixPlan = {
  inputArguments: string[];
  filter: string;
  audioMap: string;
};

const exportPresetBytes = {
  '10mb': 10 * 1_024 * 1_024,
  '25mb': 25 * 1_024 * 1_024,
  '50mb': 50 * 1_024 * 1_024,
} as const;

export async function renderMontageV2(input: MontageV2RenderInput): Promise<void> {
  const first = input.entries[0];
  if (!first) throw new Error('Add at least one clip before exporting the montage.');
  const executable = findExecutable('SWITCHBOARD_FFMPEG', 'ffmpeg');
  const target = montageVideoTarget(first.clip, input.project.canvasSize);
  const temporaryDirectory = join(tmpdir(), `switchboard-montage-v2-${randomUUID()}`);
  const concatPath = join(temporaryDirectory, 'segments.txt');
  await mkdir(temporaryDirectory, { recursive: true });

  const targetBytes = input.targetSizeMb ? input.targetSizeMb * 1_048_576 : input.preset !== 'original' ? exportPresetBytes[input.preset] : undefined;
  const budgetKbps = targetBytes ? targetBytes * 8 * 0.9 / Math.max(0.1, input.project.durationMs / 1000) / 1000 : undefined;
  const audioKbps = budgetKbps && budgetKbps < 420 ? 64 : 128;
  const videoKbps = budgetKbps ? Math.floor(budgetKbps - audioKbps) : undefined;
  try {
    if (videoKbps !== undefined && videoKbps < 120) throw new Error('This size is too small for the montage runtime. Choose a larger target.');
    const renderedSegments: string[] = [];
    let beforeMs = 0;
    let encoder = input.encoder ?? 'libx264';
    for (let index = 0; index < input.entries.length; index += 1) {
      if (input.signal?.aborted) throw abortError();
      const entry = input.entries[index];
      if (!entry) continue;
      const segmentPath = join(temporaryDirectory, `segment-${String(index).padStart(4, '0')}.mp4`);
      const durationMs = editedDurationMs(entry.segment.trimStartMs, entry.segment.trimEndMs, entry.segment.videoEdits);
      encoder = await renderMontageSegment(executable, entry, segmentPath, target, input.signal, encoder, videoKbps, audioKbps,
        (fraction) => input.onProgress?.((beforeMs + fraction * durationMs) / input.project.durationMs * 0.9));
      renderedSegments.push(segmentPath);
      beforeMs += durationMs;
      input.onProgress?.(beforeMs / input.project.durationMs * 0.9);
    }

    await writeFile(
      concatPath,
      renderedSegments.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n'),
      'utf8',
    );

    const concatInput = ['-f', 'concat', '-safe', '0', '-i', concatPath];
    const mixPlan = input.project.music && input.musicPath
      ? buildMontageMusicMixPlan(input.project.music, input.project.durationMs, input.musicPath)
      : null;

    input.onProgress?.(0.92);
    // Each segment is encoded once at the final bitrate. Concatenation copies video.
    if (!mixPlan) {
      await run(executable, [
        '-hide_banner', '-loglevel', 'error', ...concatInput,
        '-c', 'copy', '-movflags', '+faststart', '-y', input.destination,
      ], input.signal);
    } else {
      await run(executable, [
        '-hide_banner', '-loglevel', 'error', ...concatInput, ...mixPlan.inputArguments,
        '-filter_complex', mixPlan.filter, '-map', '0:v:0', '-map', mixPlan.audioMap,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart', '-y', input.destination,
      ], input.signal);
    }
    // Verify the actual container size before exposing a successful share.
    if (targetBytes && (await stat(input.destination)).size > targetBytes) {
      throw new Error('The encoded file exceeded its size target. Choose a larger target and try again.');
    }
    input.onProgress?.(1);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function renderMontageSegment(
  executable: string,
  entry: MontageV2RenderEntry,
  destination: string,
  target: MontageVideoTarget,
  signal?: AbortSignal,
  encoder: ShareVideoEncoder = 'libx264',
  videoKbps?: number,
  audioKbps = 128,
  onProgress?: (fraction: number) => void,
): Promise<ShareVideoEncoder> {
  const { clip } = entry;
  const sourceStartMs = entry.segment.trimStartMs;
  const segment: MontageV2Segment = {
    ...entry.segment, trimStartMs: 0, trimEndMs: entry.segment.trimEndMs - sourceStartMs,
    audioTrackTrims: entry.segment.audioTrackTrims?.map((trim) => trim ? { startMs: Math.max(0, trim.startMs - sourceStartMs), endMs: Math.max(0, trim.endMs - sourceStartMs) } : null),
    videoEdits: entry.segment.videoEdits ? { ...entry.segment.videoEdits, text: entry.segment.videoEdits.text ? { ...entry.segment.videoEdits.text, startMs: entry.segment.videoEdits.text.startMs - sourceStartMs, endMs: entry.segment.videoEdits.text.endMs - sourceStartMs } : undefined } : undefined,
  };
  const streamCount = await getAudioStreamCount(clip.path, signal);
  const durationSeconds = editedDurationMs(segment.trimStartMs, segment.trimEndMs, segment.videoEdits) / 1_000;
  const textPath = segment.videoEdits?.text?.content ? `${destination}.txt` : undefined;
  if (textPath) await writeFile(textPath, segment.videoEdits!.text!.content, 'utf8');
  const videoFilter = buildMontageV2VideoFilter(segment, target, textPath);
  const audioFilter = buildMontageV2SegmentAudioFilter(streamCount, segment);
  const inputArguments = ['-ss', (sourceStartMs / 1000).toFixed(3), '-t', (segment.trimEndMs / 1000).toFixed(3), '-i', clip.path];
  let filter: string;
  let audioMap: string;

  if (audioFilter) {
    filter = `${videoFilter};${audioFilter}`;
    audioMap = '[aout]';
  } else {
    inputArguments.push('-f', 'lavfi', '-t', durationSeconds.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
    filter = videoFilter;
    audioMap = '1:a:0';
  }

  const encode = async (selectedEncoder: ShareVideoEncoder) => {
    const codec = videoKbps !== undefined
      ? buildSizeLimitedShareVideoArguments(selectedEncoder, videoKbps, '').slice(0, -2)
      : selectedEncoder === 'h264_nvenc' ? ['-c:v', selectedEncoder, '-preset', 'p4', '-rc', 'vbr', '-cq', '18', '-b:v', '0']
      : selectedEncoder === 'h264_amf' ? ['-c:v', selectedEncoder, '-quality', 'balanced', '-rc', 'cqp', '-qp_i', '18', '-qp_p', '18']
      : selectedEncoder === 'h264_qsv' ? ['-c:v', selectedEncoder, '-preset', 'fast', '-global_quality', '18']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18'];
    await run(executable, [
      '-hide_banner', '-loglevel', 'error', ...inputArguments,
      '-filter_complex', filter, '-map', '[vout]', '-map', audioMap,
      ...codec, '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2',
      '-t', durationSeconds.toFixed(3), '-movflags', '+faststart', '-y', destination,
    ], signal, durationSeconds, onProgress);
  };
  try { await encode(encoder); return encoder; }
  catch (error) { if (encoder === 'libx264' || signal?.aborted) throw error; await encode('libx264'); return 'libx264'; }

}

export function buildMontageV2VideoFilter(
  segment: MontageV2Segment,
  target: MontageVideoTarget,
  textPath?: string,
): string {
  const start = (segment.trimStartMs / 1_000).toFixed(3);
  const end = (segment.trimEndMs / 1_000).toFixed(3);
  const normalize = target.canvasSize === '9:16'
    ? `crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',scale=${target.width}:${target.height}:flags=lanczos`
    : `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const edits = segment.videoEdits;
  const speed = edits?.speed ?? 1;
  const adjustments = [];
  if (edits?.flipHorizontal) adjustments.push('hflip');
  // Match the preview's sRGB brightness, contrast, then saturation order.
  if (edits?.brightness) {
    const expression = `clip(val*${1 + edits.brightness},0,255)`;
    adjustments.push(`lutrgb=r='${expression}':g='${expression}':b='${expression}'`);
  }
  if (edits?.contrast !== undefined && edits.contrast !== 1) {
    const expression = `clip((val-127.5)*${edits.contrast}+127.5,0,255)`;
    adjustments.push(`lutrgb=r='${expression}':g='${expression}':b='${expression}'`);
  }
  if (edits?.saturation !== undefined && edits.saturation !== 1) {
    const amount = edits.saturation;
    const r = 0.213 * (1 - amount), g = 0.715 * (1 - amount), b = 0.072 * (1 - amount);
    adjustments.push(`colorchannelmixer=rr=${r + amount}:rg=${g}:rb=${b}:gr=${r}:gg=${g + amount}:gb=${b}:br=${r}:bg=${g}:bb=${b + amount}`);
  }
  const text = edits?.text;
  if (text?.content && textPath) {
    const from = Math.max(0, (text.startMs - segment.trimStartMs) / speed / 1000);
    const to = Math.max(0, (text.endMs - segment.trimStartMs) / speed / 1000);
    const y = text.position === 'top' ? 'h*0.08' : text.position === 'bottom' ? 'h*0.92-text_h' : '(h-text_h)/2';
    const longest = Math.max(1, ...text.content.split('\n').map((line) => [...line].length));
    const fontSize = Math.max(1, Math.round(Math.min(target.height * videoTextSize[text.size], target.width * 0.88 / (longest * 0.65), target.height * 0.7 / Math.max(1, text.content.split('\n').length) / 1.2)));
    const font = process.platform === 'win32' ? `fontfile=${filterPath(join(process.env.WINDIR ?? 'C:/Windows', 'Fonts', 'arialbd.ttf'))}:` : 'font=DejaVu Sans:';
    adjustments.push(`drawtext=${font}textfile=${filterPath(textPath)}:expansion=none:fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-text_w)/2:y=${y}:enable='gte(t,${from.toFixed(3)})*lt(t,${to.toFixed(3)})'`);
  }
  const look = adjustments.length ? `,${adjustments.join(',')}` : '';
  const timing = speed === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)/${speed}`;
  return `[0:v:0]trim=start=${start}:end=${end},setpts=${timing},${normalize},setsar=1,fps=${target.fps.toFixed(3)}${look},format=yuv420p[vout]`;
}

export function buildMontageV2SegmentAudioFilter(
  streamCount: number,
  segment: MontageV2Segment,
): string | null {
  if (segment.muted || segment.volume <= 0) return null;
  const active = Array.from({ length: streamCount }, (_, trackIndex) => ({
    trackIndex,
    level: Math.min(100, Math.max(0, segment.audioTrackLevels?.[trackIndex] ?? 100)),
    startMs: Math.max(segment.trimStartMs, segment.audioTrackTrims?.[trackIndex]?.startMs ?? segment.trimStartMs),
    endMs: Math.min(segment.trimEndMs, segment.audioTrackTrims?.[trackIndex]?.endMs ?? segment.trimEndMs),
  })).filter((track) => track.level > 0 && track.endMs > track.startMs);
  if (active.length === 0) return null;

  const speed = segment.videoEdits?.speed ?? 1;
  const segmentDurationSeconds = editedDurationMs(segment.trimStartMs, segment.trimEndMs, segment.videoEdits) / 1_000;
  const filters = active.map((track, index) => {
    const delayMs = (track.startMs - segment.trimStartMs) / speed;
    const gain = track.level / 100 * segment.volume;
    const chain = [
      `atrim=start=${(track.startMs / 1_000).toFixed(3)}:end=${(track.endMs / 1_000).toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
    ];
    chain.push(...tempoFilters(speed));
    if (delayMs > 0) chain.push(`adelay=${Math.round(delayMs)}:all=1`);
    chain.push(`volume=${gain.toFixed(4)}`);
    return `[0:a:${track.trackIndex}]${chain.join(',')}[montage-v2-track-${index}]`;
  });
  const inputs = active.map((_track, index) => `[montage-v2-track-${index}]`).join('');
  filters.push(active.length > 1
    ? `${inputs}amix=inputs=${active.length}:duration=longest:dropout_transition=0:normalize=0[montage-v2-mix]`
    : `${inputs}anull[montage-v2-mix]`);
  filters.push(
    `[montage-v2-mix]apad=whole_dur=${segmentDurationSeconds.toFixed(3)},atrim=duration=${segmentDurationSeconds.toFixed(3)},aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.95[aout]`,
  );
  return filters.join(';');
}

export function buildMontageMusicMixPlan(
  track: MontageMusicTrack,
  projectDurationMs: number,
  musicPath: string,
): MusicMixPlan | null {
  if (track.muted || track.volume <= 0 || track.timelineStartMs >= projectDurationMs) return null;
  const sourceDurationMs = track.sourceEndMs - track.sourceStartMs;
  const remainingProjectMs = projectDurationMs - track.timelineStartMs;
  const activeDurationMs = track.loop
    ? remainingProjectMs
    : Math.min(sourceDurationMs, remainingProjectMs);
  if (sourceDurationMs < 100 || activeDurationMs < 1) return null;

  const sourceStartSeconds = (track.sourceStartMs / 1_000).toFixed(3);
  const sourceEndSeconds = (track.sourceEndMs / 1_000).toFixed(3);
  const activeDurationSeconds = (activeDurationMs / 1_000).toFixed(3);
  const musicChain = [
    `atrim=start=${sourceStartSeconds}:end=${sourceEndSeconds}`,
    'asetpts=PTS-STARTPTS',
    'aresample=48000',
    'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
  ];
  if (track.loop && activeDurationMs > sourceDurationMs) {
    musicChain.push(`aloop=loop=-1:size=${Math.max(1, Math.round(sourceDurationMs * 48))}`);
  }
  musicChain.push(`atrim=duration=${activeDurationSeconds}`);

  const fadeInMs = Math.min(track.fadeInMs, Math.floor(activeDurationMs / 2));
  const fadeOutMs = Math.min(track.fadeOutMs, Math.floor(activeDurationMs / 2));
  if (fadeInMs > 0) musicChain.push(`afade=t=in:st=0:d=${(fadeInMs / 1_000).toFixed(3)}`);
  if (fadeOutMs > 0) {
    musicChain.push(
      `afade=t=out:st=${((activeDurationMs - fadeOutMs) / 1_000).toFixed(3)}:d=${(fadeOutMs / 1_000).toFixed(3)}`,
    );
  }
  musicChain.push(`volume=${track.volume.toFixed(4)}`);
  if (track.timelineStartMs > 0) musicChain.push(`adelay=${track.timelineStartMs}:all=1`);
  musicChain.push(
    `apad=whole_dur=${(projectDurationMs / 1_000).toFixed(3)}`,
    `atrim=duration=${(projectDurationMs / 1_000).toFixed(3)}`,
  );

  const filter = [
    `[0:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[montage-clips]`,
    `[1:a:0]${musicChain.join(',')}[montage-music]`,
    '[montage-clips][montage-music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]',
  ].join(';');
  return { inputArguments: ['-i', musicPath], filter, audioMap: '[aout]' };
}

export function readMontageAudioWaveform(
  path: string,
  durationMs: number,
  bucketCount = 240,
): Promise<number[]> {
  const executable = findExecutable('SWITCHBOARD_FFMPEG', 'ffmpeg');
  const sampleRate = 8_000;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [
      '-hide_banner', '-loglevel', 'error', '-i', path,
      '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(sampleRate),
      '-f', 's16le', 'pipe:1',
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const peaks = new Float32Array(bucketCount);
    const expectedSamples = Math.max(1, Math.round(durationMs / 1_000 * sampleRate));
    let sampleIndex = 0;
    let carry: Buffer | null = null;
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const bytes = carry ? Buffer.concat([carry, chunk]) : chunk;
      const evenLength = bytes.length - bytes.length % 2;
      for (let offset = 0; offset < evenLength; offset += 2) {
        const bucket = Math.min(bucketCount - 1, Math.floor(sampleIndex / expectedSamples * bucketCount));
        const amplitude = Math.abs(bytes.readInt16LE(offset)) / 32_768;
        if (amplitude > (peaks[bucket] ?? 0)) peaks[bucket] = amplitude;
        sampleIndex += 1;
      }
      carry = evenLength < bytes.length ? bytes.subarray(evenLength) : null;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { if (stderr.length < 16_384) stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${executable} exited with code ${code}`));
        return;
      }
      const peak = peaks.reduce((maximum, value) => Math.max(maximum, value), 0);
      if (peak <= 0) {
        resolvePromise(Array.from(peaks, () => 0));
        return;
      }
      resolvePromise(Array.from(peaks, (value) => Math.round(Math.pow(value / peak, 0.58) * 1_000) / 1_000));
    });
  });
}

export async function probeMontageAudio(path: string): Promise<{ durationMs: number; codec?: string }> {
  const executable = findExecutable('SWITCHBOARD_FFPROBE', 'ffprobe');
  const output = await run(executable, [
    '-v', 'error', '-print_format', 'json', '-show_entries',
    'format=duration:stream=codec_type,codec_name', path,
  ]);
  const parsed = JSON.parse(output) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string }>;
  };
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
  const durationMs = Math.round(Number(parsed.format?.duration ?? 0) * 1_000);
  if (!audio || !Number.isFinite(durationMs) || durationMs < 100) {
    throw new Error('The selected file does not contain a usable audio stream.');
  }
  return { durationMs, ...(audio.codec_name ? { codec: audio.codec_name } : {}) };
}

function montageVideoTarget(clip: Clip, canvasSize: MontageProjectV2['canvasSize']): MontageVideoTarget {
  if (clip.width <= 0 || clip.height <= 0) throw new Error(`Video dimensions are unavailable for ${clip.name}.`);
  const sourceWidth = Math.max(2, Math.floor(clip.width / 2) * 2);
  const sourceHeight = Math.max(2, Math.floor(clip.height / 2) * 2);
  if (canvasSize === '9:16') {
    return {
      width: Math.max(2, Math.floor(sourceHeight * 9 / 16 / 2) * 2),
      height: sourceHeight,
      fps: Math.max(1, clip.fps || 30),
      canvasSize,
    };
  }
  return { width: sourceWidth, height: sourceHeight, fps: Math.max(1, clip.fps || 30), canvasSize };
}

async function getAudioStreamCount(path: string, signal?: AbortSignal): Promise<number> {
  const executable = findExecutable('SWITCHBOARD_FFPROBE', 'ffprobe');
  const output = await run(executable, [
    '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'json', path,
  ], signal);
  const parsed = JSON.parse(output) as { streams?: unknown[] };
  return Math.min(8, parsed.streams?.length ?? 0);
}

function findExecutable(environmentName: string, baseName: string): string {
  const configured = process.env[environmentName];
  if (configured) return configured;
  const executable = process.platform === 'win32' ? `${baseName}.exe` : baseName;
  const packagedCandidate = join(process.resourcesPath ?? '', 'capture-host', 'ffmpeg', executable);
  if (existsSync(packagedCandidate)) return packagedCandidate;
  for (const segment of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(segment, executable);
    try { if (existsSync(candidate)) return candidate; } catch { }
  }
  return executable;
}

function run(executable: string, arguments_: string[], signal?: AbortSignal, durationSeconds?: number, onProgress?: (fraction: number) => void): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const child = spawn(executable, onProgress ? ['-progress', 'pipe:1', '-nostats', ...arguments_] : arguments_, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(signal ? { signal } : {}),
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolvePromise(stdout);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let progressBuffer = '';
    child.stdout.on('data', (chunk: string) => {
      if (!onProgress) { if (stdout.length < 1_048_576) stdout += chunk; return; }
      progressBuffer += chunk;
      const lines = progressBuffer.split('\n');
      progressBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('out_time_us=')) continue;
        const seconds = Number(line.slice(12).trim()) / 1_000_000;
        if (Number.isFinite(seconds) && durationSeconds) onProgress(Math.min(1, Math.max(0, seconds / durationSeconds)));
      }
    });
    child.stderr.on('data', (chunk: string) => { if (stderr.length < 65_536) stderr += chunk; });
    child.once('error', (error) => { if (!signal?.aborted) finish(error); });
    child.once('close', (code) => {
      if (signal?.aborted) finish(abortError());
      else if (code === 0) finish();
      else finish(new Error(stderr.trim() || `${executable} exited with code ${code}`));
    });
  });
}

function abortError(): Error {
  const error = new Error('Export cancelled.');
  error.name = 'AbortError';
  return error;
}

function filterPath(path: string): string {
  return "'" + path.replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "'\\''") + "'";
}

export function tempoFilters(speed: number): string[] {
  const filters: string[] = [];
  while (speed < 0.5) { filters.push('atempo=0.5'); speed /= 0.5; }
  while (speed > 2) { filters.push('atempo=2'); speed /= 2; }
  if (speed !== 1) filters.push(`atempo=${speed}`);
  return filters;
}
