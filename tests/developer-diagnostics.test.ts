import { afterEach, expect, setSystemTime, test } from 'bun:test';
import { DeveloperDiagnosticsCollector, redactDiagnosticText } from '../src/main/services/developer-diagnostics';
import { captureDiagnosticContext, diagnosticGpuInfo } from '../src/main/services/diagnostics-export';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { StateStore } from '../src/main/services/state-store';

const collector = new DeveloperDiagnosticsCollector();
afterEach(() => { collector.dispose(); setSystemTime(); });

test('developer events are gated, cleared on disable, and stale completions cannot enter another recording', async () => {
  const recorded: unknown[] = [];
  collector.setSink(event => recorded.push(event));
  collector.record('capture', 'error', 'ignored', { error: 'not retained' });
  expect(collector.snapshot().events).toEqual([]);
  expect(recorded).toEqual([]);
  collector.setEnabled(true);
  let finish!: () => void;
  const inFlight = collector.trace('main', 'capture.start', () => new Promise<void>(resolve => { finish = resolve; }));
  collector.setEnabled(false);
  const recordsAfterDisable = recorded.length;
  collector.record('capture', 'info', 'late-host-event');
  expect(recorded).toHaveLength(recordsAfterDisable);
  expect(collector.snapshot().events).toEqual([]);
  collector.setEnabled(true);
  finish();
  await inFlight;
  expect(collector.snapshot().events.map(event => event.event)).toEqual(['diagnostics.enabled']);
});

test('host diagnostics are schema validated and redacted before both retention and persistence', () => {
  collector.setEnabled(true);
  let persisted: unknown;
  collector.setSink(event => { persisted = event; });
  collector.receive('capture', { level: 'error', event: 'ffmpeg.output', data: {
    line: '[gfxcapture] Could not create D3D11 device (80070057)',
    path: 'C:\\Users\\Private Name\\Videos\\private clip.mp4',
    apiToken: 'do-not-export',
    text: 'Authorization: Bearer abcdef https://example.com/?secret=abc person@example.com',
  } });
  const event = collector.snapshot().events.at(-1)!;
  expect(event.data.line).toContain('80070057');
  expect(event.data.path).toBe('<path>');
  expect(event.data.apiToken).toBe('<redacted>');
  expect(event.data.text).not.toMatch(/abcdef|example\.com|person@/);
  expect(persisted).toEqual(event);
  collector.receive('capture', { level: 'error', event: 'ffmpeg.output', data: { nested: { arbitrary: 'payload' } } });
  collector.receive('capture', { level: 'error', event: 'ffmpeg.output', data: { nan: NaN } });
  expect(collector.snapshot().discardedEvents).toBe(2);
  expect(redactDiagnosticText('error {"token":"private value"}')).not.toContain('private value');
  expect(redactDiagnosticText('open \\\\server\\private\\capture.mkv')).not.toContain('server');
  expect(redactDiagnosticText('Microsoft Basic Render Driver')).toBe('Microsoft Basic Render Driver');
});

test('logging has count, byte, rate and per-record bounds, and sink failures cannot change an operation result', async () => {
  const epoch = Date.now();
  collector.setEnabled(true);
  for (let i = 0; i < 2400; i++) {
    setSystemTime(epoch + Math.floor(i / 60) * 1000);
    collector.record('capture', 'debug', 'bounded', { index: i, message: 'x'.repeat(1800) });
  }
  const retained = collector.snapshot();
  expect(retained.events.length).toBeLessThanOrEqual(2000);
  expect(Buffer.byteLength(JSON.stringify(retained.events))).toBeLessThan(2 * 1024 * 1024 + 2000);
  expect(retained.events.at(-1)!.data.index).toBe(2399);
  expect(retained.discardedEvents).toBeGreaterThan(0);
  const before = retained.discardedEvents;
  for (let i = 0; i < 500; i++) collector.record('main', 'debug', 'flood');
  expect(collector.snapshot().discardedEvents).toBeGreaterThan(before);
  setSystemTime(epoch + 100000);
  collector.setSink(() => { throw new Error('unavailable disk'); });
  expect(await collector.trace('main', 'operation', () => 42)).toBe(42);
  await expect(collector.trace('main', 'operation', () => { throw new Error('original failure'); })).rejects.toThrow('original failure');
});

test('export context includes failures and GPU drivers without window titles, source paths, or arbitrary driver metadata', () => {
  const snapshot = createDefaultSnapshot();
  snapshot.capture.config.sourceId = 'window:123:private title';
  snapshot.capture.config.clipsDirectory = 'C:\\private\\clips';
  snapshot.capture.runtime.error = 'FFmpeg device failure 80070057\nOutput C:\\private\\clips\\segment.mkv';
  snapshot.capture.sources.push({ id: 'window:123', type: 'window', label: 'private window title', available: true });
  const context = captureDiagnosticContext(snapshot);
  const text = JSON.stringify(context);
  expect(text).toContain('80070057');
  expect(text).not.toContain('private');
  expect(context.sources.windows).toBeGreaterThan(0);
  const gpu = diagnosticGpuInfo({ gpuDevice: [{ vendorId: 4098, deviceString: 'AMD Radeon RX 9070', driverVersion: '32.0.1', privateSerial: 'serial' }],
    auxAttributes: { glRenderer: 'ANGLE D3D11', privateField: 'secret' }, arbitrary: 'not included' });
  expect(JSON.stringify(gpu)).toContain('RX 9070');
  expect(JSON.stringify(gpu)).not.toMatch(/serial|secret|not included/);
});

test('persisted resource diagnostics cannot run outside Developer mode', () => {
  const store = new StateStore('unused-state.json');
  store.update(draft => { draft.settings.detailedDiagnostics = true; draft.settings.developerMode = false; }, { persist: false });
  expect(store.getDetailedDiagnosticsEnabled()).toBe(false);
  store.update(draft => { draft.settings.developerMode = true; }, { persist: false });
  expect(store.getDetailedDiagnosticsEnabled()).toBe(true);
  store.update(draft => { draft.settings.developerMode = false; }, { persist: false });
  expect(store.getDetailedDiagnosticsEnabled()).toBe(false);
});
