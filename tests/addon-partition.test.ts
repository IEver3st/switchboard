import { describe, expect, test } from 'bun:test';
import { addonPartitionName } from '../src/main/modules/addon-partition';

describe('sandboxed add-on partition identity', () => {
  test('reuses one bounded partition per canonical module ID', () => {
    const first = addonPartitionName('device.example.keyboard');
    expect(addonPartitionName('device.example.keyboard')).toBe(first);
    expect(addonPartitionName('device.example.mouse')).not.toBe(first);
    expect(first).toMatch(/^switchboard-addon-[a-f0-9]{24}$/);
  });
});
