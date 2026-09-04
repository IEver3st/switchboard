import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  developmentHostPaths,
  formatBlockingHostsError,
  parseBlockingDevHosts,
} from '../scripts/development-hosts.mjs';

describe('development native hosts', () => {
  test('uses isolated build outputs instead of stale or locked project binaries', () => {
    const root = join('C:', 'switchboard');
    const paths = developmentHostPaths(root);
    expect(paths.captureExecutable).toBe(join(root, '.switchboard', 'dev-hosts', 'capture', 'Capture.Host.exe'));
    expect(paths.audioExecutable).toBe(join(root, '.switchboard', 'dev-hosts', 'audio', 'Audio.Host.exe'));
  });

  test('parses blocking dev-host processes from PowerShell output', () => {
    expect(parseBlockingDevHosts('')).toEqual([]);
    expect(parseBlockingDevHosts('null')).toEqual([]);
    expect(parseBlockingDevHosts('not json')).toEqual([]);
    expect(parseBlockingDevHosts('{"pid":45164,"path":"C:\\\\switchboard\\\\.switchboard\\\\dev-hosts\\\\capture\\\\Capture.Host.exe"}')).toEqual([
      { pid: 45164, path: 'C:\\switchboard\\.switchboard\\dev-hosts\\capture\\Capture.Host.exe' },
    ]);
    expect(parseBlockingDevHosts('[{"pid":"x","path":null}]')).toEqual([]);
  });

  test('blocking-host error names the process and the remedy', () => {
    const message = formatBlockingHostsError([{ pid: 45164, path: 'C:\\switchboard\\.switchboard\\dev-hosts\\capture\\Capture.Host.exe' }]);
    expect(message).toContain('45164');
    expect(message).toContain('SWITCHBOARD_SKIP_NATIVE_BUILD=1');
    expect(message).toContain('system tray');
  });
});
