import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, mkdir, opendir, rename, rm, stat } from 'node:fs/promises';
import { basename, delimiter, dirname, extname, join, parse, resolve } from 'node:path';
import type { Clip, ClipAudioChannel } from '../../shared/contracts';
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

export class ClipLibraryService {
  private thumbnailQueue: Promise<void> = Promise.resolve();

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
    if (clip.thumbnailPath) await rm(clip.thumbnailPath, { force: true });
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
      audioChannels: media.audioChannels,
    };
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

function audioChannelFromTitle(title: string | undefined): ClipAudioChannel | null {
  const normalized = title?.trim().toLocaleLowerCase();
  if (!normalized) return null;
  if (normalized.includes('microphone') || normalized === 'mic') return 'microphone';
  if (normalized.includes('chat')) return 'chat';
  if (normalized.includes('media')) return 'media';
  if (normalized.includes('game') || normalized.includes('system')) return 'game';
  return null;
}

function parseRate(value: string | undefined): number {
  if (!value) return 0;
  const [numerator, denominator = '1'] = value.split('/');
  const result = Number(numerator) / Number(denominator);
  return Number.isFinite(result) ? Math.round(result * 1_000) / 1_000 : 0;
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
