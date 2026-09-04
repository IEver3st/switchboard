import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResourceJournal, type ResourceTelemetrySample } from '../src/main/services/resource-journal';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('resource journal', () => {
  test('bounds queued writes and reports dropped records', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-resource-queue-'));
    temporaryDirectories.push(directory);
    const journal = new ResourceJournal({ directory, getRetentionDays: () => 1 });
    for (let index = 0; index < 100; index++) journal.record(sample(index));
    expect(journal.getDroppedWrites()).toBe(96);
    await journal.dispose();
    const files = await readdir(directory);
    const lines = (await readFile(join(directory, files[0]!), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(4);
    journal.record(sample(101));
    expect(journal.getDroppedWrites()).toBe(96);
  });
  test('writes bounded JSONL parts and removes only expired resource journals', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-resource-journal-'));
    temporaryDirectories.push(directory);
    const oldResourcePath = join(directory, 'resource-old.jsonl');
    const unrelatedPath = join(directory, 'keep.txt');
    await writeFile(oldResourcePath, '{}\n');
    await writeFile(unrelatedPath, 'keep');
    const oldTime = new Date(Date.UTC(2026, 6, 1));
    await utimes(oldResourcePath, oldTime, oldTime);

    const journal = new ResourceJournal({
      directory,
      getRetentionDays: () => 1,
      maximumFileBytes: 1_600,
      now: () => Date.UTC(2026, 8, 2),
    });
    journal.record(sample(1));
    journal.record(sample(2));
    await journal.dispose();

    const files = await readdir(directory);
    expect(files).toContain('keep.txt');
    expect(files).not.toContain('resource-old.jsonl');
    const journals = files.filter((file) => /^resource-.*\.jsonl$/.test(file)).sort();
    expect(journals.length).toBeGreaterThanOrEqual(1);
    const records = (await Promise.all(journals.map((file) => readFile(join(directory, file), 'utf8'))))
      .join('')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    expect(records.map((record) => record.sequence)).toEqual([1, 2]);
  });
});

function sample(sequence: number): ResourceTelemetrySample {
  return {
    schemaVersion: 1,
    kind: 'resource-sample',
    sampledAt: new Date(Date.UTC(2026, 8, 2, 0, 0, sequence)).toISOString(),
    sequence,
    uptimeSeconds: sequence,
    rendererActive: true,
    guardState: 'collecting',
    flags: [],
    budget: { memoryMb: 180, cpuPercent: 0.7 },
    totals: { electronPrivateMb: 120, electronWorkingSetMb: 150, engineReportedMemoryMb: 0, attributedMemoryMb: 120, cpuPercent: 0.2, processCount: 2 },
    electronProcesses: [{ pid: 2, type: 'Tab', privateMb: 80, workingSetMb: 100, peakWorkingSetMb: 100, cpuPercent: 0.1 }],
    engines: [],
    mainRuntime: { rssMb: 40, heapUsedMb: 8, heapTotalMb: 12, externalMb: 1, arrayBuffersMb: 0, activeResources: {} },
    rendererRuntime: null,
    system: { totalMemoryMb: 32_768, freeMemoryMb: 16_384 },
  };
}
