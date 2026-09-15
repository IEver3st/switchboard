import { randomUUID } from 'node:crypto';
import { mkdir, open, rm, statfs } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CaptureStorage } from '../../shared/contracts';

const GIB = 1024 ** 3;

export type CapturePaths = {
  clipsDirectory: string;
  cacheDirectory: string;
  thumbnailDirectory: string;
};

export class CaptureStorageService {
  public constructor(
    private readonly videosDirectory: string,
    private readonly userDataDirectory: string,
  ) {}

  public getDefaultClipsDirectory(): string {
    return join(this.videosDirectory, 'Switchboard', 'Clips');
  }

  public resolvePaths(customDirectory: string | null, replayCacheDirectory?: string | null): CapturePaths {
    return {
      clipsDirectory: resolve(customDirectory ?? this.getDefaultClipsDirectory()),
      cacheDirectory: replayCacheDirectory ? resolve(replayCacheDirectory) : join(this.userDataDirectory, 'cache', 'replay'),
      thumbnailDirectory: join(this.userDataDirectory, 'cache', 'thumbnails'),
    };
  }

  public async validate(customDirectory: string | null, replayCacheDirectory?: string | null): Promise<CapturePaths> {
    const paths = this.resolvePaths(customDirectory, replayCacheDirectory);
    await Promise.all([
      this.assertWritableDirectory(paths.clipsDirectory),
      this.assertWritableDirectory(paths.cacheDirectory),
      this.assertWritableDirectory(paths.thumbnailDirectory),
    ]);
    return paths;
  }

  public async getStorageStatus(paths: CapturePaths, clipsBytes: number, replayCacheBytes: number): Promise<CaptureStorage> {
    const probe = async (path: string) => {
      try { const stats = await statfs(path, { bigint: true }); return { free: Number(stats.bavail * stats.bsize), total: Number(stats.blocks * stats.bsize) }; }
      catch { return null; }
    };
    const [cache, clips] = await Promise.all([probe(paths.cacheDirectory), probe(paths.clipsDirectory)]);
    return { clipsDirectory: paths.clipsDirectory, cacheDirectory: paths.cacheDirectory,
      clipsBytes, replayCacheBytes, ...storageCapacityStatus(clips, cache) };
  }

  public async assertWritableDirectory(directory: string): Promise<void> {
    await mkdir(directory, { recursive: true });
    const testPath = join(directory, `.switchboard-write-test-${randomUUID()}.tmp`);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(testPath, 'wx');
      await file.write('Switchboard storage check');
      await file.sync();
    } finally {
      await file?.close();
      await rm(testPath, { force: true });
    }
  }
}

export function storageCapacityStatus(clips: { free: number; total: number } | null, cache: { free: number; total: number } | null) {
  const clipsProblem = !clips || clips.free < 5 * GIB;
  const cacheProblem = !cache || cache.free < 5 * GIB;
  const storageProblem = clipsProblem && cacheProblem ? 'both' as const : clipsProblem ? 'clips' as const : cacheProblem ? 'cache' as const : null;
  const criticalSpace = !clips || !cache || Math.min(clips.free, cache.free) < GIB;
  const lowSpace = clipsProblem || cacheProblem;
  const location = storageProblem === 'both' ? 'Saved clips and replay cache' : storageProblem === 'cache' ? 'Replay cache' : 'Saved clips';
  const warning = !clips || !cache ? `${location} storage is unavailable. Reconnect the drive or choose another location.`
    : criticalSpace ? `${location} storage is critically low. Free space or choose another location.`
    : lowSpace ? `${location} storage is running low.` : undefined;
  return { availableBytes: clips && cache ? Math.min(clips.free, cache.free) : 0,
    volumeTotalBytes: clips?.total ?? 0, volumeAvailableBytes: clips?.free ?? 0,
    cacheAvailableBytes: cache?.free ?? null, cacheTotalBytes: cache?.total ?? null,
    storageProblem, criticalSpace, lowSpace, ...(warning ? { warning } : {}) };
}
