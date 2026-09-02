import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
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

  try {
    const renderedSegments: string[] = [];
    for (let index = 0; index < input.entries.length; index += 1) {
      if (input.signal?.aborted) throw abortError();
      const entry = input.entries[index];
      if (!entry) continue;
      const segmentPath = join(temporaryDirectory, `segment-${String(index).padStart(4, '0')}.mp4`);
      await renderMontageSegment(executable, entry, segmentPath, target, input.signal);
      renderedSegments.push(segmentPath);
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

    if (input.preset === 'original') {
      if (!mixPlan) {
        await run(executable, [
          '-hide_banner', '-loglevel', 'error', ...concatInput,
          '-c', 'copy', '-movflags', '+faststart', '-y', input.destination,
        ], input.signal);
        return;
      }
      await run(executable, [
        '-hide_banner', '-loglevel', 'error', ...concatInput, ...mixPlan.inputArguments,
        '-filter_complex', mixPlan.filter,
        '-map', '0:v:0', '-map', mixPlan.audioMap,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart', '-y', input.destination,
      ], input.signal);
      return;
    }

    const durationSeconds = input.project.durationMs / 1_000;
    const targetBytes = exportPresetBytes[input.preset];
    const budgetKbps = targetBytes * 8 * 0.94 / Math.max(0.1, durationSeconds) / 1_000;
    const audioKbps = budgetKbps >= 620 ? 128 : budgetKbps >= 420 ? 96 : 64;
    const videoKbps = Math.floor(Math.max(120, budgetKbps - audioKbps));
    if (budgetKbps < audioKbps + 120) {
      throw new Error('This montage is too long for the selected file size. Choose a larger preset or shorten the sequence.');
    }

    const passLog = join(temporaryDirectory, 'montage-pass');
    await run(executable, [
      '-hide_banner', '-loglevel', 'error', ...concatInput,
      '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
      '-b:v', `${videoKbps}k`, '-pass', '1', '-passlogfile', passLog,
      '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null',
    ], input.signal);

    if (mixPlan) {
      await run(executable, [
        '-hide_banner', '-loglevel', 'error', ...concatInput, ...mixPlan.inputArguments,
        '-filter_complex', mixPlan.filter,
        '-map', '0:v:0', '-map', mixPlan.audioMap,
        '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-b:v', `${videoKbps}k`, '-pass', '2', '-passlogfile', passLog,
        '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart', '-y', input.destination,
      ], input.signal);
      return;
    }

    await run(executable, [
      '-hide_banner', '-loglevel', 'error', ...concatInput,
      '-map', '0:v:0', '-map', '0:a:0',
      '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
      '-b:v', `${videoKbps}k`, '-pass', '2', '-passlogfile', passLog,
      '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', '-y', input.destination,
    ], input.signal);
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
): Promise<void> {
  const { clip, segment } = entry;
  const streamCount = await getAudioStreamCount(clip.path);
  const durationSeconds = (segment.trimEndMs - segment.trimStartMs) / 1_000;
  const videoFilter = buildMontageV2VideoFilter(segment, target);
  const audioFilter = buildMontageV2SegmentAudioFilter(streamCount, segment);
  const inputArguments = ['-i', clip.path];
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

  await run(executable, [
    '-hide_banner', '-loglevel', 'error', ...inputArguments,
    '-filter_complex', filter, '-map', '[vout]', '-map', audioMap,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-t', durationSeconds.toFixed(3), '-movflags', '+faststart', '-y', destination,
  ], signal);
}

export function buildMontageV2VideoFilter(
  segment: MontageV2Segment,
  target: MontageVideoTarget,
): string {
  const start = (segment.trimStartMs / 1_000).toFixed(3);
  const end = (segment.trimEndMs / 1_000).toFixed(3);
  const normalize = target.canvasSize === '9:16'
    ? `crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',scale=${target.width}:${target.height}:flags=lanczos`
    : `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
  return `[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,${normalize},setsar=1,fps=${target.fps.toFixed(3)},format=yuv420p[vout]`;
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

  const segmentDurationSeconds = (segment.trimEndMs - segment.trimStartMs) / 1_000;
  const filters = active.map((track, index) => {
    const delayMs = track.startMs - segment.trimStartMs;
    const gain = track.level / 100 * segment.volume;
    const chain = [
      `atrim=start=${(track.startMs / 1_000).toFixed(3)}:end=${(track.endMs / 1_000).toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
    ];
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
    child.once('exit', (code) => {
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

async function getAudioStreamCount(path: string): Promise<number> {
  const executable = findExecutable('SWITCHBOARD_FFPROBE', 'ffprobe');
  const output = await run(executable, [
    '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'json', path,
  ]);
  const parsed = JSON.parse(output) as { streams?: unknown[] };
  return Math.min(8, parsed.streams?.length ?? 0);
}

function findExecutable(environmentName: string, baseName: string): string {
  const configured = process.env[environmentName];
  if (configured) return configured;
  const executable = process.platform === 'win32' ? `${baseName}.exe` : baseName;
  const packagedCandidate = join(process.resourcesPath, 'capture-host', 'ffmpeg', executable);
  if (existsSync(packagedCandidate)) return packagedCandidate;
  for (const segment of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(segment, executable);
    try { if (existsSync(candidate)) return candidate; } catch { }
  }
  return executable;
}

function run(executable: string, arguments_: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const child = spawn(executable, arguments_, {
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
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { if (stderr.length < 65_536) stderr += chunk; });
    child.once('error', (error) => finish(signal?.aborted ? abortError() : error));
    child.once('exit', (code) => {
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
