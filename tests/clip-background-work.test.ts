import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clip } from '../src/shared/contracts';
import { ClipLibraryService, mergeReconciledClips } from '../src/main/services/clip-library';

const directories: string[] = [];
const services: ClipLibraryService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.dispose()));
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
function clip(id: string, path = `${id}.mp4`): Clip {
  return { id, path, name: id, createdAt: 1, durationMs: 1000, fileSize: 10,
    width: 1920, height: 1080, fps: 60, favorite: false, titleEdited: false,
    canvasSize: 'original', audioChannels: [] };
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'switchboard-background-'));
  directories.push(directory);
  const service = new ClipLibraryService(directory);
  services.push(service);
  return { directory, service };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

test('tray pauses between media probes and resumes without losing discovered clips', async () => {
  const { directory, service } = await fixture();
  await writeFile(join(directory, 'a.mp4'), 'fixture');
  await writeFile(join(directory, 'b.mp4'), 'fixture');
  const firstProbe = Promise.withResolvers<void>();
  const probe = spyOn(service, 'createClipFromFile').mockImplementation(async path => {
    service.setBackgroundWorkActive(false);
    firstProbe.resolve();
    return clip(path, path);
  });
  const scan = service.reconcile([], directory);
  await firstProbe.promise;
  await tick();
  expect(probe).toHaveBeenCalledTimes(1);
  service.setBackgroundWorkActive(true);
  expect(await scan).toHaveLength(2);
  expect(probe).toHaveBeenCalledTimes(2);
});

test('paused thumbnail work resumes and shutdown settles paused scans', async () => {
  const { directory, service } = await fixture();
  const saved = { ...clip('saved'), thumbnailPath: join(directory, 'saved.v2.jpg') };
  await writeFile(saved.thumbnailPath, 'fixture');
  service.setBackgroundWorkActive(false);
  const ready: unknown[] = [];
  const resumed = Promise.withResolvers<void>();
  service.enqueueThumbnail(saved, value => { ready.push(value); resumed.resolve(); });
  await tick();
  expect(ready).toHaveLength(0);
  service.setBackgroundWorkActive(true);
  await resumed.promise;
  service.setBackgroundWorkActive(false);
  const scan = service.reconcile([], directory);
  const rejected = scan.then(() => null, error => error);
  service.enqueueThumbnail(saved, value => ready.push(value));
  await service.dispose();
  expect((await rejected)?.name).toBe('AbortError');
  expect(ready).toHaveLength(1);
});

test('a resumed scan preserves saves, edits and deletions made while paused', () => {
  const edited = clip('edited');
  const deleted = clip('deleted');
  const missing = clip('missing');
  const saved = clip('saved');
  const imported = clip('imported');
  const actual = mergeReconciledClips([edited, deleted, missing],
    [{ ...edited, favorite: true, name: 'Renamed' }, missing, saved],
    [edited, deleted, imported, { ...saved, id: 'discovered-duplicate' }]);
  expect(actual.map(item => item.id).sort()).toEqual(['edited', 'imported', 'saved']);
  expect(actual.find(item => item.id === 'edited')).toMatchObject({ favorite: true, name: 'Renamed' });
});
