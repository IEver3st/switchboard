import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const settingsPath = option('--settings');
const durationSeconds = Number(option('--duration', '60'));
const exerciseMicrophoneTest = process.argv.includes('--exercise-microphone-test');
const outputPath = option('--output', '');
const hostPath = resolve(option('--host', resolve(root, '.switchboard', 'build', 'audio-host', 'Audio.Host.exe')));
if (!Number.isFinite(durationSeconds) || durationSeconds < 60) throw new Error('--duration must be at least 60 seconds.');
const settings = JSON.parse(await readFile(resolve(settingsPath), 'utf8'));

const host = spawn(hostPath, [], { cwd: dirname(hostPath), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const responses = new Map();
const statuses = [];
let latestSnapshot = null;
let measuredSnapshot = null;
let stderr = '';
host.stderr.setEncoding('utf8');
host.stderr.on('data', (chunk) => { stderr += chunk; });
const lines = createInterface({ input: host.stdout });
lines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.type === 'status') statuses.push(message.status);
  if (message.type === 'event' && message.event === 'audioSnapshot') latestSnapshot = message.payload;
  if (message.type !== 'response') return;
  const pending = responses.get(message.requestId);
  if (!pending) return;
  responses.delete(message.requestId);
  if (message.error) pending.reject(new Error(message.error));
  else pending.resolve(message.result);
});

function request(requestId, command, payload, timeoutMs = 15_000) {
  return new Promise((resolveRequest, reject) => {
    const timeout = setTimeout(() => {
      responses.delete(requestId);
      reject(new Error(`Audio.Host request timed out: ${command}`));
    }, timeoutMs);
    responses.set(requestId, {
      resolve: (value) => { clearTimeout(timeout); resolveRequest(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    });
    host.stdin.write(`${JSON.stringify({ requestId, command, payload })}\n`);
  });
}

try {
  latestSnapshot = await request('measurement-start', 'start', settings, 30_000);
  if (exerciseMicrophoneTest) await request('measurement-microphone-test', 'testMicrophone', undefined, 10_000);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, durationSeconds * 1_000));
  latestSnapshot = await request('measurement-status', 'status');
  measuredSnapshot = latestSnapshot;
  await request('measurement-shutdown', 'shutdown');
  await new Promise((resolveExit, reject) => {
    if (host.exitCode !== null) { resolveExit(); return; }
    const timeout = setTimeout(() => reject(new Error('Audio.Host did not exit after shutdown.')), 10_000);
    host.once('exit', () => { clearTimeout(timeout); resolveExit(); });
  });
} catch (error) {
  host.kill();
  throw new Error(`${error instanceof Error ? error.message : String(error)}${stderr ? `\n${stderr}` : ''}`);
}

const steadyStatuses = statuses.filter((status) => status.state === 'running' && status.uptimeSeconds >= 5);
const cpu = steadyStatuses.map((status) => status.cpuPercent);
const memory = steadyStatuses.map((status) => status.memoryMb);
const report = {
  durationSeconds,
  statusSamples: steadyStatuses.length,
  averageCpuPercent: cpu.length ? cpu.reduce((sum, value) => sum + value, 0) / cpu.length : 0,
  maximumCpuPercent: cpu.length ? Math.max(...cpu) : 0,
  maximumPrivateWorkingSetMb: memory.length ? Math.max(...memory) : 0,
  noiseSuppression: measuredSnapshot?.noiseSuppression ?? null,
  inputFormat: measuredSnapshot?.inputFormat ?? null,
  driver: measuredSnapshot?.driver ?? null,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  const absoluteOutput = resolve(outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, serialized);
}
console.log(serialized.trimEnd());

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required ${name}.`);
}
