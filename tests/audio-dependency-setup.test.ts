import { describe, expect, test } from 'bun:test';
import { AudioDependencySetup, AudioSetupCancelled, type AudioSetupBackend, type AudioSetupInventory } from '../src/main/services/audio-dependency-setup';
import { audioSetupActionSchema, type AudioDependencyState } from '../src/shared/contracts';

function harness(cable = false, microphone = false) {
  let inventory: AudioSetupInventory = { cable, microphone, microphoneRateReady: microphone, bootTimeMs: 1_000_000, defaults: [], registered: {cable, microphone} };
  let receipt: number | null = null;
  let failure: Error | null = null;
  let downloads = 0; let configurations = 0; let locks = 0;
  const installs: string[] = []; const states: AudioDependencyState[] = [];
  let downloadGate: Promise<void> = Promise.resolve();
  const backend: AudioSetupBackend = {
    inspect: async () => structuredClone(inventory), receipt: async () => receipt,
    record: async value => { receipt = value; },
    acquire: async () => { locks++; return async () => { locks--; }; },
    download: async (_kind, signal, progress) => { downloads++; progress(25); await downloadGate; signal.throwIfAborted(); return 'verified-directory'; },
    install: async kind => { if (failure) throw failure; installs.push(kind); inventory[kind] = true; inventory.registered[kind] = true; },
    configure: async () => { configurations++; inventory.microphoneRateReady = inventory.microphone; return inventory; },
  };
  const service = new AudioDependencySetup(backend, state => states.push(state));
  return { service, backend, states, installs, inventory,
    get downloads() { return downloads; }, get configurations() { return configurations; }, get locks() { return locks; }, get receipt() { return receipt; },
    fail(error: Error | null) { failure = error; }, gate(promise: Promise<void>) { downloadGate = promise; },
    latest: () => states.at(-1)!,
  };
}

describe('optional audio dependency setup', () => {
  test('check never downloads, configures, installs or takes an installer lock', async () => {
    const h = harness(); h.service.start(false); await h.service.settled();
    expect(h.latest().phase).toBe('idle'); expect(h.downloads).toBe(0); expect(h.configurations).toBe(0); expect(h.installs).toEqual([]); expect(h.locks).toBe(0);
    expect(audioSetupActionSchema.safeParse({ command: 'arbitrary.exe' }).success).toBeFalse();
  });
  test('installs only missing drivers, reports progress and retains restart across checks', async () => {
    const h = harness(true); h.service.start(true); await h.service.settled();
    expect(h.installs).toEqual(['microphone']); expect(h.downloads).toBe(1); expect(h.configurations).toBe(1);
    expect(h.states.some(s => s.phase === 'downloading' && s.progress === 25)).toBeTrue();
    expect(h.latest().phase).toBe('restart-required'); expect(h.locks).toBe(0);
    h.service.start(false); await h.service.settled(); expect(h.latest().phase).toBe('restart-required');
    h.inventory.bootTimeMs += 120_000;
    h.service.start(false); await h.service.settled(); expect(h.latest().phase).toBe('ready');
  });
  test('an already configured PC needs no download or installer', async () => {
    const h = harness(true, true); h.service.start(true); await h.service.settled();
    expect(h.installs).toEqual([]); expect(h.downloads).toBe(0); expect(h.latest().phase).toBe('ready'); expect(h.receipt).toBeNull();
  });
  test('closing the vendor installer without installing does not falsely require a reboot', async () => {
    const h = harness(true); h.backend.install = async () => {};
    h.service.start(true); await h.service.settled();
    expect(h.latest().phase).toBe('error'); expect(h.latest().error).toContain('was not installed'); expect(h.receipt).toBeNull();
  });
  test('an installed but inactive driver is not accidentally reinstalled or removed', async () => {
    const h = harness(true); h.inventory.registered.microphone = true;
    h.service.start(true); await h.service.settled();
    expect(h.downloads).toBe(0); expect(h.latest().error).toContain('already installed'); expect(h.installs).toEqual([]);
  });
  test('cancels downloads and rejects overlapping operations without launching an installer', async () => {
    const h = harness(); let resume!: () => void;
    h.gate(new Promise(resolve => { resume = resolve; }));
    h.service.start(true);
    expect(() => h.service.start(true)).toThrow('already running');
    await new Promise(resolve => setTimeout(resolve, 0));
    h.service.cancel(); resume(); await h.service.settled();
    expect(h.installs).toEqual([]); expect(h.receipt).toBeNull(); expect(h.latest().phase).toBe('error'); expect(h.locks).toBe(0);
  });
  test('cancelled UAC can be retried without a false restart requirement', async () => {
    const h = harness(true); h.fail(new AudioSetupCancelled());
    h.service.start(true); await h.service.settled();
    expect(h.latest().phase).toBe('error'); expect(h.receipt).toBeNull();
    h.fail(null); h.service.start(true); await h.service.settled();
    expect(h.installs).toEqual(['microphone']); expect(h.latest().phase).toBe('restart-required');
  });
  test('verification/download failure never requests elevation or writes a restart marker', async () => {
    const h = harness(); h.backend.download = async () => { throw new Error('Package verification failed'); };
    h.service.start(true); await h.service.settled();
    expect(h.latest().error).toContain('verification'); expect(h.installs).toEqual([]); expect(h.receipt).toBeNull(); expect(h.locks).toBe(0);
  });
  test('closing Switchboard during a download stops work and further publication', async () => {
    const h = harness(); let resume!: () => void;
    h.gate(new Promise(resolve => { resume = resolve; })); h.service.start(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    h.service.dispose(); const count = h.states.length; resume(); await h.service.settled();
    expect(h.states.length).toBe(count); expect(h.installs).toEqual([]); expect(h.locks).toBe(0);
  });
});
