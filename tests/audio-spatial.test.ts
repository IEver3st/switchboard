import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioStateSchema, setSpatialAudioInputSchema, spatialAnyEnabled, spatialSettingsSchema, type AudioHostSnapshot } from '../src/shared/contracts';
import { defaultAudio } from '../src/shared/defaults';
import { AudioConfiguration, applyAudioPreferenceChanges, assertAudioConfigurationApplied } from '../src/main/services/audio-configuration';
import { StateStore } from '../src/main/services/state-store';

test('spatial migration is off and narrow patches cannot reset other settings', () => {
  const { spatial: _, ...legacy } = defaultAudio;
  expect(audioStateSchema.parse(legacy).spatial).toEqual(spatialSettingsSchema.parse({}));
  expect(setSpatialAudioInputSchema.parse({ channel: 'game', stage: { enabled: true } })).toEqual({ channel: 'game', stage: { enabled: true } });
  const speaker = defaultAudio.spatial.channels.game.speakers[0];
  for (const patch of [
    { stage: { enabled: true } }, { channel: 'aux', stage: { enabled: true } },
    { channel: 'game', stage: { widthDegrees: NaN } }, { channel: 'game', stage: { amount: 2 } }, { channel: 'game', stage: { mode: '7.1' } },
    { channel: 'game', stage: { distance: 0 } }, { channel: 'game', stage: { immersion: NaN } }, { channel: 'game', stage: { speakers: [] } },
    { channel: 'game', stage: { speakers: Array(7).fill(speaker) } }, { channel: 'game', stage: { trackingEnabled: true } },
    { trackerPort: 80 }, { trackerPort: 4242.5 }, { host: '0.0.0.0' }, { trackingSource: 'automatic-fake' }, { enabled: true },
  ]) {
    expect(setSpatialAudioInputSchema.safeParse(patch).success).toBe(false);
  }
});

test('the earlier single global stage migrates to every channel', () => {
  const migrated = spatialSettingsSchema.parse({ enabled: true, mode: 'stereo', widthDegrees: 110, immersion: .9, trackingEnabled: true, trackerPort: 4250 });
  for (const channel of ['game', 'chat', 'media'] as const) {
    expect(migrated.channels[channel]).toMatchObject({ enabled: true, mode: 'stereo', widthDegrees: 110, immersion: .9 });
  }
  expect(migrated.trackingEnabled).toBe(true);
  expect(migrated.trackerPort).toBe(4250);
  migrated.channels.game.widthDegrees = 40;
  expect(migrated.channels.chat.widthDegrees).toBe(110);
});

function runtime(audio = defaultAudio): AudioHostSnapshot {
  // Only fields read by this boundary are needed; native snapshot parsing is tested separately.
  return { running: true, capabilities: { ...audio.capabilities, spatialAudio: 'available' },
    spatial: { settings: structuredClone(audio.spatial), active: spatialAnyEnabled(audio.spatial), trackingState: 'off', error: null },
  } as AudioHostSnapshot;
}

test('running spatial edits require native readback, availability and active DSP', async () => {
  const state = audioStateSchema.parse(defaultAudio); state.enabled = true;
  let reject = true;
  const requests: boolean[] = [];
  const queue = new AudioConfiguration({
    read: () => structuredClone(state),
    configure: async next => { requests.push(next.spatial.channels.game.enabled); return reject ? runtime(state) : runtime(next); },
    commit: (before, next) => applyAudioPreferenceChanges(state, before, next), publish: () => {},
  });
  await expect(queue.update(audio => { audio.spatial.channels.game.enabled = true; })).rejects.toThrow('not accepted');
  expect(state.spatial.channels.game.enabled).toBe(false);
  expect(requests).toEqual([true, false]);
  reject = false;
  await queue.update(audio => { audio.spatial.channels.media.enabled = true; audio.spatial.channels.media.widthDegrees = 120; });
  expect(state.spatial.channels.media.widthDegrees).toBe(120);
  expect(state.spatial.channels.game.enabled).toBe(false);
  const next = structuredClone(state); next.spatial.channels.media.amount = .5;
  const host = runtime(next); host.spatial!.active = false;
  expect(() => assertAudioConfigurationApplied(state, next, host)).toThrow('not accepted');
  host.spatial = undefined;
  expect(() => assertAudioConfigurationApplied(state, next, host)).toThrow('not accepted');
});

test('spatial preferences persist through restart without persisting a tracking connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'switchboard-spatial-'));
  try {
    const path = join(directory, 'state.json');
    const store = new StateStore(path); await store.load();
    store.updateBranches(['audio'], draft => {
      draft.audio.spatial = { ...draft.audio.spatial, trackingEnabled: true, trackingSource: 'headset', trackerPort: 4250 };
      draft.audio.spatial.channels.game = { ...draft.audio.spatial.channels.game, enabled: true, widthDegrees: 110, amount: .8, immersion: .9, distance: 2.2 };
      draft.audio.spatial.channels.chat.speakers[5] = { ...draft.audio.spatial.channels.chat.speakers[5]!, azimuth: -125, elevation: 35, distance: 1.8, gainDb: -4, enabled: false };
    });
    await store.flush();
    const restarted = new StateStore(path); await restarted.load();
    expect(restarted.get().audio.spatial).toEqual(store.get().audio.spatial);
    expect(restarted.get().audio.spatial.channels.media.enabled).toBe(false);
    expect(restarted.get().audio.host).toBeNull();
    expect(restarted.get().audio.capabilities.spatialAudio).toBe('unavailable');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
