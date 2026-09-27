import { afterEach, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DevelopmentFeedback } from '../src/main/services/development-feedback';
import { summarizeCpuProfile, type CpuProfile } from '../src/main/services/development-profiler';
import { developmentFeedbackEnabled } from '../src/shared/development-feedback';
import { DeveloperDiagnosticsCollector } from '../src/main/services/developer-diagnostics';
import { buildResourceTelemetrySample, measurePerformance } from '../src/main/services/performance-monitor';

const resources: Array<{ directory: string; feedback: DevelopmentFeedback }> = [];
afterEach(async () => {
  for (const item of resources.splice(0)) {
    await item.feedback.dispose();
    await rm(item.directory, { recursive: true, force: true });
  }
});
const profile: CpuProfile = {
  startTime: 0, endTime: 10_000,
  nodes: [
    { id: 1, callFrame: { functionName: '(idle)', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 } },
    { id: 2, callFrame: { functionName: 'busyWork', scriptId: '1', url: 'file:///project/source.ts', lineNumber: 9, columnNumber: 0 } },
  ], samples: [1, 2, 2], timeDeltas: [4_000, 2_000, 4_000],
};
async function fixture(extra: Partial<ConstructorParameters<typeof DevelopmentFeedback>[0]> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'switchboard-dev-feedback-'));
  const feedback = new DevelopmentFeedback({ directory, resourceDirectory: directory, getRenderer: () => null,
    record: async () => [{ target: 'main', profile }], ...extra });
  resources.push({ directory, feedback });
  await feedback.start();
  return { directory, feedback, status: async () => JSON.parse(await readFile(join(feedback.directory, 'status.json'), 'utf8')) };
}
function sample(cpu = 0) {
  const context = { rendererActive: false, guardEnabled: true, engines: [] };
  const performance = { ...measurePerformance([], context, Date.now()), guardState: 'collecting' as const, warning: null };
  const sample = buildResourceTelemetrySample({ metrics: [], context, performance, rendererRuntime: null, sequence: 1, flags: [] });
  sample.totals.cpuPercent = cpu;
  return sample;
}
async function until(predicate: () => Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error('Feedback fixture timed out.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('only dev-server launches collect automatically; packaged, preview, review and opt-out stay off', () => {
  expect(developmentFeedbackEnabled(false, {})).toBeFalse();
  expect(developmentFeedbackEnabled(false, { ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBeTrue();
  expect(developmentFeedbackEnabled(true, { ELECTRON_RENDERER_URL: 'http://localhost:5173', SWITCHBOARD_DEV_FEEDBACK: '1' })).toBeFalse();
  expect(developmentFeedbackEnabled(false, { ELECTRON_RENDERER_URL: 'http://localhost:5173', SWITCHBOARD_DEV_FEEDBACK: '0' })).toBeFalse();
  expect(developmentFeedbackEnabled(false, { ELECTRON_RENDERER_URL: 'http://localhost:5173', SWITCHBOARD_NATIVE_REVIEW: '1' })).toBeFalse();
});

test('keeps warnings through event churn, bounds status, and stops collection deterministically', async () => {
  const { feedback, status } = await fixture();
  const events = new DeveloperDiagnosticsCollector();
  events.setSink(event => feedback.recordEvent(event));
  events.setEnabled(true);
  events.record('main', 'error', 'failure', { message: 'password=secret-value' });
  for (let index = 0; index < 90; index++) events.record('main', 'debug', 'healthy');
  feedback.recordSample(sample());
  await feedback.dispose();
  const state = await status();
  expect(state.state).toBe('stopped');
  expect(state.events).toHaveLength(60);
  expect(state.issues[0].data.message).not.toContain('secret-value');
  events.record('main', 'error', 'after-dispose');
  await feedback.flush();
  expect((await status()).issues).toEqual(state.issues);
});

test('validates file commands and summarizes real leaf sample weights with bounded profile retention', async () => {
  const { feedback, status } = await fixture();
  const invalid = randomUUID();
  await writeFile(join(feedback.directory, 'requests', `${invalid}.json`), JSON.stringify({ id: invalid, sessionId: randomUUID(), target: 'main', durationMs: 1000 }));
  feedback.recordSample(sample());
  await until(async () => (await status()).requests.length === 1);
  expect((await status()).requests[0].error).toContain('different session');
  const id = randomUUID();
  await writeFile(join(feedback.directory, 'requests', `${id}.json`), JSON.stringify({ id, sessionId: feedback.sessionId, target: 'main', durationMs: 1000 }));
  feedback.recordSample(sample());
  await until(async () => (await status()).requests.length === 2);
  expect((await status()).requests[1].profileId).toBe(id);
  for (let index = 0; index < 5; index++) await feedback.profile({ id: randomUUID(), sessionId: feedback.sessionId, durationMs: 1000, target: 'main' });
  await feedback.flush();
  expect((await status()).profiles).toHaveLength(4);
  expect((await readdir(feedback.directory)).filter(file => file.endsWith('.cpuprofile'))).toHaveLength(4);
  expect(summarizeCpuProfile(profile).hotspots[0]).toMatchObject({ function: 'busyWork', selfMs: 6, percent: 60, line: 10 });
});

test('profiles sustained CPU only, limits automatic recording, rejects overlap and aborts shutdown', async () => {
  let now = Date.now(), recordings = 0;
  const { feedback } = await fixture({ now: () => now, record: async () => { recordings++; return []; } });
  feedback.recordSample(sample());
  feedback.recordSample(sample(10));
  expect(recordings).toBe(0);
  feedback.recordSample(sample(10));
  await until(async () => recordings === 1);
  for (let index = 0; index < 4; index++) {
    now += 300_001;
    feedback.recordSample(sample(10));
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  expect(recordings).toBe(3);
  let aborted = false, started = false;
  const pending = await fixture({ record: async (_request, _renderer, signal) => new Promise(resolve => {
    started = true;
    signal.addEventListener('abort', () => { aborted = true; resolve([]); }, { once: true });
  }) });
  const request = { id: randomUUID(), sessionId: pending.feedback.sessionId, durationMs: 1000, target: 'main' as const };
  const active = pending.feedback.profile(request);
  await expect(pending.feedback.profile(request)).rejects.toThrow('already running');
  await until(async () => started);
  await pending.feedback.dispose();
  await active;
  expect(aborted).toBeTrue();
  expect((await pending.status()).activeProfile).toBeNull();
});

test('reopening a window never repeats the startup profile after the cooldown', async () => {
  let now = Date.now(), recordings = 0;
  const { feedback } = await fixture({ now: () => now, record: async () => { recordings++; return []; } });
  feedback.automaticProfile('startup');
  await until(async () => recordings === 1);
  now += 300_001;
  feedback.automaticProfile('startup');
  await new Promise(resolve => setTimeout(resolve, 5));
  expect(recordings).toBe(1);
});
