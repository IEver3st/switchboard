import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { defaultAudio } from '../src/shared/defaults';

// Non-audible shared-mode capture only. Never changes defaults, application routes,
// endpoint volume, or playback; microphone samples remain inside Audio.Host.
const hostPath = resolve(process.env.SWITCHBOARD_AUDIO_VERIFY_HOST
  ?? 'engines/audio-host/bin/Release/net10.0-windows/Audio.Host.exe');
const host = spawn(hostPath, [], { cwd: dirname(hostPath), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const evidence: Record<string, unknown> = { hostPid: host.pid };
const statuses: any[] = [];
let sequence = 0;
let meterFrames = 0;
let stderr = '';
host.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8_192); });
createInterface({ input: host.stdout }).on('line', line => {
  const message = JSON.parse(line);
  if (message.type === 'meters') meterFrames++;
  if (message.type === 'status') statuses.push(message.status);
  if (message.type !== 'response') return;
  const request = pending.get(message.requestId);
  if (!request) return;
  pending.delete(message.requestId);
  if (message.error) request.reject(new Error(message.error));
  else request.resolve(message.result);
});
const exit = new Promise<void>(done => host.once('exit', () => done()));
host.on('error', error => { for (const request of pending.values()) request.reject(error); });
host.on('exit', () => {
  for (const request of pending.values()) request.reject(new Error(`Audio.Host exited: ${stderr}`));
  pending.clear();
});
async function request(command: string, payload?: unknown): Promise<any> {
  const requestId = String(++sequence);
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { pending.delete(requestId); fail(new Error(`Timed out: ${command}`)); }, 15_000);
    pending.set(requestId, {
      resolve: value => { clearTimeout(timer); done(value); },
      reject: error => { clearTimeout(timer); fail(error); },
    });
    host.stdin.write(`${JSON.stringify({ requestId, command, payload })}\n`);
  });
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const delay = (ms: number) => new Promise(done => setTimeout(done, ms));
try {
  const endpoints = await request('listEndpoints');
  const microphone = endpoints.find((endpoint: any) => endpoint.flow === 'capture'
    && !endpoint.isSwitchboard && !/virtual/i.test(endpoint.interfaceName ?? endpoint.name));
  assert(microphone, 'Connect a physical microphone before running this check.');
  const settings = structuredClone(defaultAudio);
  settings.enabled = true;
  settings.monitoringEnabled = false;
  settings.monitoringDeviceId = '';
  for (const bus of settings.buses) bus.deviceId = bus.id === 'mic' ? microphone.id : '';
  let snapshot = await request('start', settings);
  evidence.started = snapshot;
  assert(snapshot.capabilities.microphoneDsp === 'available', 'Physical microphone capture did not start.');
  await delay(1_000);
  assert(meterFrames === 0, 'Unrequested meters must remain dormant.');
  await request('setMetering', true);
  await delay(600);
  assert(meterFrames >= 5, 'Requested live microphone meters did not arrive.');
  await request('setMetering', false);
  evidence.meterFrames = meterFrames;

  // Stale monitoring selection must not take down physical capture on startup.
  await request('stop');
  const staleMonitor = { ...settings, monitoringEnabled: true, monitoringDeviceId: 'missing-monitor-endpoint' };
  snapshot = await request('start', staleMonitor);
  evidence.staleMonitor = snapshot;
  assert(snapshot.capabilities.microphoneDsp === 'available', 'A missing monitor output killed microphone capture.');
  assert(snapshot.microphone?.monitoring.active === false, 'A missing output cannot be reported as monitoring.');
  assert(snapshot.microphone?.error, 'A missing monitoring output must expose a recoverable error.');
  snapshot = await request('configure', settings);
  assert(snapshot.microphone?.error == null, 'Disabling a failed monitor must clear its error.');

  // Invalid configuration must be rejected before replacing the live DSP state.
  let rejected = false;
  try { await request('configure', { ...settings, micProcessors: [] }); } catch { rejected = true; }
  assert(rejected, 'Missing processors must be rejected.');
  snapshot = await request('status');
  assert(snapshot.microphone.processors.length === settings.micProcessors.length,
    'Rejected configuration replaced the confirmed processor settings.');
  evidence.afterRejectedConfiguration = snapshot;

  for (let cycle = 0; cycle < 5; cycle++) {
    snapshot = await request('stop');
    assert(!snapshot.running && snapshot.capabilities.microphoneDsp === 'unavailable', 'Stop retained microphone capability.');
    snapshot = await request('start', settings);
    assert(snapshot.capabilities.microphoneDsp === 'available', `Microphone restart ${cycle + 1} failed.`);
  }
  evidence.restartCycles = 5;
  const duration = Number(process.env.SWITCHBOARD_AUDIO_VERIFY_DURATION ?? 0);
  if (duration > 0) await delay(duration * 1_000);
  evidence.final = await request('status');
  evidence.statuses = statuses;
  await request('shutdown');
  await Promise.race([exit, delay(5_000).then(() => { throw new Error('Audio.Host did not exit after shutdown.'); })]);
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.error = String(error);
  process.exitCode = 1;
} finally {
  if (host.exitCode === null) { host.kill(); await exit; }
  const output = resolve(process.env.SWITCHBOARD_AUDIO_VERIFY_OUTPUT ?? '.switchboard/audio-repair-20260907/lifecycle.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ passed: evidence.passed, error: evidence.error, restartCycles: evidence.restartCycles, output }));
}
