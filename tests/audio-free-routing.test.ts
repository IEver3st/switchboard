import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioApplicationPreferencesSchema, audioApplicationSchema, audioCapabilitiesSchema } from '../src/shared/contracts';
import { applyApplicationRoutingPreference } from '../src/shared/audio-routing';
import { setAudioRoutingInputSchema, audioStateSchema } from '../src/shared/contracts';
import { StateStore } from '../src/main/services/state-store';
import { parseAudioEndpoints } from '../src/main/services/audio-endpoint-discovery';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { assertAudioConfigurationApplied } from '../src/main/services/audio-configuration';

describe('free application mixing backend', () => {
  test('accepts host sessions with omitted null destinations without inventing an assignment', () => {
    // Audio.Host uses JsonIgnoreCondition.WhenWritingNull on its wire snapshots.
    const session = { id: 'process:42:123', name: 'Player', executableName: 'Player', processId: 42,
      destination: 'game', routingState: 'unmanaged', active: true };
    expect(audioApplicationSchema.parse(session)).toMatchObject({ currentDestination: null, preferredDestination: null });
    expect(audioApplicationSchema.parse({ ...session, preferredDestination: null }).preferredDestination).toBeNull();
    expect(audioApplicationSchema.safeParse({ ...session, preferredDestination: 'aux' }).success).toBeFalse();
  });
  test('keeps app routing preferences across restart while discarding live sessions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-free-audio-'));
    try {
      const first = new StateStore(join(directory, 'state.json'));
      await first.load();
      const routes = [{ executablePath: 'C:\\Apps\\Player.exe', destination: 'media' as const }];
      first.update(draft => { draft.audio.applicationRoutes = routes; draft.audio.automaticApplicationRouting = false; });
      await first.flush();
      const restarted = new StateStore(join(directory, 'state.json'));
      await restarted.load();
      expect(restarted.get().audio.applicationRoutes).toEqual(routes);
      expect(restarted.get().audio.automaticApplicationRouting).toBeFalse();
      expect(restarted.get().audio.applications).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test('defaults old profiles to automatic and updates overrides without clobbering other apps', () => {
    const audio = createDefaultSnapshot().audio;
    const { automaticApplicationRouting, ...old } = audio;
    expect(audioStateSchema.parse(old).automaticApplicationRouting).toBeTrue();
    applyApplicationRoutingPreference(audio, { override: { executablePath: 'C:\\Apps\\Chrome.exe', destination: 'media' } });
    applyApplicationRoutingPreference(audio, { override: { executablePath: 'C:\\Apps\\Discord.exe', destination: 'chat' } });
    applyApplicationRoutingPreference(audio, { override: { executablePath: 'c:\\apps\\CHROME.exe', destination: 'game' } });
    expect(audio.applicationRoutes).toHaveLength(2);
    expect(audio.applicationRoutes?.[1]?.destination).toBe('game');
    applyApplicationRoutingPreference(audio, { automatic: false, override: { executablePath: 'C:\\Apps\\Chrome.exe', destination: null } });
    expect(audio.automaticApplicationRouting).toBeFalse();
    expect(audio.applicationRoutes).toEqual([{ executablePath: 'C:\\Apps\\Discord.exe', destination: 'chat' }]);
    expect(setAudioRoutingInputSchema.safeParse({}).success).toBeFalse();
    expect(setAudioRoutingInputSchema.safeParse({ override: { executablePath: 'relative.exe', destination: 'media' } }).success).toBeFalse();
    expect(setAudioRoutingInputSchema.safeParse({ automatic: true, override: { executablePath: 'C:\\Apps\\Chrome.exe', destination: null } }).success).toBeTrue();
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

  test('requires host acknowledgement before committing routing preferences', () => {
    const before = createDefaultSnapshot().audio;
    const next = structuredClone(before);
    next.automaticApplicationRouting = false;
    const host = { running: true, capabilities: before.capabilities } as Parameters<typeof assertAudioConfigurationApplied>[2];
    expect(() => assertAudioConfigurationApplied(before, next, host)).toThrow('did not accept automatic routing');
    expect(() => assertAudioConfigurationApplied(before, next, { ...host, automaticApplicationRouting: false })).not.toThrow();
    next.applicationRoutes = [{ executablePath: 'C:\\Apps\\Player.exe', destination: 'media' }];
    expect(() => assertAudioConfigurationApplied(before, next, { ...host, automaticApplicationRouting: false })).toThrow('did not accept the app categories');
    expect(() => assertAudioConfigurationApplied(before, next, { ...host, automaticApplicationRouting: false, applicationRoutes: next.applicationRoutes })).not.toThrow();
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
