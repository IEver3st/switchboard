import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, mkdir, opendir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, extname, join, parse, resolve } from 'node:path';
import type {
  Clip,
  ClipAudioChannel,
  ClipAudioTrackTrim,
  ClipAudioWaveform,
  ClipAudioWaveformTrack,
  ClipCanvasSize,
  ExportClipInput,
  ExportMontageInput,
  MontageProjectSegment,
} from '../../shared/contracts';
import { createDefaultClipTitle, inferClipGame, normalizeClipRecord } from '../../shared/clip-library';

const supportedExtensions = new Set(['.mp4', '.mkv', '.webm', '.mov']);

type ProbeResult = {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  codec?: string;
  audioChannels: ClipAudioChannel[];
};

type ClipEnrichment = Pick<Clip, 'thumbnailPath' | 'audioChannels'>;

type AudioStreamInfo = {
  trackIndex: number;
  label: string;
  channel: ClipAudioChannel | null;
};

type AudioStreamTags = {
  title?: string;
  name?: string;
  handler_name?: string;
};

const waveformBucketCount = 180;
const waveformSampleRate = 8_000;
const waveformCacheLimit = 16;

export class ClipLibraryService {
  private thumbnailQueue: Promise<void> = Promise.resolve();
  private readonly waveformCache = new Map<string, Promise<ClipAudioWaveform>>();

  public constructor(private readonly thumbnailDirectory: string) {}

  public async reconcile(indexed: readonly Clip[], directory: string): Promise<Clip[]> {
    await mkdir(directory, { recursive: true });
    await mkdir(this.thumbnailDirectory, { recursive: true });
    const existing: Clip[] = [];
    for (const indexedClip of indexed) {
      const clip = normalizeClipRecord(indexedClip);
      try {
        await access(clip.path);
        if (clip.thumbnailPath) {
          try {
            await access(clip.thumbnailPath);
            existing.push(clip);
          } catch {
            existing.push({ ...clip, thumbnailPath: undefined });
          }
        } else {
          existing.push(clip);
        }
      } catch {
        // Users can remove files outside Switchboard; remove the cache-only preview too.
        if (clip.thumbnailPath) await rm(clip.thumbnailPath, { force: true });
      }
    }

    const byPath = new Map(existing.map((clip) => [resolve(clip.path).toLocaleLowerCase(), clip]));
    const handle = await opendir(directory);
    let inspected = 0;
    for await (const entry of handle) {
      if (!entry.isFile() || !supportedExtensions.has(extname(entry.name).toLocaleLowerCase())) continue;
      if (inspected >= 5_000) break;
      inspected += 1;
      const path = resolve(directory, entry.name);
      if (byPath.has(path.toLocaleLowerCase())) continue;
      try {
        const clip = await this.createClipFromFile(path);
        existing.push(clip);
        byPath.set(path.toLocaleLowerCase(), clip);
      } catch (error) {
        console.warn('Skipped an unreadable clip during library reconciliation.', basename(path), error);
      }
    }
    return existing.sort((left, right) => right.createdAt - left.createdAt);
  }

  public needsEnrichment(clip: Clip): boolean {
    return clip.audioChannels === undefined
      || !clip.thumbnailPath
      || basename(clip.thumbnailPath) !== `${clip.id}.v2.jpg`;
  }

  public enqueueThumbnail(clip: Clip, onReady: (enrichment: ClipEnrichment) => void): void {
    this.thumbnailQueue = this.thumbnailQueue
      .catch(() => undefined)
      .then(async () => {
        let audioChannels = clip.audioChannels;
        if (audioChannels === undefined) {
          audioChannels = (await this.probe(clip.path)).audioChannels;
        }
        if (clip.thumbnailPath && basename(clip.thumbnailPath) === `${clip.id}.v2.jpg`) {
          try {
            await access(clip.thumbnailPath);
            onReady({ thumbnailPath: clip.thumbnailPath, audioChannels });
            return;
          } catch { }
        }
        const thumbnailPath = join(this.thumbnailDirectory, `${clip.id}.v2.jpg`);
        await this.generateThumbnail(clip.path, thumbnailPath, clip.durationMs);
        onReady({ thumbnailPath, audioChannels });
        if (clip.thumbnailPath && resolve(clip.thumbnailPath) !== resolve(thumbnailPath)) {
          await rm(clip.thumbnailPath, { force: true });
        }
      })
      .catch((error) => console.warn('Clip thumbnail generation failed.', error));
  }

  public async removeThumbnail(clip: Clip): Promise<void> {
    this.waveformCache.delete(clip.id);
    if (clip.thumbnailPath) await rm(clip.thumbnailPath, { force: true });
  }

  public loadAudioWaveform(clip: Clip): Promise<ClipAudioWaveform> {
    const cached = this.waveformCache.get(clip.id);
    if (cached) {
      this.waveformCache.delete(clip.id);
      this.waveformCache.set(clip.id, cached);
      return cached;
    }

    const pending = this.analyzeAudioWaveform(clip).catch((error) => {
      this.waveformCache.delete(clip.id);
      throw error;
    });
    this.waveformCache.set(clip.id, pending);
    while (this.waveformCache.size > waveformCacheLimit) {
      const oldest = this.waveformCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.waveformCache.delete(oldest);
    }
    return pending;
  }

  public async createClipFromFile(path: string): Promise<Clip> {
    const [file, media] = await Promise.all([stat(path), this.probe(path)]);
    const game = inferClipGame(parse(path).name);
    return {
      id: randomUUID(),
      path,
      name: createDefaultClipTitle(game),
      ...(game ? { game } : {}),
      createdAt: file.birthtimeMs > 0 ? Math.round(file.birthtimeMs) : Math.round(file.mtimeMs),
      durationMs: Math.max(0, Math.round(media.durationMs)),
      fileSize: file.size,
      width: media.width,
      height: media.height,
      fps: media.fps,
      ...(media.codec ? { codec: media.codec } : {}),
      favorite: false,
      titleEdited: false,
      canvasSize: 'original',
      audioChannels: media.audioChannels,
    };
  }

  public async renderExport(clip: Clip, destination: string, input: ExportClipInput, signal?: AbortSignal): Promise<void> {
    const startMs = Math.max(0, Math.min(input.startMs, clip.durationMs - 1));
    const endMs = Math.max(startMs + 1, Math.min(input.endMs, clip.durationMs));
    const durationSeconds = (endMs - startMs) / 1_000;
    const executable = findExecutable('SWITCHBOARD_FFMPEG', 'ffmpeg');
    const seek = (startMs / 1_000).toFixed(3);
    const duration = durationSeconds.toFixed(3);
    const common = [
      '-hide_banner', '-loglevel', 'error', '-ss', seek, '-i', clip.path, '-t', duration,
      '-map', '0:v:0', '-map_metadata', '0',
    ];
    const video = ['-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-vf', buildClipVideoFilter(clip.canvasSize)];

    const audioLevels = clip.audioTrackLevels ?? [];
    const audioTrackTrims = input.audioTrackTrims ?? clip.audioTrackTrims ?? [];
    const audioEditChanged = audioLevels.some((level) => level !== 100) || audioTrackTrims.some(Boolean);
    if (input.preset === 'original' && !audioEditChanged) {
      await run(executable, [
        ...common, '-map', '0:a?', ...video, '-crf', '18', '-c:a', 'aac', '-b:a', '160k',
        '-movflags', '+faststart', '-y', destination,
      ], signal);
      return;
    }

    if (input.preset === 'original') {
      const audioStreams = await this.getAudioStreams(clip.path);
      const audioArguments = buildShareAudioArguments(audioStreams.length, 160, audioLevels, audioTrackTrims, startMs, endMs);
      await run(executable, [
        ...common, ...audioArguments, ...video, '-crf', '18',
        '-movflags', '+faststart', '-y', destination,
      ], signal);
      return;
    }

    const targetBytes = exportPresetBytes[input.preset];
    const budgetKbps = targetBytes * 8 * 0.94 / durationSeconds / 1_000;
    const audioKbps = budgetKbps >= 420 ? 96 : 64;
    const sourceKbps = clip.fileSize * 8 / Math.max(1, clip.durationMs / 1_000) / 1_000;
    const videoKbps = Math.floor(Math.min(
      Math.max(120, budgetKbps - audioKbps),
      Math.max(120, sourceKbps - audioKbps),
    ));
    if (budgetKbps < audioKbps + 120) {
      throw new Error('This clip is too long for the selected file size. Choose a larger share preset or shorten the trim.');
    }

    const passLog = join(tmpdir(), `switchboard-export-${randomUUID()}`);
    try {
      await run(executable, [
        ...common, ...video, '-b:v', `${videoKbps}k`, '-pass', '1', '-passlogfile', passLog,
        '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null',
      ], signal);

      const audioStreams = await this.getAudioStreams(clip.path);
      const audioArguments = buildShareAudioArguments(audioStreams.length, audioKbps, audioLevels, audioTrackTrims, startMs, endMs);
      await run(executable, [
        ...common, ...audioArguments, ...video, '-b:v', `${videoKbps}k`, '-pass', '2', '-passlogfile', passLog,
        '-movflags', '+faststart', '-y', destination,
      ], signal);
    } finally {
      await Promise.all([
        rm(`${passLog}-0.log`, { force: true }),
        rm(`${passLog}-0.log.mbtree`, { force: true }),
      ]);
    }
  }

  public async renderMontageExport(
    entries: readonly { clip: Clip; segment: MontageProjectSegment }[],
    destination: string,
    input: ExportMontageInput,
    signal?: AbortSignal,
  ): Promise<void> {
    const first = entries[0];
    if (!first) throw new Error('Add at least one clip before exporting the montage.');
    const executable = findExecutable('SWITCHBOARD_FFMPEG', 'ffmpeg');
    const target = montageVideoTarget(first.clip, input.project.canvasSize);
    const temporaryDirectory = join(tmpdir(), `switchboard-montage-${randomUUID()}`);
    const concatPath = join(temporaryDirectory, 'segments.txt');
    await mkdir(temporaryDirectory, { recursive: true });

    try {
      const renderedSegments: string[] = [];
      for (let index = 0; index < entries.length; index += 1) {
        if (signal?.aborted) throw abortError();
        const entry = entries[index]!;
        const segmentPath = join(temporaryDirectory, `segment-${String(index).padStart(4, '0')}.mp4`);
        await this.renderMontageSegment(executable, entry.clip, entry.segment, segmentPath, target, signal);
        renderedSegments.push(segmentPath);
      }

      await writeFile(
        concatPath,
        renderedSegments.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n'),
        'utf8',
      );

      const common = ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concatPath];
      if (input.preset === 'original') {
        await run(executable, [...common, '-c', 'copy', '-movflags', '+faststart', '-y', destination], signal);
        return;
      }

      const durationSeconds = input.project.durationMs / 1_000;
      const targetBytes = exportPresetBytes[input.preset];
      const budgetKbps = targetBytes * 8 * 0.94 / durationSeconds / 1_000;
      const audioKbps = budgetKbps >= 420 ? 96 : 64;
      const videoKbps = Math.floor(Math.max(120, budgetKbps - audioKbps));
      if (budgetKbps < audioKbps + 120) {
        throw new Error('This montage is too long for the selected file size. Choose a larger share preset or shorten the sequence.');
      }
      const passLog = join(temporaryDirectory, 'montage-pass');
      await run(executable, [
        ...common, '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-b:v', `${videoKbps}k`, '-pass', '1', '-passlogfile', passLog,
        '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null',
      ], signal);
      await run(executable, [
        ...common, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p',
        '-b:v', `${videoKbps}k`, '-pass', '2', '-passlogfile', passLog,
        '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-movflags', '+faststart', '-y', destination,
      ], signal);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private async renderMontageSegment(
    executable: string,
    clip: Clip,
    segment: MontageProjectSegment,
    destination: string,
    target: MontageVideoTarget,
    signal?: AbortSignal,
  ): Promise<void> {
    const streams = await this.getAudioStreams(clip.path);
    const durationSeconds = (segment.trimEndMs - segment.trimStartMs) / 1_000;
    const videoFilter = buildMontageVideoFilter(segment, target);
    const audio = buildMontageSegmentAudioFilter(streams.length, segment);
    const inputArguments = ['-i', clip.path];
    let filter: string;
    let audioMap: string;

    if (audio) {
      filter = `${videoFilter};${audio.filter}`;
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
      '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-t', durationSeconds.toFixed(3), '-movflags', '+faststart', '-y', destination,
    ], signal);
  }

  private async probe(path: string): Promise<ProbeResult> {
    const executable = findExecutable('SWITCHBOARD_FFPROBE', 'ffprobe');
    const output = await run(executable, [
      '-v', 'error', '-print_format', 'json', '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate:stream_tags=title,name,handler_name', path,
    ]);
    const parsed = JSON.parse(output) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        tags?: AudioStreamTags;
      }>;
    };
    const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
    if (!video) throw new Error('Video stream not found.');
    return {
      durationMs: Number(parsed.format?.duration ?? 0) * 1_000,
      width: video.width ?? 0,
      height: video.height ?? 0,
      fps: parseRate(video.avg_frame_rate),
      ...(video.codec_name ? { codec: video.codec_name } : {}),
      audioChannels: [...new Set((parsed.streams ?? [])
        .filter((stream) => stream.codec_type === 'audio')
        .map((stream) => audioChannelFromTitle(audioStreamLabel(stream.tags)))
        .filter((channel): channel is ClipAudioChannel => channel !== null))],
    };
  }

  private async getAudioStreams(path: string): Promise<AudioStreamInfo[]> {
    const executable = findExecutable('SWITCHBOARD_FFPROBE', 'ffprobe');
    const output = await run(executable, [
      '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index:stream_tags=title,name,handler_name', '-of', 'json', path,
    ]);
    const parsed = JSON.parse(output) as { streams?: Array<{ tags?: AudioStreamTags }> };
    return (parsed.streams ?? []).slice(0, 8).map((stream, trackIndex) => {
      const label = audioStreamLabel(stream.tags);
      return {
        trackIndex,
        label: label || `Audio ${trackIndex + 1}`,
        channel: audioChannelFromTitle(label),
      };
    });
  }

  private async analyzeAudioWaveform(clip: Clip): Promise<ClipAudioWaveform> {
    const streams = await this.getAudioStreams(clip.path);
    const indexedChannels = clip.audioChannels?.length === streams.length ? clip.audioChannels : [];
    const tracks: ClipAudioWaveformTrack[] = [];
    for (const stream of streams) {
      const samples = await readWaveformSamples(clip.path, stream.trackIndex, clip.durationMs);
      const channel = stream.channel ?? indexedChannels[stream.trackIndex];
      tracks.push({
        trackIndex: stream.trackIndex,
        label: channel && stream.label.startsWith('Audio ') ? audioChannelLabel(channel) : stream.label,
        ...(channel ? { channel } : {}),
        samples,
      });
    }
    return { clipId: clip.id, tracks };
  }

  private async generateThumbnail(path: string, thumbnailPath: string, durationMs: number): Promise<void> {
    await mkdir(dirname(thumbnailPath), { recursive: true });
    const executable = findExecutable('SWITCHBOARD_FFMPEG', 'ffmpeg');
    const durationSeconds = durationMs / 1_000;
    const seekSeconds = durationSeconds <= 1
      ? 0
      : Math.max(0.5, Math.min(durationSeconds - 0.25, durationSeconds * 0.32));
    const temporary = `${thumbnailPath}.${createHash('sha1').update(path).digest('hex').slice(0, 8)}.tmp.jpg`;
    try {
      await run(executable, [
        '-hide_banner', '-loglevel', 'error', '-ss', seekSeconds.toFixed(3), '-i', path,
        '-frames:v', '1', '-vf', "scale='min(960,iw)':-2:flags=lanczos", '-q:v', '2', '-y', temporary,
      ]);
      await rename(temporary, thumbnailPath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

const exportPresetBytes = {
  '10mb': 10 * 1_024 * 1_024,
  '25mb': 25 * 1_024 * 1_024,
  '50mb': 50 * 1_024 * 1_024,
} as const;

type MontageVideoTarget = {
  width: number;
  height: number;
  fps: number;
  canvasSize: ClipCanvasSize;
};

function montageVideoTarget(clip: Clip, canvasSize: ClipCanvasSize): MontageVideoTarget {
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

export function buildMontageVideoFilter(segment: MontageProjectSegment, target: MontageVideoTarget): string {
  const start = (segment.trimStartMs / 1_000).toFixed(3);
  const end = (segment.trimEndMs / 1_000).toFixed(3);
  const normalize = target.canvasSize === '9:16'
    ? `crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',scale=${target.width}:${target.height}:flags=lanczos`
    : `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
  return `[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,${normalize},setsar=1,fps=${target.fps.toFixed(3)},format=yuv420p[vout]`;
}

export function buildMontageSegmentAudioFilter(
  streamCount: number,
  segment: MontageProjectSegment,
): { filter: string } | null {
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
    const chain = [
      `atrim=start=${(track.startMs / 1_000).toFixed(3)}:end=${(track.endMs / 1_000).toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
    ];
    if (delayMs > 0) chain.push(`adelay=${delayMs}:all=1`);
    chain.push(`volume=${(track.level / 100).toFixed(2)}`);
    return `[0:a:${track.trackIndex}]${chain.join(',')}[montage-track-${index}]`;
  });
  const inputs = active.map((_track, index) => `[montage-track-${index}]`).join('');
  filters.push(active.length > 1
    ? `${inputs}amix=inputs=${active.length}:duration=longest:dropout_transition=0:normalize=1[montage-mix]`
    : `${inputs}anull[montage-mix]`);
  filters.push(`[montage-mix]apad=whole_dur=${segmentDurationSeconds.toFixed(3)},atrim=duration=${segmentDurationSeconds.toFixed(3)},aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`);
  return { filter: filters.join(';') };
}

export function buildShareAudioArguments(
  streamCount: number,
  bitrateKbps: number,
  levels: readonly number[] = [],
  trims: readonly (ClipAudioTrackTrim | null)[] = [],
  selectionStartMs = 0,
  selectionEndMs = Number.POSITIVE_INFINITY,
): string[] {
  if (streamCount <= 0) return ['-an'];
  const active = Array.from({ length: streamCount }, (_, trackIndex) => ({
    trackIndex,
    level: Math.min(100, Math.max(0, levels[trackIndex] ?? 100)),
    startMs: Math.max(selectionStartMs, trims[trackIndex]?.startMs ?? selectionStartMs),
    endMs: Math.min(selectionEndMs, trims[trackIndex]?.endMs ?? selectionEndMs),
  })).filter((track) => track.level > 0 && track.endMs > track.startMs);
  if (active.length === 0) return ['-an'];
  const hasTrackTrims = active.some((track) => track.startMs > selectionStartMs || track.endMs < selectionEndMs);
  if (active.length === 1 && active[0]!.level === 100 && !hasTrackTrims) {
    return ['-map', `0:a:${active[0]!.trackIndex}`, '-c:a', 'aac', '-b:a', `${bitrateKbps}k`];
  }

  const filters = active.map((track, index) => {
    const filtersForTrack: string[] = [];
    if (track.startMs > selectionStartMs || track.endMs < selectionEndMs) {
      const relativeStartSeconds = (track.startMs - selectionStartMs) / 1_000;
      const relativeEndSeconds = (track.endMs - selectionStartMs) / 1_000;
      filtersForTrack.push(`atrim=start=${relativeStartSeconds.toFixed(3)}:end=${relativeEndSeconds.toFixed(3)}`, 'asetpts=PTS-STARTPTS');
      const delayMs = Math.round(track.startMs - selectionStartMs);
      if (delayMs > 0) filtersForTrack.push(`adelay=${delayMs}:all=1`);
    }
    filtersForTrack.push(`volume=${(track.level / 100).toFixed(2)}`);
    return `[0:a:${track.trackIndex}]${filtersForTrack.join(',')}[track${index}]`;
  });
  const inputs = active.map((_track, index) => `[track${index}]`).join('');
  if (active.length > 1) {
    filters.push(`${inputs}amix=inputs=${active.length}:duration=longest:dropout_transition=0:normalize=1[aout]`);
  } else {
    filters.push(`${inputs}anull[aout]`);
  }
  return [
    '-filter_complex', filters.join(';'),
    '-map', '[aout]', '-c:a', 'aac', '-b:a', `${bitrateKbps}k`,
  ];
}

function audioChannelFromTitle(title: string | undefined): ClipAudioChannel | null {
  const normalized = title?.trim().toLocaleLowerCase();
  if (!normalized) return null;
  if (normalized.includes('microphone') || normalized === 'mic') return 'microphone';
  if (normalized.includes('chat')) return 'chat';
  if (normalized.includes('media')) return 'media';
  if (normalized.includes('game') || normalized.includes('system')) return 'game';
  return null;
}

export function audioStreamLabel(tags: AudioStreamTags | undefined): string | undefined {
  return [tags?.title, tags?.name, tags?.handler_name]
    .map((value) => value?.trim())
    .find((value) => value && value.toLocaleLowerCase() !== 'soundhandler');
}

function audioChannelLabel(channel: ClipAudioChannel): string {
  if (channel === 'microphone') return 'Microphone';
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

function parseRate(value: string | undefined): number {
  if (!value) return 0;
  const [numerator, denominator = '1'] = value.split('/');
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) ? Math.round(result * 1_000) / 1_000 : 0;
}

function readWaveformSamples(path: string, trackIndex: number, durationMs: number): Promise<number[]> {
  const executable = findExecutable('SWITCHBOARD_FFMPEG', 'ffmpeg');
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, [
      '-hide_banner', '-loglevel', 'error', '-i', path,
      '-map', `0:a:${trackIndex}`, '-vn', '-ac', '1', '-ar', String(waveformSampleRate),
      '-f', 's16le', 'pipe:1',
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const peaks = new Float32Array(waveformBucketCount);
    const expectedSamples = Math.max(1, Math.round(durationMs / 1_000 * waveformSampleRate));
    let sampleIndex = 0;
    let carry: Buffer | null = null;
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const bytes = carry ? Buffer.concat([carry, chunk]) : chunk;
      const evenLength = bytes.length - (bytes.length % 2);
      for (let offset = 0; offset < evenLength; offset += 2) {
        const bucket = Math.min(waveformBucketCount - 1, Math.floor(sampleIndex / expectedSamples * waveformBucketCount));
        const amplitude = Math.abs(bytes.readInt16LE(offset)) / 32_768;
        if (amplitude > peaks[bucket]!) peaks[bucket] = amplitude;
        sampleIndex += 1;
      }
      carry = evenLength < bytes.length ? bytes.subarray(evenLength) : null;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 16_384) stderr += chunk;
    });
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

export function buildClipVideoFilter(canvasSize: ClipCanvasSize): string {
  if (canvasSize === '9:16') {
    return "crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',scale=trunc(iw/2)*2:trunc(ih/2)*2";
  }
  return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
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
    const child = spawn(executable, arguments_, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr.trim() || `${executable} exited with code ${code}`));
    });
  });
}

function abortError(): Error {
  const error = new Error('Export cancelled.');
  error.name = 'AbortError';
  return error;
}
