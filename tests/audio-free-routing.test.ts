import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioApplicationPreferencesSchema, audioApplicationSchema, audioCapabilitiesSchema } from '../src/shared/contracts';
import { StateStore } from '../src/main/services/state-store';
import { parseAudioEndpoints } from '../src/main/services/audio-endpoint-discovery';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { assertAudioConfigurationApplied } from '../src/main/services/audio-configuration';

describe('free application mixing backend', () => {
  test('accepts unassigned native sessions with omitted null destinations', () => {
    const session = audioApplicationSchema.parse({ id: 'process:123:456', name: 'Player', executableName: 'Player', processId: 123, destination: 'game', routingState: 'unmanaged', active: true });
    expect(session.currentDestination).toBeNull();
    expect(session.preferredDestination).toBeNull();
    expect(audioApplicationSchema.safeParse({ ...session, preferredDestination: 'aux' }).success).toBeFalse();
  });
  test('keeps app routing preferences across restart while discarding live sessions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-free-audio-'));
    try {
      const first = new StateStore(join(directory, 'state.json'));
      await first.load();
      const routes = [{ executablePath: 'C:\\Apps\\Player.exe', destination: 'media' as const }];
      first.updateBranches(['audio'], draft => { draft.audio.applicationRoutes = routes; });
      await first.flush();
      const restarted = new StateStore(join(directory, 'state.json'));
      await restarted.load();
      expect(restarted.read('audio').applicationRoutes).toEqual(routes);
      expect(restarted.read('audio').applications).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('rejects unbounded, duplicate, relative, and invalid application preferences', () => {
    expect(audioApplicationPreferencesSchema.safeParse([{ executablePath: 'player.exe', destination: 'game' }]).success).toBeFalse();
    expect(audioApplicationPreferencesSchema.safeParse([{ executablePath: 'C:\\Player.exe', destination: 'aux' }]).success).toBeFalse();
    expect(audioApplicationPreferencesSchema.safeParse([
      { executablePath: 'C:\\Player.exe', destination: 'game' },
      { executablePath: 'c:\\player.EXE', destination: 'chat' },
    ]).success).toBeFalse();
    expect(audioApplicationPreferencesSchema.safeParse(Array.from({ length: 65 }, (_, i) => ({ executablePath: `C:\\Player${i}.exe`, destination: 'game' }))).success).toBeFalse();
  });

  test('identifies VB-CABLE as virtual without impersonating Switchboard endpoints', () => {
    const [device] = parseAudioEndpoints([{
      id: 'cable', name: 'CABLE Input (VB-Audio Virtual Cable)', interfaceName: 'VB-Audio Virtual Cable',
      flow: 'render', isDefault: false, volume: 1, muted: false,
    }]);
    expect(device?.isVirtual).toBeTrue();
    expect(device?.isSwitchboard).toBeFalse();
  });

  test('preserves truthful independent capabilities and rejects a failed mixer reconfiguration', () => {
    const before = createDefaultSnapshot().audio;
    before.capabilities = audioCapabilitiesSchema.parse({ ...before.capabilities,
      routingBackend: 'vb-cable', applicationRouting: 'available', channelDsp: 'available', clipMix: 'available',
      virtualChannels: 'unavailable', virtualMicrophone: 'unavailable', streamOutput: 'unavailable',
    });
    expect(before.capabilities.applicationRouting).toBe('available');
    expect(before.capabilities.virtualChannels).toBe('unavailable');
    expect(() => assertAudioConfigurationApplied(before, before, {
      running: true, capabilities: { ...before.capabilities, channelDsp: 'unavailable' }, error: 'Output disconnected',
    } as Parameters<typeof assertAudioConfigurationApplied>[2])).toThrow('Output disconnected');
  });
});
