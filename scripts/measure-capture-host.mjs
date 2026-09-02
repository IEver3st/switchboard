import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { estimateWindowedGrowth, percentile } from './performance-statistics.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const configuredHost = process.argv.find((argument) => argument.startsWith('--host='))?.slice('--host='.length);
const hostPath = resolve(configuredHost ?? process.env.SWITCHBOARD_DEVELOPMENT_CAPTURE_HOST
  ?? join(projectRoot, '.switchboard', 'dev-hosts', 'capture', 'Capture.Host.exe'));
const sampleDurationMs = positiveInteger(process.env.SWITCHBOARD_CAPTURE_SAMPLE_MS, 60_000);
const warmupDurationMs = positiveInteger(process.env.SWITCHBOARD_CAPTURE_WARMUP_MS, 30_000);
const memoryBudgetMb = positiveNumber(process.env.SWITCHBOARD_CAPTURE_VIDEO_MEMORY_MB, 825);
const treeMemoryBudgetMb = positiveNumber(process.env.SWITCHBOARD_CAPTURE_TREE_MEMORY_MB, 1_000);
const includeAudio = process.env.SWITCHBOARD_CAPTURE_INCLUDE_AUDIO === '1';
const isolatedData = await mkdtemp(join(tmpdir(), 'switchboard-capture-measure-'));
const cacheDirectory = join(isolatedData, 'cache');
const clipsDirectory = join(isolatedData, 'clips');
const thumbnailDirectory = join(isolatedData, 'thumbnails');
await Promise.all([mkdir(cacheDirectory), mkdir(clipsDirectory), mkdir(thumbnailDirectory)]);

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const host = spawn(hostPath, [], {
  cwd: dirname(hostPath),
  env: environment,
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const lines = createInterface({ input: host.stdout });
const pending = new Map();
const samples = [];
let stderr = '';
let closed = false;

host.stderr.on('data', (chunk) => { stderr = `${stderr}${String(chunk)}`.slice(-16_384); });
host.once('close', () => { closed = true; });
lines.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.type === 'response' && pending.has(message.requestId)) {
    const request = pending.get(message.requestId);
    pending.delete(message.requestId);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
    return;
  }
  if (message.type !== 'status' || message.status?.kind !== 'capture') return;
  const video = message.status.processes?.find((process) => process.role === 'video-encoder');
  if (!video) return;
  samples.push({
    sampledAt: Date.now(),
    privateMemoryMb: video.privateMemoryMb,
    workingSetMb: video.workingSetMb,
    treePrivateMemoryMb: message.status.processes.reduce((total, process) => total + process.privateMemoryMb, 0),
    totalMemoryMb: message.status.memoryMb,
    cpuPercent: message.status.cpuPercent,
    processes: message.status.processes,
  });
});

try {
  await request('start', {
    enabled: true,
    source: 'display',
    displayIndex: 0,
    fps: 60,
    resolution: '1440p',
    codec: 'av1',
    encoder: 'auto',
    quality: 4,
    replaySeconds: 60,
    includeMic: includeAudio,
    includeSystemAudio: includeAudio,
    includeCursor: false,
    targetVideoBitrateBps: 22_400_000,
    maximumVideoBitrateBps: 28_672_000,
    cacheDirectory,
    clipsDirectory,
    thumbnailDirectory,
  }, 60_000);
  await waitFor(() => samples.length > 0, 20_000, 'Capture.Host did not report a video encoder process.');
  await delay(warmupDurationMs);
  samples.length = 0;
  const sampleStartedAt = Date.now();
  await delay(sampleDurationMs);
  if (samples.length < Math.max(2, Math.floor(sampleDurationMs / 10_000))) {
    throw new Error(`Capture.Host returned only ${samples.length} resource samples.`);
  }

  const privateValues = samples.map((sample) => sample.privateMemoryMb);
  const maximumPrivateMb = Math.max(...privateValues);
  const minimumPrivateMb = Math.min(...privateValues);
  const medianPrivateMb = percentile(privateValues, 0.5);
  const treePrivateValues = samples.map((sample) => sample.treePrivateMemoryMb);
  const medianTreePrivateMb = percentile(treePrivateValues, 0.5);
  const growth = estimateWindowedGrowth(samples, 'privateMemoryMb');
  const result = {
    mode: 'isolated-current-capture-host',
    hostPath,
    sampleDurationMs: Date.now() - sampleStartedAt,
    samples: samples.length,
    videoPrivateMemoryMb: {
      median: round(medianPrivateMb),
      minimum: round(minimumPrivateMb),
      maximum: round(maximumPrivateMb),
      firstWindowMedian: round(growth.firstWindowMedian),
      lastWindowMedian: round(growth.lastWindowMedian),
      growthPerMinute: round(growth.perMinute),
    },
    latestTotalWorkingSetMb: samples.at(-1).totalMemoryMb,
    captureTreePrivateMemoryMb: {
      median: round(medianTreePrivateMb),
      maximum: round(Math.max(...treePrivateValues)),
      budget: treeMemoryBudgetMb,
    },
    latestProcesses: samples.at(-1).processes,
    maximumCpuPercent: Math.max(...samples.map((sample) => sample.cpuPercent)),
    includeAudio,
    budgetMb: memoryBudgetMb,
    withinBudget: medianPrivateMb < memoryBudgetMb
      && medianTreePrivateMb < treeMemoryBudgetMb
      && growth.perMinute < 32,
  };
  console.log(`SWITCHBOARD_CAPTURE_PERFORMANCE ${JSON.stringify(result)}`);
  if (!result.withinBudget) process.exitCode = 1;
} finally {
  try { if (!closed) await request('shutdown', undefined, 15_000); } catch { if (!closed) host.kill(); }
  await waitFor(() => closed, 5_000).catch(() => { if (!closed) host.kill(); });
  lines.close();
  await rm(isolatedData, { recursive: true, force: true });
}

function request(command, payload, timeoutMs) {
  if (closed) return Promise.reject(new Error(`Capture.Host exited before ${command}: ${stderr.trim()}`));
  const requestId = randomUUID();
  return new Promise((resolveRequest, rejectRequest) => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      rejectRequest(new Error(`Capture.Host ${command} timed out. ${stderr.trim()}`));
    }, timeoutMs);
    pending.set(requestId, { resolve: resolveRequest, reject: rejectRequest, timeout });
    host.stdin.write(`${JSON.stringify({ requestId, command, ...(payload === undefined ? {} : { payload }) })}\n`);
  });
}

async function waitFor(predicate, timeoutMs, message = 'Timed out waiting for Capture.Host.') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error(message);
}

function positiveInteger(raw, fallback) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(raw, fallback) {
  const parsed = Number.parseFloat(raw ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds) { return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)); }
function round(value) { return Math.round(value * 10) / 10; }
