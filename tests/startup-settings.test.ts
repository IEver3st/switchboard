import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { consumeBackgroundUpdate, markBackgroundUpdate, readSoftwareRenderingPreference } from '../src/main/startup-settings';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('startup settings', () => {
  test('returns only the next background update launch to tray and rejects stale or malformed markers', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-background-update-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'background-update.json');
    markBackgroundUpdate(filePath, true);
    expect(consumeBackgroundUpdate(filePath, true)).toBe(true);
    expect(consumeBackgroundUpdate(filePath, true)).toBe(false);
    markBackgroundUpdate(filePath, true);
    expect(consumeBackgroundUpdate(filePath, false)).toBe(false);
    expect(consumeBackgroundUpdate(filePath, true)).toBe(false);
    markBackgroundUpdate(filePath, true);
    markBackgroundUpdate(filePath, false);
    expect(consumeBackgroundUpdate(filePath, true)).toBe(false);
    await writeFile(filePath, JSON.stringify({ requestedAt: 1 }));
    expect(consumeBackgroundUpdate(filePath, true)).toBe(false);
    await writeFile(filePath, '{invalid');
    expect(consumeBackgroundUpdate(filePath, true)).toBe(false);
  });
  test('recovers the rendering preference from backup only when the primary is unreadable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-startup-backup-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');
    await writeFile(`${filePath}.bak`, JSON.stringify({ settings: { softwareRendering: true } }));
    await writeFile(filePath, '\0\0\0');
    expect(readSoftwareRenderingPreference(filePath)).toBe(true);
    await writeFile(filePath, '\uFEFF' + JSON.stringify({ settings: { softwareRendering: false } }));
    expect(readSoftwareRenderingPreference(filePath)).toBe(false);
  });
  test('enables software rendering only for an explicit valid persisted preference', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-startup-settings-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');

    await writeFile(filePath, JSON.stringify({ settings: { softwareRendering: true, unrelated: 'ignored' } }), 'utf8');
    expect(readSoftwareRenderingPreference(filePath)).toBe(true);

    await writeFile(filePath, JSON.stringify({ settings: { softwareRendering: false } }), 'utf8');
    expect(readSoftwareRenderingPreference(filePath)).toBe(false);
  });

  test('fails closed for missing, malformed, or incorrectly typed state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-startup-settings-invalid-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'switchboard-state.json');

    expect(readSoftwareRenderingPreference(filePath)).toBe(false);
    await writeFile(filePath, '{invalid', 'utf8');
    expect(readSoftwareRenderingPreference(filePath)).toBe(false);
    await writeFile(filePath, JSON.stringify({ settings: { softwareRendering: 'yes' } }), 'utf8');
    expect(readSoftwareRenderingPreference(filePath)).toBe(false);
  });
});
