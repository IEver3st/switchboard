import { describe, expect, it } from 'bun:test';
import { getDevLaunchOptions } from '../scripts/dev-options.mjs';
import { requestsDemoUpdate } from '../src/main/development-flags';

describe('development flags', () => {
  it('recognizes the update demo from first- and second-instance launch data', () => {
    expect(requestsDemoUpdate(['electron', '.', '--demo-update'], false)).toBeTrue();
    expect(requestsDemoUpdate(['electron', '.'], false, { demoUpdate: true })).toBeTrue();
    expect(requestsDemoUpdate(
      ['electron', '.'],
      false,
      undefined,
      { SWITCHBOARD_DEMO_UPDATE: '1' },
    )).toBeTrue();
    expect(requestsDemoUpdate(['electron', '.'], false)).toBeFalse();
  });

  it('never enables the update demo in a packaged build', () => {
    expect(requestsDemoUpdate(
      ['switchboard.exe', '--demo-update'],
      true,
      { demoUpdate: true },
      { SWITCHBOARD_DEMO_UPDATE: '1' },
    )).toBeFalse();
  });

  it('carries the Bun dev flag through electron-vite without forwarding it as a Vite option', () => {
    const launch = getDevLaunchOptions(
      ['--demo-update', '--host'],
      { ELECTRON_RUN_AS_NODE: '1' },
    );

    expect(launch.forwardedArguments).toEqual(['--host']);
    expect(launch.environment.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(launch.environment.SWITCHBOARD_DEMO_UPDATE).toBe('1');
    expect(requestsDemoUpdate(['electron', '.'], false, undefined, launch.environment)).toBeTrue();
  });
});
