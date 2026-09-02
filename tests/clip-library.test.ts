import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Clip } from '../src/shared/contracts';
import { clipSchema, clipTrimInputSchema, exportClipInputSchema, setClipAudioTrackLevelInputSchema, setClipCanvasSizeInputSchema } from '../src/shared/contracts';
import {
  clipGameLabel,
  createDefaultClipTitle,
  filterAndSortClips,
  inferClipGame,
  normalizeClipRecord,
} from '../src/shared/clip-library';
import { StateStore } from '../src/main/services/state-store';
import { audioStreamLabel, buildClipVideoFilter, buildShareAudioArguments } from '../src/main/services/clip-library';

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
    canvasSize: 'original',
    ...overrides,
  };
}

describe('canonical clip metadata', () => {
  test('reads MP4 audio identities from the name tag used by Capture.Host', () => {
    expect(audioStreamLabel({ name: 'Game/System', handler_name: 'SoundHandler' })).toBe('Game/System');
    expect(audioStreamLabel({ name: 'Microphone', handler_name: 'SoundHandler' })).toBe('Microphone');
    expect(audioStreamLabel({ title: 'Processed Microphone', name: 'Microphone' })).toBe('Processed Microphone');
    expect(audioStreamLabel({ handler_name: 'SoundHandler' })).toBeUndefined();
  });

  test('adds durable favorite and title defaults to legacy clip records', () => {
    const parsed = clipSchema.parse({
      id: 'legacy', path: 'C:\\Clips\\Display1_2026-08-26_01-33-08.mp4', name: 'Display1_2026-08-26_01-33-08',
      createdAt: 1, durationMs: 30_000, fileSize: 2_000_000, width: 1_280, height: 720, fps: 60,
    });
    expect(parsed.favorite).toBeFalse();
    expect(parsed.titleEdited).toBeFalse();
    expect(parsed.canvasSize).toBe('original');
    expect(normalizeClipRecord(parsed).name).toBe('Desktop clip');
  });

  test('validates canvas size changes and builds a centered vertical export crop', () => {
    expect(setClipCanvasSizeInputSchema.parse({ id: 'clip-1', canvasSize: '9:16' }).canvasSize).toBe('9:16');
    expect(() => setClipCanvasSizeInputSchema.parse({ id: 'clip-1', canvasSize: 'square' })).toThrow();
    expect(buildClipVideoFilter('original')).toBe('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    expect(buildClipVideoFilter('9:16')).toContain("crop='if(gte(iw/ih,0.5625)");
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
        canvasSize: '9:16', audioTrackLevels: [100, 42], audioTrackTrims: [null, { startMs: 2_000, endMs: 8_500 }],
      })];
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    expect(restarted.get().clips[0]).toMatchObject({
      name: 'Downtown pursuit', favorite: true, titleEdited: true, trimStartMs: 1_250, trimEndMs: 9_000,
      canvasSize: '9:16', audioTrackLevels: [100, 42], audioTrackTrims: [null, { startMs: 2_000, endMs: 8_500 }],
    });
  });

  test('persists Auto Capture markers while legacy clips remain manual', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-auto-clips-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();
    first.update((draft) => {
      draft.clips = [
        clip(1, {
          autoCapture: {
            autoCaptured: true,
            providerId: 'cs2-gsi',
            gameId: 'cs2',
            events: [{ id: 'kill-1', type: 'headshot', timestampMs: 20_000, label: 'Headshot' }],
          },
        }),
        clip(2),
      ];
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    expect(restarted.get().clips[0]?.autoCapture?.events[0]).toMatchObject({ type: 'headshot', timestampMs: 20_000 });
    expect(restarted.get().clips[1]?.autoCapture).toBeUndefined();
  });

  test('validates saved trim ranges and file-size export presets at the shared boundary', () => {
    expect(clipTrimInputSchema.parse({ id: 'clip-1', startMs: 1_250, endMs: 9_000 })).toEqual({
      id: 'clip-1', startMs: 1_250, endMs: 9_000,
    });
    expect(() => clipTrimInputSchema.parse({ id: 'clip-1', startMs: 9_000, endMs: 1_250 })).toThrow();
    expect(clipTrimInputSchema.parse({
      id: 'clip-1', startMs: 1_250, endMs: 9_000, audioTrackTrims: [null, { startMs: 2_000, endMs: 8_500 }],
    }).audioTrackTrims?.[1]).toEqual({ startMs: 2_000, endMs: 8_500 });
    expect(() => clipTrimInputSchema.parse({
      id: 'clip-1', startMs: 1_250, endMs: 9_000, audioTrackTrims: [{ startMs: 8_500, endMs: 2_000 }],
    })).toThrow();
    expect(exportClipInputSchema.parse({ id: 'clip-1', startMs: 0, endMs: 10_000, preset: '10mb' }).preset).toBe('10mb');
    expect(() => exportClipInputSchema.parse({ id: 'clip-1', startMs: 0, endMs: 10_000, preset: '5mb' })).toThrow();
    expect(setClipAudioTrackLevelInputSchema.parse({ id: 'clip-1', trackIndex: 1, level: 42 })).toEqual({
      id: 'clip-1', trackIndex: 1, level: 42,
    });
    expect(() => setClipAudioTrackLevelInputSchema.parse({ id: 'clip-1', trackIndex: 8, level: 42 })).toThrow();
    expect(() => setClipAudioTrackLevelInputSchema.parse({ id: 'clip-1', trackIndex: 1, level: 101 })).toThrow();
  });

  test('builds an explicit gain-aware share mix and drops muted tracks', () => {
    const mixed = buildShareAudioArguments(3, 96, [100, 42, 0]);
    const filter = mixed[mixed.indexOf('-filter_complex') + 1]!;
    expect(filter).toContain('[0:a:0]volume=1.00[track0]');
    expect(filter).toContain('[0:a:1]volume=0.42[track1]');
    expect(filter).not.toContain('0:a:2');
    expect(filter).toContain('amix=inputs=2');
    expect(buildShareAudioArguments(2, 96, [0, 0])).toEqual(['-an']);
    expect(buildShareAudioArguments(2, 96, [0, 100])).toContain('0:a:1');
  });

  test('builds independently trimmed and timeline-aligned audio tracks', () => {
    const mixed = buildShareAudioArguments(
      2,
      96,
      [100, 75],
      [{ startMs: 3_000, endMs: 8_000 }, { startMs: 5_000, endMs: 10_000 }],
      2_000,
      11_000,
    );
    const filter = mixed[mixed.indexOf('-filter_complex') + 1]!;
    expect(filter).toContain('[0:a:0]atrim=start=1.000:end=6.000,asetpts=PTS-STARTPTS,adelay=1000:all=1,volume=1.00[track0]');
    expect(filter).toContain('[0:a:1]atrim=start=3.000:end=8.000,asetpts=PTS-STARTPTS,adelay=3000:all=1,volume=0.75[track1]');
    expect(filter).toContain('amix=inputs=2:duration=longest');
    expect(buildShareAudioArguments(1, 96, [100], [{ startMs: 0, endMs: 1_000 }], 2_000, 3_000)).toEqual(['-an']);
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

  test('filters manual and Auto Capture clips by source and event', () => {
    const auto = clip(500, {
      autoCapture: {
        autoCaptured: true,
        providerId: 'cs2-gsi',
        gameId: 'cs2',
        events: [{ id: 'round-1', type: 'round_win', timestampMs: 9_000, label: 'Round win' }],
      },
    });
    const mixed = [clip(501), auto];
    expect(filterAndSortClips(mixed, { query: '', game: 'all', date: 'any', source: 'manual', event: 'all', favoritesOnly: false, sort: 'newest' }).map((entry) => entry.id)).toEqual(['clip-501']);
    expect(filterAndSortClips(mixed, { query: '', game: 'all', date: 'any', source: 'auto-capture', event: 'round_win', favoritesOnly: false, sort: 'newest' }).map((entry) => entry.id)).toEqual(['clip-500']);
    expect(filterAndSortClips(mixed, { query: '', game: 'all', date: 'any', source: 'auto-capture', event: 'death', favoritesOnly: false, sort: 'newest' })).toEqual([]);
  });
});
