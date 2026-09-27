import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clipSchema, type Clip } from '../src/shared/contracts';
import { ClipLibraryService, mergeReconciledClips, registerSavedClip } from '../src/main/services/clip-library';

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

test('a scan that discovers the MP4 before the save response leaves one canonical clip', () => {
  const saved = clip('save-response', join(tmpdir(), 'replay.mp4'));
  const discovered = { ...saved, id: 'scan-result', path: saved.path.toUpperCase(), createdAt: 83,
    favorite: true, titleEdited: true, name: 'My moment', trimStartMs: 100,
    thumbnailPath: 'scan-result.v2.jpg' };
  const clips = mergeReconciledClips([], [], [discovered]);
  const canonical = registerSavedClip(clips, saved);
  expect(clips).toHaveLength(1);
  expect(canonical).toBe(clips[0]!);
  expect(canonical).toMatchObject(discovered);
  expect(clips.reduce((sum, item) => sum + item.fileSize, 0)).toBe(saved.fileSize);
});

test('a save response before the scan keeps its identity and allows later distinct saves', () => {
  const saved = clip('save-response');
  const clips: Clip[] = [];
  expect(registerSavedClip(clips, saved)).toBe(saved);
  const merged = mergeReconciledClips([], clips, [{ ...saved, id: 'scan-result' }]);
  expect(merged).toEqual([saved]);
  registerSavedClip(merged, clip('next-save'));
  expect(merged.map(item => item.id)).toEqual(['next-save', 'save-response']);
});

test('a discovered Auto Capture clip receives event metadata without replacing its identity', () => {
  const saved = clipSchema.parse({ ...clip('save-response'), name: 'Round won', game: 'Counter-Strike 2',
    autoCapture: { autoCaptured: true, providerId: 'cs2', gameId: 'cs2',
      events: [{ id: 'round-won', type: 'round_win', timestampMs: 500 }] } });
  const discovered = { ...clip('scan-result', saved.path), name: 'Imported clip' };
  const clips = [discovered];
  const canonical = registerSavedClip(clips, saved);
  expect(clips).toHaveLength(1);
  expect(canonical).toMatchObject({ id: discovered.id, name: saved.name,
    game: saved.game, autoCapture: saved.autoCapture });
});

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
  expect(mergeReconciledClips([edited], [{ ...edited, path: 'relocated.mp4' }], []))
    .toMatchObject([{ ...edited, path: 'relocated.mp4' }]);
});


test('all deleted clips disappear while surviving files remain', async () => {
  const { directory, service } = await fixture();
  const indexed = ['deleted-a', 'deleted-b', 'kept'].map(id => clip(id, join(directory, `${id}.mp4`)));
  await Promise.all(indexed.map(item => writeFile(item.path, 'fixture')));
  expect(await service.reconcile(indexed, directory)).toHaveLength(3);
  await Promise.all(indexed.slice(0, 2).map(item => rm(item.path)));
  expect((await service.reconcile(indexed, directory)).map(item => item.id)).toEqual(['kept']);
});

test('folder changes remove deleted clips without a manual refresh and pause in the tray', async () => {
  const { directory, service } = await fixture();
  const path = join(directory, 'watched.mp4');
  await writeFile(path, 'fixture');
  const original = clip('watched', path);
  const first = Promise.withResolvers<Clip[]>();
  const second = Promise.withResolvers<void>();
  let changes = 0;
  service.watchDirectory(directory, () => {
    changes += 1;
    if (changes === 1) void service.reconcile([original], directory).then(first.resolve, first.reject);
    else second.resolve();
  });
  await rm(path);
  expect(await first.promise).toEqual([]);
  service.setBackgroundWorkActive(false);
  await writeFile(join(directory, 'while-hidden.mp4'), 'fixture');
  await tick();
  expect(changes).toBe(1);
  service.setBackgroundWorkActive(true);
  await rm(join(directory, 'while-hidden.mp4'));
  await second.promise;
  expect(changes).toBe(2);
}, 5_000);

test('unavailable folders retain identity and metadata, then recover when the drive returns', async () => {
  const { directory, service } = await fixture();
  const offline = join(directory, 'temporarily-offline');
  const path = join(offline, 'clip.mp4');
  const original = { ...clip('retained', path), favorite: true, titleEdited: true, name: 'My moment', trimStartMs: 100 };
  const unavailable = await service.reconcile([original], offline);
  expect(unavailable).toHaveLength(1);
  expect(unavailable[0]).toMatchObject({ ...original, availability: 'unavailable' });
  expect(service.needsEnrichment(unavailable[0]!)).toBeFalse();
  await mkdir(offline);
  await writeFile(path, 'fixture');
  const restored = await service.reconcile(unavailable, offline);
  expect(restored[0]).toMatchObject({ ...original, availability: 'available' });
});

test('an offline library folder does not discard clip records', async () => {
  const { directory, service } = await fixture();
  const offline = join(directory, 'offline');
  const original = clip('offline-clip', join(offline, 'clip.mp4'));
  expect(await service.reconcile([original], offline)).toEqual([{ ...original, availability: 'unavailable' }]);
});
