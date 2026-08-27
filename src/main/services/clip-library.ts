import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, mkdir, opendir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, extname, join, parse, resolve } from 'node:path';
import type { Clip, ClipAudioChannel, ClipAudioWaveform, ClipAudioWaveformTrack, ClipCanvasSize, ExportClipInput } from '../../shared/contracts';
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

  public async renderExport(clip: Clip, destination: string, input: ExportClipInput): Promise<void> {
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
    const audioMixChanged = audioLevels.some((level) => level !== 100);
    if (input.preset === 'original' && !audioMixChanged) {
      await run(executable, [
        ...common, '-map', '0:a?', ...video, '-crf', '18', '-c:a', 'aac', '-b:a', '160k',
        '-movflags', '+faststart', '-y', destination,
      ]);
      return;
    }

    if (input.preset === 'original') {
      const audioStreams = await this.getAudioStreams(clip.path);
      const audioArguments = buildShareAudioArguments(audioStreams.length, 160, audioLevels);
      await run(executable, [
        ...common, ...audioArguments, ...video, '-crf', '18',
        '-movflags', '+faststart', '-y', destination,
      ]);
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
      ]);

      const audioStreams = await this.getAudioStreams(clip.path);
      const audioArguments = buildShareAudioArguments(audioStreams.length, audioKbps, audioLevels);
      await run(executable, [
        ...common, ...audioArguments, ...video, '-b:v', `${videoKbps}k`, '-pass', '2', '-passlogfile', passLog,
        '-movflags', '+faststart', '-y', destination,
      ]);
    } finally {
      await Promise.all([
        rm(`${passLog}-0.log`, { force: true }),
        rm(`${passLog}-0.log.mbtree`, { force: true }),
      ]);
    }
  }

  private async probe(path: string): Promise<ProbeResult> {
    const executable = findExecutable('SWITCHBOARD_FFPROBE', 'ffprobe');
    const output = await run(executable, [
      '-v', 'error', '-print_format', 'json', '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate:stream_tags=title', path,
    ]);
    const parsed = JSON.parse(output) as {
      format?: { duration?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
        tags?: { title?: string };
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
        .map((stream) => audioChannelFromTitle(stream.tags?.title))
        .filter((channel): channel is ClipAudioChannel => channel !== null))],
    };
  }

  private async getAudioStreams(path: string): Promise<AudioStreamInfo[]> {
    const executable = findExecutable('SWITCHBOARD_FFPROBE', 'ffprobe');
    const output = await run(executable, [
      '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index:stream_tags=title', '-of', 'json', path,
    ]);
    const parsed = JSON.parse(output) as { streams?: Array<{ tags?: { title?: string } }> };
    return (parsed.streams ?? []).slice(0, 8).map((stream, trackIndex) => {
      const title = stream.tags?.title?.trim();
      return {
        trackIndex,
        label: title || `Audio ${trackIndex + 1}`,
        channel: audioChannelFromTitle(title),
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

export function buildShareAudioArguments(streamCount: number, bitrateKbps: number, levels: readonly number[] = []): string[] {
  if (streamCount <= 0) return ['-an'];
  const active = Array.from({ length: streamCount }, (_, trackIndex) => ({
    trackIndex,
    level: Math.min(100, Math.max(0, levels[trackIndex] ?? 100)),
  })).filter((track) => track.level > 0);
  if (active.length === 0) return ['-an'];
  if (active.length === 1 && active[0]!.level === 100) {
    return ['-map', `0:a:${active[0]!.trackIndex}`, '-c:a', 'aac', '-b:a', `${bitrateKbps}k`];
  }

  const filters = active.map((track, index) => (
    `[0:a:${track.trackIndex}]volume=${(track.level / 100).toFixed(2)}[track${index}]`
  ));
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

function run(executable: string, arguments_: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, arguments_, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
