// Real manifest persistence with an isolated profile and clock, no media host.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from 'bun:test';
import { montageDraftRetentionMs, montageProjectV2Schema } from '../src/shared/montage-v2';

const profile = await mkdtemp(join(tmpdir(), 'switchboard-draft-retention-'));
mock.module('electron', () => ({ app: { getPath: () => profile }, dialog: {}, shell: {} }));
const { MontageV2Service } = await import('../src/main/services/montage-v2');
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const project = (name: string, single = false) => montageProjectV2Schema.parse({
  schemaVersion: 2, type: 'montage', id: randomUUID(), name,
  ...(single ? { sourceClipId: 'clip-a' } : {}),
  createdAt: now, updatedAt: now, durationMs: 1_000, canvasSize: 'original',
  segments: [{ id: randomUUID(), clipId: 'clip-a', sourceDurationMs: 1_000, trimStartMs: 0, trimEndMs: 1_000 }],
});
let service = new MontageV2Service();
const manifestPath = join(profile, 'montage-v2', 'manifest.json');
const manifest = async () => JSON.parse(await readFile(manifestPath, 'utf8'));
try {
  const clipEdit = await service.saveDraft(project('Clip edit', true));
  const montage = await service.saveDraft(project('Montage'));
  const source = join(profile, 'source-media-marker');
  const music = join(profile, 'montage-v2', 'audio', 'music-marker');
  await writeFile(source, 'Original clip remains');
  await writeFile(music, 'Imported audio remains');
  now += montageDraftRetentionMs - 1;
  assert.equal((await service.listDrafts()).length, 2, 'Both kinds remain for the full three hours');
  const renewed = await service.saveDraft({ ...clipEdit, name: 'Renewed edit' });
  assert.equal(renewed.updatedAt, now, 'The service owns the save timestamp');
  now++;
  service.dispose();
  service = new MontageV2Service();
  assert.deepEqual((await service.listDrafts()).map(draft => draft.id), [clipEdit.id], 'Restart prunes expired drafts and retains a renewed draft');
  assert.deepEqual((await manifest()).drafts.map((draft: any) => draft.id), [clipEdit.id], 'Expiration is persisted to disk');
  assert.equal(await readFile(source, 'utf8'), 'Original clip remains');
  assert.equal(await readFile(music, 'utf8'), 'Imported audio remains');

  now = renewed.updatedAt + montageDraftRetentionMs;
  const next = project('Next edit', true);
  await Promise.all([service.listDrafts(), service.saveDraft(next)]);
  assert.deepEqual((await service.listDrafts()).map(draft => draft.id), [next.id], 'Concurrent expiry and autosave preserve the new draft');
  now += montageDraftRetentionMs;
  assert.deepEqual(await service.listDrafts(), [], 'An open session expires drafts exactly at three hours');
  assert.deepEqual((await manifest()).drafts, []);
  service.dispose();
  service = new MontageV2Service();
  assert.deepEqual(await service.listDrafts(), [], 'Expired drafts do not return after restart');
  // An open editor can autosave again even if its previous saved copy expired.
  const reopened = await service.saveDraft(montage);
  assert.equal(reopened.updatedAt, now);
  assert.equal((await service.listDrafts()).length, 1);
  console.log(`Draft retention passed: exact expiry, renewal, restart, concurrent autosave, and media preservation. Fixture: ${profile}`);
} finally {
  service.dispose();
  Date.now = realNow;
}
