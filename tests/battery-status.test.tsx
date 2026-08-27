import { describe, expect, test } from 'bun:test';
import {
  batteryRuntimeLabel,
  formatBatteryRuntime,
} from '../src/renderer/src/components/device-controls/battery-status-format';
import { defaultDevices } from '../src/shared/defaults';

describe('battery runtime formatting', () => {
  test('uses compact estimates across minute and hour ranges', () => {
    expect(formatBatteryRuntime(0)).toBe('~1m remaining');
    expect(formatBatteryRuntime(18)).toBe('~18m remaining');
    expect(formatBatteryRuntime(60)).toBe('~1h remaining');
    expect(formatBatteryRuntime(1_080)).toBe('~18h remaining');
  });

  test('shows an explicit unavailable estimate when runtime telemetry is missing', () => {
    const label = batteryRuntimeLabel({
      percentage: 74,
      charging: false,
      fullyCharged: false,
      updatedAt: 1_700_000_000_000,
    }, true);

    expect(label).toBe('Estimate unavailable');
  });

  test('does not relabel discharge runtime as a time-to-full estimate while charging', () => {
    const label = batteryRuntimeLabel({
      percentage: 74,
      charging: true,
      fullyCharged: false,
      estimatedMinutesRemaining: 42,
      updatedAt: 1_700_000_000_000,
    }, true);

    expect(label).toBe('Estimate unavailable');
  });

  test('keeps every connected discharging review fixture estimate-capable', () => {
    const batteryDevices = defaultDevices.filter((device) => (
      device.connected
      && device.capabilities.battery
      && !device.capabilities.battery.charging
      && !device.capabilities.battery.fullyCharged
    ));

    expect(batteryDevices.length).toBeGreaterThan(0);
    expect(batteryDevices.map((device) => batteryRuntimeLabel(device.capabilities.battery!, device.connected)))
      .not.toContain('Estimate unavailable');
  });
});
