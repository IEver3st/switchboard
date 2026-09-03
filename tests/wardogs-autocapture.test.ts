import { describe, expect, test } from 'bun:test';
import type { CaptureSource, DetectedGame } from '../src/shared/contracts';
import { AutoCaptureRegistry } from '../src/main/autocapture/registry';
import { WardogsProvider } from '../src/main/autocapture/providers/wardogs/wardogs-provider';

const playtestGame: DetectedGame = {
  id: 'steam:4809930',
  name: 'WARDOGS Playtest',
  source: 'steam',
  installDirectory: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\WARDOGS Playtest',
  executablePath: null,
  launchUri: 'steam://rungameid/4809930',
  addedAt: '2026-09-02T00:00:00.000Z',
};

const retailGame: DetectedGame = {
  ...playtestGame,
  id: 'steam:1867240',
  name: 'WARDOGS',
  installDirectory: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\WARDOGS',
  launchUri: 'steam://rungameid/1867240',
};

function source(name: string): CaptureSource {
  return { id: 'source', type: 'automatic-game', name, available: true };
}

describe('WARDOGS Auto Capture provider', () => {
  test('advertises kill support while staying unavailable without a verified feed', () => {
    const provider = new WardogsProvider();
    expect(provider.id).toBe('wardogs-events');
    expect(provider.gameId).toBe('wardogs');
    expect(provider.supportLevel).toBe('unavailable');
    expect([...provider.capabilities.events]).toContain('kill');
    expect(provider.capabilities.nativeMultiKill).toBeFalse();
  });

  test('detects the retail and Playtest Steam clients', async () => {
    const provider = new WardogsProvider();
    expect(provider.findDetectedGame([playtestGame])).toEqual(playtestGame);
    expect(provider.findDetectedGame([retailGame])).toEqual(retailGame);
    expect(provider.findDetectedGame([])).toBeUndefined();
    expect(await provider.detectAvailability({ detectedGames: [playtestGame], platform: 'win32' })).toEqual({
      state: 'unavailable',
      reason: 'WARDOGS does not expose a verified local kill feed yet. Manual replay and reaction clipping remain available.',
    });
  });

  test('stays dormant without a detected install or off Windows', async () => {
    const provider = new WardogsProvider();
    expect(await provider.detectAvailability({ detectedGames: [], platform: 'win32' })).toEqual({
      state: 'unavailable',
      reason: 'WARDOGS was not found in the detected game library.',
    });
    expect(await provider.detectAvailability({ detectedGames: [playtestGame], platform: 'darwin' })).toEqual({
      state: 'unavailable',
      reason: 'WARDOGS Auto Capture is supported on Windows.',
    });
  });

  test('matches the running client but never the launcher', () => {
    const provider = new WardogsProvider();
    expect(provider.matchesGame(source('WardogsClient-Win64-Shipping.exe'), [playtestGame])).toBeTrue();
    expect(provider.matchesGame(source('Wardogs'), [playtestGame])).toBeTrue();
    expect(provider.matchesGame(source('WARDOGS Playtest'), [playtestGame])).toBeTrue();
    expect(provider.matchesGame(source('WardogsLauncher-Shipping.exe'), [playtestGame])).toBeFalse();
    expect(provider.matchesGame(source('WARDOGS Launcher'), [playtestGame])).toBeFalse();
    expect(provider.matchesGame(source('Counter-Strike 2'), [])).toBeFalse();
  });

  test('starts no runtime, emits no events, and stops idempotently', async () => {
    const provider = new WardogsProvider();
    const received: string[] = [];
    const unsubscribe = provider.subscribe((event) => received.push(event.type));
    await provider.start({
      gameId: provider.gameId,
      displayName: provider.displayName,
      source: source('Wardogs'),
      detectedGames: [playtestGame],
      platform: 'win32',
      gameSettings: { enabled: true, useGlobalTiming: true, events: {} },
      log: () => undefined,
    });
    expect(provider.getStatus().state).toBe('degraded');
    expect(received).toEqual([]);
    unsubscribe();
    await provider.stop();
    await provider.stop();
    expect(provider.getStatus()).toEqual({ state: 'stopped' });
    expect(await provider.getDiagnostics()).toMatchObject({ killFeed: 'unavailable', listeners: 0 });
  });

  test('resolves through the registry for the running WARDOGS source', () => {
    const registry = new AutoCaptureRegistry(() => undefined);
    const provider = new WardogsProvider();
    registry.register(provider);
    expect(registry.getForSource(source('WardogsClient-Win64-Shipping.exe'), [playtestGame])).toBe(provider);
    expect(registry.getDetectedGame(provider.id, [playtestGame])).toEqual(playtestGame);
  });
});
