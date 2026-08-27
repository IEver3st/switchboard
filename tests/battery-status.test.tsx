import { describe, expect, test } from 'bun:test';
import {
  batteryRuntimeLabel,
  formatBatteryRuntime,
} from '../src/renderer/src/components/device-controls/battery-status-format';

describe('battery runtime formatting', () => {
  test('uses compact natural-language estimates across minute and hour ranges', () => {
    expect(formatBatteryRuntime(0)).toBe('~1 minute remaining');
    expect(formatBatteryRuntime(18)).toBe('~18 minutes remaining');
    expect(formatBatteryRuntime(60)).toBe('~1 hour remaining');
    expect(formatBatteryRuntime(1_080)).toBe('~18 hours remaining');
  });

  test('shows an explicit unavailable estimate when hardware reports percentage without runtime telemetry', () => {
    const label = batteryRuntimeLabel({
      percentage: 74,
      charging: false,
      fullyCharged: false,
      updatedAt: 1_700_000_000_000,
    }, true);

    expect(label).toBe('Estimate unavailable');
  });
});
