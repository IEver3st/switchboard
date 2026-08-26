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

  public resolvePaths(customDirectory: string | null): CapturePaths {
    return {
      clipsDirectory: resolve(customDirectory ?? this.getDefaultClipsDirectory()),
      cacheDirectory: join(this.userDataDirectory, 'cache', 'replay'),
      thumbnailDirectory: join(this.userDataDirectory, 'cache', 'thumbnails'),
    };
  }

  public async validate(customDirectory: string | null): Promise<CapturePaths> {
    const paths = this.resolvePaths(customDirectory);
    await Promise.all([
      this.assertWritableDirectory(paths.clipsDirectory),
      this.assertWritableDirectory(paths.cacheDirectory),
      this.assertWritableDirectory(paths.thumbnailDirectory),
    ]);
    return paths;
  }

  public async getStorageStatus(paths: CapturePaths, clipsBytes: number, replayCacheBytes: number): Promise<CaptureStorage> {
    let availableBytes = 0;
    let warning: string | undefined;
    try {
      const stats = await statfs(paths.cacheDirectory, { bigint: true });
      availableBytes = Number(stats.bavail * stats.bsize);
    } catch (error) {
      warning = `Storage is unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
    const lowSpace = availableBytes > 0 && availableBytes < 5 * GIB;
    const criticalSpace = availableBytes > 0 && availableBytes < GIB;
    if (!warning && criticalSpace) warning = 'Storage is critically low. Instant Replay cannot safely write new data.';
    else if (!warning && lowSpace) warning = 'Storage is running low.';
    return {
      clipsDirectory: paths.clipsDirectory,
      cacheDirectory: paths.cacheDirectory,
      availableBytes,
      clipsBytes,
      replayCacheBytes,
      lowSpace,
      criticalSpace,
      ...(warning ? { warning } : {}),
    };
  }

  private async assertWritableDirectory(directory: string): Promise<void> {
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
