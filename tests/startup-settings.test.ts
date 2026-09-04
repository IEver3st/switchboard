import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readSoftwareRenderingPreference } from '../src/main/startup-settings';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('startup settings', () => {
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
