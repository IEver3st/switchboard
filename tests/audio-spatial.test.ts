import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioStateSchema, setSpatialAudioInputSchema, spatialSettingsSchema, type AudioHostSnapshot } from '../src/shared/contracts';
import { defaultAudio } from '../src/shared/defaults';
import { AudioConfiguration, applyAudioPreferenceChanges, assertAudioConfigurationApplied } from '../src/main/services/audio-configuration';
import { StateStore } from '../src/main/services/state-store';

test('spatial migration is off and narrow patches cannot reset other settings', () => {
  const { spatial: _, ...legacy } = defaultAudio;
  expect(audioStateSchema.parse(legacy).spatial).toEqual(spatialSettingsSchema.parse({}));
  expect(setSpatialAudioInputSchema.parse({ enabled: true })).toEqual({ enabled: true });
  for (const patch of [{ widthDegrees: NaN }, { amount: 2 }, { trackerPort: 80 }, { trackerPort: 4242.5 }, { host: '0.0.0.0' }, { mode: '7.1' }, { trackingSource: 'automatic-fake' }, { distance: 0 }, { immersion: NaN }, { speakers: [] }, { speakers: Array(7).fill(defaultAudio.spatial.speakers[0]) }]) {
    expect(setSpatialAudioInputSchema.safeParse(patch).success).toBe(false);
  }
});

function runtime(audio = defaultAudio): AudioHostSnapshot {
  // Only fields read by this boundary are needed; native snapshot parsing is tested separately.
  return { running: true, capabilities: { ...audio.capabilities, spatialAudio: 'available' },
    spatial: { settings: structuredClone(audio.spatial), active: audio.spatial.enabled, trackingState: 'off', error: null },
  } as AudioHostSnapshot;
}

test('running spatial edits require native readback, availability and active DSP', async () => {
  const state = audioStateSchema.parse(defaultAudio); state.enabled = true;
  let reject = true;
  const requests: boolean[] = [];
  const queue = new AudioConfiguration({
    read: () => structuredClone(state),
    configure: async next => { requests.push(next.spatial.enabled); return reject ? runtime(state) : runtime(next); },
    commit: (before, next) => applyAudioPreferenceChanges(state, before, next), publish: () => {},
  });
  await expect(queue.update(audio => { audio.spatial.enabled = true; })).rejects.toThrow('not accepted');
  expect(state.spatial.enabled).toBe(false);
  expect(requests).toEqual([true, false]);
  reject = false;
  await queue.update(audio => { audio.spatial.enabled = true; audio.spatial.widthDegrees = 120; });
  expect(state.spatial.widthDegrees).toBe(120);
  const next = structuredClone(state); next.spatial.amount = .5;
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
      draft.audio.spatial = { ...draft.audio.spatial, enabled: true, widthDegrees: 110, amount: .8, trackingEnabled: true, trackingSource: 'headset', trackerPort: 4243, immersion: .9, distance: 2.2 };
      draft.audio.spatial.speakers[5] = { ...draft.audio.spatial.speakers[5]!, azimuth: -125, elevation: 35, distance: 1.8, gainDb: -4, enabled: false };
    });
    await store.flush();
    const restarted = new StateStore(path); await restarted.load();
    expect(restarted.get().audio.spatial).toEqual(store.get().audio.spatial);
    expect(restarted.get().audio.host).toBeNull();
    expect(restarted.get().audio.capabilities.spatialAudio).toBe('unavailable');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
