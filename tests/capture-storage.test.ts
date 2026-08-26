import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CaptureStorageService } from '../src/main/services/capture-storage';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'switchboard-storage-'));
  temporaryRoots.push(root);
  return {
    root,
    service: new CaptureStorageService(join(root, 'Videos'), join(root, 'UserData')),
  };
}

describe('capture storage configuration', () => {
  test('creates the OS-aware default Clips folder and cache folders', async () => {
    const { root, service } = await fixture();
    const paths = await service.validate(null);
    expect(paths.clipsDirectory).toBe(join(root, 'Videos', 'Switchboard', 'Clips'));
    expect(paths.cacheDirectory).toBe(join(root, 'UserData', 'cache', 'replay'));
  });

  test('accepts and preserves a writable custom folder', async () => {
    const { root, service } = await fixture();
    const custom = join(root, 'External Clips');
    expect((await service.validate(custom)).clipsDirectory).toBe(custom);
  });

  test('rejects a path occupied by a file', async () => {
    const { root, service } = await fixture();
    const invalid = join(root, 'not-a-directory');
    await writeFile(invalid, 'occupied');
    await expect(service.validate(invalid)).rejects.toThrow();
  });

  test('recreates a missing previously selected folder', async () => {
    const { root, service } = await fixture();
    const missing = join(root, 'removed', 'Clips');
    expect((await service.validate(missing)).clipsDirectory).toBe(missing);
  });

  test('reports real capacity for the selected Clips volume', async () => {
    const { service } = await fixture();
    const paths = await service.validate(null);
    const status = await service.getStorageStatus(paths, 12_345, 6_789);
    expect(status.volumeTotalBytes).toBeGreaterThan(0);
    expect(status.volumeAvailableBytes).toBeGreaterThan(0);
    expect(status.volumeAvailableBytes).toBeLessThanOrEqual(status.volumeTotalBytes);
    expect(status.clipsBytes).toBe(12_345);
  });
});
