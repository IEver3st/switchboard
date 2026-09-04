import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const explicitDirectory = process.argv.find((argument) => argument.startsWith('--directory='))?.slice('--directory='.length);
const defaultDirectory = process.env.APPDATA
  ? join(process.env.APPDATA, 'switchboard-prototype', 'diagnostics', 'resources')
  : null;
const configuredDirectory = explicitDirectory ?? defaultDirectory;
if (!configuredDirectory) throw new Error('Pass --directory=<resource journal directory>.');
const directory = resolve(configuredDirectory);

const entries = await readdir(directory, { withFileTypes: true });
const files = await Promise.all(entries
  .filter((entry) => entry.isFile() && /^resource-.*\.jsonl$/i.test(entry.name))
  .map(async (entry) => ({ path: join(directory, entry.name), modifiedAt: (await stat(join(directory, entry.name))).mtimeMs })));
files.sort((left, right) => left.modifiedAt - right.modifiedAt);
if (files.length === 0) throw new Error(`No resource journals found in ${directory}.`);

const newestSession = /resource-.*-([0-9a-f-]{36})-\d+\.jsonl$/i.exec(files.at(-1).path)?.[1];
const sessionFiles = newestSession ? files.filter((file) => file.path.includes(newestSession)) : [files.at(-1)];
const samples = [];
for (const file of sessionFiles) {
  for (const line of (await readFile(file.path, 'utf8')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value?.kind === 'resource-sample' && value.schemaVersion === 1) samples.push(value);
    } catch {
      // A final partial line can remain after an abrupt process exit. Earlier samples are still usable.
    }
  }
}
if (samples.length === 0) throw new Error('The newest resource journal contains no readable samples.');
samples.sort((left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt));

const first = samples[0];
const last = samples.at(-1);
const durationMinutes = Math.max(1 / 60, (Date.parse(last.sampledAt) - Date.parse(first.sampledAt)) / 60_000);
const peak = samples.reduce((highest, sample) => sample.totals.attributedMemoryMb > highest.totals.attributedMemoryMb ? sample : highest, first);
const rendererHeapSamples = samples.filter((sample) => Number.isFinite(sample.rendererRuntime?.jsHeapUsedMb));
const anomalySamples = samples.filter((sample) => sample.flags.length > 0);

const roleRows = new Map();
for (const sample of samples) {
  const grouped = new Map();
  for (const item of sample.electronProcesses) {
    const current = grouped.get(item.type) ?? { privateMb: 0, workingSetMb: 0, cpuPercent: 0 };
    current.privateMb += item.privateMb;
    current.workingSetMb += item.workingSetMb;
    current.cpuPercent += item.cpuPercent;
    grouped.set(item.type, current);
  }
  for (const engine of sample.engines) {
    if (engine.processes?.length > 0) {
      for (const resource of engine.processes) {
        grouped.set(`engine:${engine.kind}:${resource.role}`, {
          privateMb: resource.privateMemoryMb,
          workingSetMb: resource.workingSetMb,
          cpuPercent: resource.role === 'host' ? engine.cpuPercent : 0,
        });
      }
    } else {
      grouped.set(`engine:${engine.kind}`, {
        privateMb: engine.reportedMemoryMb,
        workingSetMb: engine.reportedMemoryMb,
        cpuPercent: engine.cpuPercent,
      });
    }
  }
  for (const [role, value] of grouped) {
    const row = roleRows.get(role) ?? { role, firstMb: value.privateMb, lastMb: value.privateMb, peakMb: 0, peakCpuPercent: 0 };
    row.lastMb = value.privateMb;
    row.peakMb = Math.max(row.peakMb, value.privateMb);
    row.peakCpuPercent = Math.max(row.peakCpuPercent, value.cpuPercent);
    roleRows.set(role, row);
  }
}

const debugSamples = samples.filter(sample => sample.debug);
const latestDebug = debugSamples.at(-1);

const report = {
  directory,
  debug: latestDebug ? {
    samples: debugSamples.length,
    startedAt: latestDebug.debug.startedAt,
    sampledAt: latestDebug.sampledAt,
    eventLoopUtilizationPercent: latestDebug.debug.eventLoopUtilizationPercent,
    eventLoopDelayP99Ms: latestDebug.debug.eventLoopDelayP99Ms,
    eventLoopDelayMaxMs: latestDebug.debug.eventLoopDelayMaxMs,
    operations: latestDebug.debug.operations,
    rendererLongTasks: latestDebug.rendererRuntime?.longTasks ?? null,
    timingMeaning: 'Inclusive wall time since recording began, not CPU attribution. Nested operations overlap.',
  } : null,
  samples: samples.length,
  sampledFrom: first.sampledAt,
  sampledThrough: last.sampledAt,
  durationMinutes: round(durationMinutes),
  currentAttributedMemoryMb: last.totals.attributedMemoryMb,
  peakAttributedMemoryMb: peak.totals.attributedMemoryMb,
  peakAt: peak.sampledAt,
  attributedGrowthMbPerMinute: round((last.totals.attributedMemoryMb - first.totals.attributedMemoryMb) / durationMinutes),
  currentCpuPercent: last.totals.cpuPercent,
  anomalySamples: anomalySamples.length,
  renderer: rendererHeapSamples.length > 0 ? {
    route: last.rendererRuntime?.route ?? 'unknown',
    currentJsHeapMb: rendererHeapSamples.at(-1).rendererRuntime.jsHeapUsedMb,
    peakJsHeapMb: Math.max(...rendererHeapSamples.map((sample) => sample.rendererRuntime.jsHeapUsedMb)),
    currentDomNodes: last.rendererRuntime?.domNodes ?? null,
    currentVideoCount: last.rendererRuntime?.videoCount ?? null,
  } : null,
  roles: [...roleRows.values()]
    .map((row) => ({ ...row, growthMb: round(row.lastMb - row.firstMb), peakMb: round(row.peakMb), peakCpuPercent: round(row.peakCpuPercent) }))
    .sort((left, right) => right.peakMb - left.peakMb),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function round(value) {
  return Math.round(value * 10) / 10;
}
