import { app, BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const projectRoot = resolve(import.meta.dirname, '..');
const isolatedUserData = process.env.SWITCHBOARD_IDLE_USER_DATA;
if (!isolatedUserData) throw new Error('SWITCHBOARD_IDLE_USER_DATA must point to an isolated temporary directory.');
const sampleDurationMs = positiveInteger(process.env.SWITCHBOARD_IDLE_SAMPLE_MS, 60_000);
const warmupDurationMs = positiveInteger(process.env.SWITCHBOARD_IDLE_WARMUP_MS, 10_000);
const sampleIntervalMs = positiveInteger(process.env.SWITCHBOARD_IDLE_INTERVAL_MS, 1_000);
const openMemoryBudgetMb = positiveNumber(process.env.SWITCHBOARD_IDLE_OPEN_MEMORY_MB, 180);
const openCpuBudgetPercent = positiveNumber(process.env.SWITCHBOARD_IDLE_OPEN_CPU_PERCENT, 0.7);
const trayMemoryBudgetMb = positiveNumber(process.env.SWITCHBOARD_IDLE_TRAY_MEMORY_MB, 70);
const trayCpuBudgetPercent = positiveNumber(process.env.SWITCHBOARD_IDLE_TRAY_CPU_PERCENT, 0.3);

app.setName('switchboard-idle-measure');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
if (process.env.SWITCHBOARD_IDLE_REAL_DEVICES !== '1') process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await import('../out/main/index.js');

void app.whenReady().then(async () => {
  const window = await waitForWindow();
  await waitForRendererLoad(window);
  await waitForControlPlane(window);

  const open = await measureState('open-idle', warmupDurationMs, sampleDurationMs, sampleIntervalMs);
  window.close();
  await waitForRendererDestroyed();
  const tray = await measureState('tray-idle', warmupDurationMs, sampleDurationMs, sampleIntervalMs);

  const result = {
    mode: process.env.SWITCHBOARD_IDLE_REAL_DEVICES === '1' ? 'isolated-live-devices' : 'isolated-native-fixtures',
    sampleDurationMs,
    sampleIntervalMs,
    open: withBudget(open, openMemoryBudgetMb, openCpuBudgetPercent),
    tray: withBudget(tray, trayMemoryBudgetMb, trayCpuBudgetPercent),
  };
  console.log(`SWITCHBOARD_IDLE ${JSON.stringify(result)}`);
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = result.open.withinBudget && result.tray.withinBudget ? '0' : '1';
  app.quit();
}).catch((error) => {
  console.error('Idle performance measurement failed.', error);
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1';
  app.quit();
});

async function measureState(name, warmupMs, durationMs, intervalMs) {
  await delay(warmupMs);
  let previousMetrics = app.getAppMetrics();
  let previousSampleAt = performance.now();
  await delay(intervalMs);

  const samples = [];
  const deadline = performance.now() + durationMs;
  while (performance.now() < deadline) {
    const metrics = app.getAppMetrics();
    const sampledAt = performance.now();
    const cpuByPid = calculateCpuByPid(previousMetrics, metrics, sampledAt - previousSampleAt);
    samples.push({
      cpuPercent: sum([...cpuByPid.values()]),
      privateMemoryMb: sum(metrics.map((metric) => metric.memory.privateBytes ?? 0)) / 1_024,
      residentSetMb: sum(metrics.map((metric) => metric.memory.workingSetSize)) / 1_024,
      processCount: metrics.length,
      processes: metrics.map((metric) => ({
        pid: metric.pid,
        type: metric.type,
        name: metric.name ?? metric.serviceName ?? null,
        cpuPercent: round(cpuByPid.get(metric.pid) ?? metric.cpu.percentCPUUsage),
        privateMemoryMb: round((metric.memory.privateBytes ?? 0) / 1_024),
        residentSetMb: round(metric.memory.workingSetSize / 1_024),
      })),
    });
    previousMetrics = metrics;
    previousSampleAt = sampledAt;
    await delay(intervalMs);
  }

  if (samples.length === 0) throw new Error(`${name} produced no samples.`);
  const last = samples.at(-1);
  const processes = last.processes.map((process) => {
    const observations = samples
      .map((sample) => sample.processes.find((candidate) => candidate.pid === process.pid))
      .filter(Boolean);
    return {
      pid: process.pid,
      type: process.type,
      name: process.name,
      cpuPercent: summarize(observations.map((observation) => observation.cpuPercent)),
      privateMemoryMb: summarize(observations.map((observation) => observation.privateMemoryMb)),
      residentSetMb: summarize(observations.map((observation) => observation.residentSetMb)),
    };
  });
  const windowsResources = await readWindowsResources(processes.map((process) => process.pid));
  return {
    name,
    sampleCount: samples.length,
    privateMemoryMb: summarize(samples.map((sample) => sample.privateMemoryMb)),
    residentSetMb: summarize(samples.map((sample) => sample.residentSetMb)),
    cpuPercent: summarize(samples.map((sample) => sample.cpuPercent)),
    processCount: summarize(samples.map((sample) => sample.processCount)),
    ...windowsResources,
    processes,
  };
}

function calculateCpuByPid(previousMetrics, metrics, elapsedMs) {
  const previousByProcess = new Map(previousMetrics.map((metric) => [`${metric.pid}:${metric.creationTime}`, metric]));
  const logicalProcessorCount = Math.max(1, cpus().length);
  return new Map(metrics.map((metric) => {
    const previous = previousByProcess.get(`${metric.pid}:${metric.creationTime}`);
    const before = previous?.cpu.cumulativeCPUUsage;
    const after = metric.cpu.cumulativeCPUUsage;
    const percent = typeof before === 'number' && typeof after === 'number' && elapsedMs > 0
      ? Math.max(0, after - before) / (elapsedMs / 1_000) / logicalProcessorCount * 100
      : metric.cpu.percentCPUUsage;
    return [metric.pid, percent];
  }));
}

async function readWindowsResources(processIds) {
  if (process.platform !== 'win32' || processIds.length === 0) return {};
  const ids = processIds.filter(Number.isInteger).join(',');
  const source = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SwitchboardGuiResources {
  [DllImport("user32.dll")] public static extern int GetGuiResources(IntPtr process, int flags);
}
'@
$items = Get-Process -Id ${ids} -ErrorAction SilentlyContinue | ForEach-Object {
  [pscustomobject]@{
    handles = $_.HandleCount
    gdi = [SwitchboardGuiResources]::GetGuiResources($_.Handle, 0)
    user = [SwitchboardGuiResources]::GetGuiResources($_.Handle, 1)
  }
}
[pscustomobject]@{
  handleCount = ($items | Measure-Object -Property handles -Sum).Sum
  gdiObjects = ($items | Measure-Object -Property gdi -Sum).Sum
  userObjects = ($items | Measure-Object -Property user -Sum).Sum
} | ConvertTo-Json -Compress
`;
  try {
    const encoded = Buffer.from(source, 'utf16le').toString('base64');
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: 10_000,
    });
    return JSON.parse(stdout.trim());
  } catch (error) {
    return { resourceSampleError: error instanceof Error ? error.message : String(error) };
  }
}

function withBudget(measurement, memoryBudgetMb, cpuBudgetPercent) {
  const withinMemoryBudget = measurement.privateMemoryMb.median < memoryBudgetMb;
  const withinCpuBudget = measurement.cpuPercent.median < cpuBudgetPercent;
  return {
    ...measurement,
    budget: { privateMemoryMb: memoryBudgetMb, cpuPercent: cpuBudgetPercent },
    withinMemoryBudget,
    withinCpuBudget,
    withinBudget: withinMemoryBudget && withinCpuBudget,
  };
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    minimum: round(sorted[0]),
    median: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    maximum: round(sorted.at(-1)),
  };
}

function percentile(sorted, quantile) {
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function waitForWindow() {
  const deadline = performance.now() + 20_000;
  while (performance.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
    if (candidate) return candidate;
    await delay(10);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForRendererLoad(window) {
  if (!window.webContents.isLoadingMainFrame()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer load timed out.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForControlPlane(window) {
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('main')) && !document.querySelector('.startup-screen')`,
    );
    if (ready) return;
    await delay(25);
  }
  throw new Error('Control plane did not become ready.');
}

async function waitForRendererDestroyed() {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if (BrowserWindow.getAllWindows().every((window) => window.isDestroyed())) return;
    await delay(25);
  }
  throw new Error('Renderer was not destroyed after closing to tray.');
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
