import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/main/services/state-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('audio workspace persistence', () => {
  test('restores path processing, microphone parameters, and user presets', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();

    first.update((draft) => {
      const game = draft.audio.channelProcessing.find((processing) => processing.busId === 'game')!;
      game.equalizer.bands[0]!.gainDb = 3.5;
      game.normalization.enabled = true;
      const compressor = draft.audio.micProcessors.find((processor) => processor.id === 'compressor');
      if (compressor?.id === 'compressor') compressor.parameters.ratio = 5;
      const custom = structuredClone(draft.audio.pathPresets.find((preset) => preset.id === 'game-flat')!);
      custom.id = 'user-game-test';
      custom.name = 'Test preset';
      custom.builtIn = false;
      draft.audio.pathPresets.push(custom);
      draft.audio.activePresetIds.game = custom.id;
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    const audio = restarted.get().audio;
    expect(audio.channelProcessing.find((processing) => processing.busId === 'game')?.equalizer.bands[0]?.gainDb).toBe(3.5);
    expect(audio.channelProcessing.find((processing) => processing.busId === 'game')?.normalization.enabled).toBeTrue();
    const compressor = audio.micProcessors.find((processor) => processor.id === 'compressor');
    expect(compressor?.id === 'compressor' ? compressor.parameters.ratio : null).toBe(5);
    expect(audio.pathPresets.some((preset) => preset.id === 'user-game-test')).toBeTrue();
    expect(audio.activePresetIds.game).toBe('user-game-test');
  });

  test('restores the master output without changing channel balance', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-master-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();
    const channelGains = first.get().audio.mixes.map((mix) => [mix.id, mix.buses.map((bus) => [bus.id, bus.gain])]);

    first.update((draft) => {
      const personal = draft.audio.mixes.find((mix) => mix.id === 'personal')!;
      personal.master.gain = 1.27;
      personal.master.enabled = false;
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    expect(restarted.get().audio.mixes.find((mix) => mix.id === 'personal')?.master).toEqual({ gain: 1.27, enabled: false });
    expect(restarted.get().audio.mixes.map((mix) => [mix.id, mix.buses.map((bus) => [bus.id, bus.gain])])).toEqual(channelGains);
  });

  test('restores disabled channels without changing their per-mix controls', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-channels-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();
    const mediaControls = first.get().audio.mixes.map((mix) => (
      structuredClone(mix.buses.find((bus) => bus.id === 'media'))
    ));

    first.update((draft) => {
      draft.audio.buses.find((bus) => bus.id === 'media')!.enabled = false;
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    const audio = restarted.get().audio;
    expect(audio.buses.find((bus) => bus.id === 'media')?.enabled).toBeFalse();
    expect(audio.mixes.map((mix) => mix.buses.find((bus) => bus.id === 'media'))).toEqual(mediaControls);
  });

  test('removes legacy application metadata when routing is unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-routing-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();

    first.update((draft) => {
      const game = draft.audio.buses.find((bus) => bus.id === 'game')!;
      game.appCount = 3;
      draft.audio.applications = [{
        id: 'legacy-session',
        name: 'Legacy application',
        executableName: 'legacy-application',
        processId: 1234,
        destination: 'game',
        currentDestination: 'game',
        preferredDestination: null,
        routingState: 'unmanaged',
        active: true,
      }];
    });
    await first.flush();

    const restarted = new StateStore(filePath);
    await restarted.load();
    const audio = restarted.get().audio;
    expect(audio.capabilities.applicationRouting).toBe('unavailable');
    expect(audio.applications).toEqual([]);
    expect(audio.buses.every((bus) => bus.appCount === 0)).toBeTrue();
  });

  test('discards stale host runtime data without discarding persisted mix settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-audio-host-migration-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    const first = new StateStore(filePath);
    await first.load();
    first.update((draft) => {
      draft.audio.enabled = true;
      draft.audio.mixes.find((mix) => mix.id === 'personal')!.master.gain = 1.19;
    });
    await first.flush();

    const persisted = JSON.parse(await readFile(filePath, 'utf8'));
    persisted.audio.host = { running: true, sampleRate: 48_000 };
    await writeFile(filePath, JSON.stringify(persisted), 'utf8');

    const restarted = new StateStore(filePath);
    await restarted.load();
    const audio = restarted.get().audio;
    expect(audio.enabled).toBeTrue();
    expect(audio.mixes.find((mix) => mix.id === 'personal')?.master.gain).toBe(1.19);
    expect(audio.host).toBeNull();
  });
});
