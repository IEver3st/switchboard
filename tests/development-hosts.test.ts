import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { developmentHostPaths } from '../scripts/development-hosts.mjs';

describe('development native hosts', () => {
  test('uses isolated build outputs instead of stale or locked project binaries', () => {
    const root = join('C:', 'switchboard');
    const paths = developmentHostPaths(root);
    expect(paths.captureExecutable).toBe(join(root, '.switchboard', 'dev-hosts', 'capture', 'Capture.Host.exe'));
    expect(paths.audioExecutable).toBe(join(root, '.switchboard', 'dev-hosts', 'audio', 'Audio.Host.exe'));
  });
});
