import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clip } from '../src/shared/contracts';
import { clipSchema, clipTrimInputSchema, exportClipInputSchema } from '../src/shared/contracts';
import {
  clipGameLabel,
  createDefaultClipTitle,
  filterAndSortClips,
  inferClipGame,
  normalizeClipRecord,
} from '../src/shared/clip-library';
import { StateStore } from '../src/main/services/state-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function clip(index: number, overrides: Partial<Clip> = {}): Clip {
  return {
    id: `clip-${index}`,
    path: `C:\\Clips\\FiveM_2026-08-26_01-33-${String(index % 60).padStart(2, '0')}.mp4`,
    name: `FiveM clip ${index}`,
    game: index % 2 === 0 ? 'FiveM' : 'War Thunder',
    createdAt: Date.UTC(2026, 7, 26, 6, 0) - index * 60_000,
    durationMs: 15_000 + index * 1_000,
    fileSize: 1_000_000 + index * 50_000,
    width: 2_560,
    height: 1_440,
    fps: 60,
    codec: 'h264',
    favorite: index % 5 === 0,
    titleEdited: false,
    ...overrides,
  };
}

describe('canonical clip metadata', () => {
  test('adds durable favorite and title defaults to legacy clip records', () => {
    const parsed = clipSchema.parse({
      id: 'legacy', path: 'C:\\Clips\\Display1_2026-08-26_01-33-08.mp4', name: 'Display1_2026-08-26_01-33-08',
      createdAt: 1, durationMs: 30_000, fileSize: 2_000_000, width: 1_280, height: 720, fps: 60,
    });
    expect(parsed.favorite).toBeFalse();
    expect(parsed.titleEdited).toBeFalse();
    expect(normalizeClipRecord(parsed).name).toBe('Desktop clip');
  });

  test('keeps custom names and infers generated game identity without exposing filenames', () => {
    expect(inferClipGame('FiveM_2026-08-26_01-33-08')).toBe('FiveM');
    expect(inferClipGame('Display1_2026-08-26_01-33-08')).toBeUndefined();
    expect(createDefaultClipTitle('War Thunder')).toBe('War Thunder clip');
    expect(clipGameLabel(clip(1, { game: undefined }))).toBe('FiveM');
    expect(normalizeClipRecord(clip(1, { name: 'Downtown pursuit', titleEdited: true })).name).toBe('Downtown pursuit');
  });

  test('persists favorite and renamed display metadata across a store restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-clips-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();
    first.update((draft) => {
      draft.clips = [clip(1, {
        name: 'Downtown pursuit', favorite: true, titleEdited: true, trimStartMs: 1_250, trimEndMs: 9_000,
      })];
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    expect(restarted.get().clips[0]).toMatchObject({
      name: 'Downtown pursuit', favorite: true, titleEdited: true, trimStartMs: 1_250, trimEndMs: 9_000,
    });
  });

  test('validates saved trim ranges and file-size export presets at the shared boundary', () => {
    expect(clipTrimInputSchema.parse({ id: 'clip-1', startMs: 1_250, endMs: 9_000 })).toEqual({
      id: 'clip-1', startMs: 1_250, endMs: 9_000,
    });
    expect(() => clipTrimInputSchema.parse({ id: 'clip-1', startMs: 9_000, endMs: 1_250 })).toThrow();
    expect(exportClipInputSchema.parse({ id: 'clip-1', startMs: 0, endMs: 10_000, preset: '10mb' }).preset).toBe('10mb');
    expect(() => exportClipInputSchema.parse({ id: 'clip-1', startMs: 0, endMs: 10_000, preset: '5mb' })).toThrow();
  });
});

describe('large clip library filtering and sorting', () => {
  const clips = Array.from({ length: 240 }, (_, index) => clip(index));

  test('filters hundreds of records by favorite, game, date text, and title', () => {
    const favorites = filterAndSortClips(clips, { query: '', game: 'FiveM', date: 'any', favoritesOnly: true, sort: 'newest' });
    expect(favorites.length).toBe(24);
    expect(favorites.every((entry) => entry.favorite && entry.game === 'FiveM')).toBeTrue();

    const title = filterAndSortClips(clips, { query: 'clip 137', game: 'all', date: 'any', favoritesOnly: false, sort: 'newest' });
    expect(title.map((entry) => entry.id)).toEqual(['clip-137']);

    const dateText = new Date(clips[0]!.createdAt).toLocaleDateString();
    expect(filterAndSortClips(clips, { query: dateText, game: 'all', date: 'any', favoritesOnly: false, sort: 'newest' }).length).toBeGreaterThan(0);
  });

  test('supports all required sort orders without mutating canonical order', () => {
    const canonicalFirst = clips[0]!.id;
    const shortest = filterAndSortClips(clips, { query: '', game: 'all', date: 'any', favoritesOnly: false, sort: 'shortest' });
    const largest = filterAndSortClips(clips, { query: '', game: 'all', date: 'any', favoritesOnly: false, sort: 'largest' });
    expect(shortest[0]!.durationMs).toBeLessThan(shortest.at(-1)!.durationMs);
    expect(largest[0]!.fileSize).toBeGreaterThan(largest.at(-1)!.fileSize);
    expect(clips[0]!.id).toBe(canonicalFirst);
  });
});
