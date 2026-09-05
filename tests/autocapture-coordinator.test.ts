import { expect, test } from 'bun:test';
import type { AutoCaptureRuntime, AutoCaptureSettings, DetectedGame } from '../src/shared/contracts';
import { defaultAutoCapture } from '../src/shared/defaults';
import { AutoCaptureEngine } from '../src/main/autocapture/auto-capture-engine';
import { AutoCaptureCoordinator } from '../src/main/autocapture/coordinator';
import { AutoCaptureRegistry } from '../src/main/autocapture/registry';
import { TestEventProvider } from '../src/main/autocapture/providers/test-event-provider';
import { WarThunderProvider } from '../src/main/autocapture/providers/war-thunder/war-thunder-provider';

const game: DetectedGame = {
  id: 'steam:236390', name: 'War Thunder', source: 'steam',
  installDirectory: 'D:\\Games\\War Thunder', launchUri: 'steam://rungameid/236390',
  addedAt: '2026-09-04T00:00:00.000Z',
};
const source = { id: 'automatic-game:123:456', type: 'automatic-game' as const, name: 'War Thunder', available: true };

function harness(playerName?: string) {
  const settings: AutoCaptureSettings = structuredClone(defaultAutoCapture.settings);
  settings.enabled = true;
  settings.games['war-thunder'] = { enabled: true, useGlobalTiming: true, events: {}, playerName };
  let runtime: AutoCaptureRuntime;
  let calls = 0;
  let failure = false;
  let saved = 0;
  const provider = new WarThunderProvider({ pollIntervalMs: 5, fetch: async () => {
    calls++;
    if (failure) throw new Error('connection refused');
    return Response.json({ events: [], damage: [{ id: calls, msg: 'Pilot (T-54) destroyed Target (M60)' }] });
  } });
  const registry = new AutoCaptureRegistry(() => undefined);
  registry.register(provider);
  const engine = new AutoCaptureEngine({
    getSettings: () => settings, getMaximumWindowMs: () => 60_000,
    preserve: async () => { saved++; }, onRuntime: (next) => { runtime = next; }, log: () => undefined,
  });
  const coordinator = new AutoCaptureCoordinator({ registry, engine, testProvider: new TestEventProvider(),
    getSettings: () => settings, includeDevelopmentProviders: () => false, onProvidersChanged: () => undefined });
  return { coordinator, provider, settings, get runtime() { return runtime!; },
    get calls() { return calls; }, get saved() { return saved; }, fail() { failure = true; }, recover() { failure = false; } };
}

test('kill clips resume after replay reconfiguration retains the same game source', async () => {
  const h = harness('Pilot');
  try {
    await h.coordinator.initialize([game]);
    await h.coordinator.reconcile(source, true, [game]);
    await until(() => h.runtime.eventsReceived > 0);
    await h.coordinator.flushBeforeCaptureStops('replay-buffer-changed');
    expect(h.saved).toBe(1);
    await h.coordinator.reconcile(source, true, [game]);
    expect(h.provider.getStatus().state).toBe('listening');
    const before = h.runtime.eventsReceived;
    await until(() => h.runtime.eventsReceived > before);
    await h.coordinator.flushBeforeCaptureStops('capture-disabled');
    expect(h.saved).toBe(2);
    const calls = h.calls;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.calls).toBe(calls);
  } finally { await h.coordinator.dispose(); }
});

test('missing nickname is degraded in canonical runtime instead of listening', async () => {
  const h = harness();
  try {
    await h.coordinator.initialize([game]);
    await h.coordinator.reconcile(source, true, [game]);
    expect(h.runtime.state).toBe('degraded');
    expect(h.runtime.lastError).toContain('nickname');
    h.settings.games['war-thunder']!.playerName = 'Pilot';
    await h.coordinator.reconcile(source, true, [game]);
    await until(() => h.runtime.eventsReceived > 0);
    expect(h.runtime.lastError).toBeNull();
  } finally { await h.coordinator.dispose(); }
});

test('API failure and recovery reach canonical runtime without changing source or settings', async () => {
  const h = harness('Pilot');
  try {
    await h.coordinator.initialize([game]);
    await h.coordinator.reconcile(source, true, [game]);
    h.fail();
    await until(() => h.provider.getStatus().state === 'degraded');
    expect(h.runtime.state).toBe('degraded');
    expect(h.runtime.lastError).toContain('connection refused');
    h.recover();
    await until(() => h.provider.getStatus().state === 'listening');
    expect(h.runtime.lastError).toBeNull();
  } finally { await h.coordinator.dispose(); }
});

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 500;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for kill-event pipeline');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
