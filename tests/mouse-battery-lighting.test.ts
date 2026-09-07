import { expect, test } from 'bun:test';
import { MouseBatteryLighting } from '../src/main/modules/logitech/battery-lighting';
import { defaultMouseBatteryLightingPolicy as defaults, mouseBatteryLightingPolicySchema, updateSettingsInputSchema } from '../src/shared/contracts';

function fixture() {
  let now = 1_000_000;
  const writes: Array<'red' | 'off' | null> = [];
  const timers = new Set<() => void>();
  const delays: number[] = [];
  let queued = Promise.resolve();
  let failure: 'red' | 'off' | 'restore' | undefined;
  const policy = new MouseBatteryLighting({
    now: () => now,
    apply: async value => {
      writes.push(value);
      if (failure === (value ?? 'restore')) throw new Error('HID write rejected');
    },
    enqueue: task => { queued = queued.then(task); },
    schedule: (task, delay) => {
      expect([500, 2000]).toContain(delay);
      delays.push(delay);
      timers.add(task);
      return () => { timers.delete(task); };
    },
  });
  return {
    policy, writes, timers, delays,
    battery: (percentage: number, charging = false) => ({ percentage, charging, updatedAt: now }),
    advance: (ms: number) => { now += ms; },
    fail: (value: typeof failure) => { failure = value; },
    step: async () => { for (const task of [...timers]) task(); await queued; },
    finishFlash: async () => { for (let i = 0; timers.size && i < 6; i++) { for (const task of [...timers]) task(); await queued; } },
  };
}

test('flashes three times over seven seconds and waits the full interval', async () => {
  const f = fixture();
  await f.policy.update(defaults, f.battery(20));
  expect(f.writes).toEqual(['red']);
  expect(f.policy.status).toBe('warning');
  await f.finishFlash();
  expect(f.writes).toEqual(['red', 'off', 'red', 'off', 'red', null]);
  expect(f.delays).toEqual([2000, 500, 2000, 500, 2000]);
  expect(f.timers.size).toBe(0);
  f.advance(299_999);
  await f.policy.update(defaults, f.battery(15));
  expect(f.writes).toHaveLength(6);
  f.advance(1);
  await f.policy.update(defaults, f.battery(15));
  expect(f.writes).toEqual(['red', 'off', 'red', 'off', 'red', null, 'red']);
  await f.policy.dispose();
});

test('cutoff wins over warnings, cancels an in-flight flash, and writes off only once', async () => {
  const f = fixture();
  await f.policy.update(defaults, f.battery(15));
  const staleCallback = [...f.timers][0]!;
  await f.policy.update(defaults, f.battery(10));
  expect(f.policy.status).toBe('cutoff');
  expect(f.timers.size).toBe(0);
  staleCallback();
  await f.finishFlash();
  await f.policy.update(defaults, f.battery(0));
  expect(f.writes).toEqual(['red', 'off']);
  await f.policy.update(defaults, f.battery(5, true));
  expect(f.policy.status).toBe('charging');
  expect(f.writes).toEqual(['red', 'off', null]);
});

test('configuration can disable both policies during a flash with no lingering timer', async () => {
  const f = fixture();
  await f.policy.update(defaults, f.battery(15));
  await f.policy.update({ ...defaults, flashEnabled: false, cutoffEnabled: false }, f.battery(1));
  expect(f.policy.status).toBe('disabled');
  expect(f.writes).toEqual(['red', null]);
  expect(f.timers.size).toBe(0);
});

test('discovery preserves the dark gap and cutoff cancels the remaining flashes', async () => {
  const f = fixture();
  await f.policy.update(defaults, f.battery(15));
  await f.step();
  expect(f.writes).toEqual(['red', 'off']);
  await f.policy.update(defaults, f.battery(15));
  expect(f.writes).toEqual(['red', 'off']);
  expect(f.timers.size).toBe(1);
  const stale = [...f.timers][0]!;
  await f.policy.update(defaults, f.battery(5));
  stale();
  await f.finishFlash();
  expect(f.writes).toEqual(['red', 'off']);
  expect(f.timers.size).toBe(0);
  expect(f.policy.status).toBe('cutoff');
});

test('a failed later flash restores normal lighting and stops the burst', async () => {
  const f = fixture();
  await f.policy.update(defaults, f.battery(15));
  await f.step();
  f.fail('red');
  await f.step();
  expect(f.writes).toEqual(['red', 'off', 'red', null]);
  expect(f.timers.size).toBe(0);
  expect(f.policy.status).toBe('error');
});

test('missing, stale, and fully charged readings never start a warning', async () => {
  const f = fixture();
  await f.policy.update(defaults, undefined);
  expect(f.policy.status).toBe('unavailable');
  const old = f.battery(5);
  f.advance(15_001);
  await f.policy.update(defaults, old);
  expect(f.policy.status).toBe('unavailable');
  await f.policy.update(defaults, { ...f.battery(5), fullyCharged: true });
  expect(f.policy.status).toBe('charging');
  await f.policy.update(defaults, f.battery(80));
  expect(f.policy.status).toBe('monitoring');
  expect(f.writes).toEqual([]);
  expect(f.timers.size).toBe(0);
});

test('failed partial flashes restore and are rate limited', async () => {
  const f = fixture();
  f.fail('red');
  await f.policy.update(defaults, f.battery(15));
  expect(f.policy.status).toBe('error');
  expect(f.policy.reason).toContain('HID write rejected');
  expect(f.writes).toEqual(['red', null]);
  f.advance(5000);
  await f.policy.update(defaults, f.battery(15));
  expect(f.writes).toEqual(['red', null]);
  expect(f.policy.status).toBe('error');
  expect(f.timers.size).toBe(0);
});

test('failed restoration remains visible and retries on the next fresh discovery', async () => {
  const f = fixture();
  await f.policy.update(defaults, f.battery(15));
  f.fail('restore');
  await f.finishFlash();
  expect(f.policy.status).toBe('error');
  expect(f.timers.size).toBe(0);
  f.fail(undefined);
  await f.policy.update(defaults, f.battery(15));
  expect(f.writes.slice(-3)).toEqual([null, null, null]);
  expect(f.policy.status).toBe('error');
});

test('dispose restores once and no callback or update can relight a closed session', async () => {
  const f = fixture();
  await f.policy.update(defaults, f.battery(15));
  const callback = [...f.timers][0]!;
  await f.policy.dispose();
  await f.policy.dispose();
  callback();
  await f.finishFlash();
  await f.policy.update(defaults, f.battery(5));
  expect(f.writes).toEqual(['red', null]);
  expect(f.timers.size).toBe(0);
});

test('custom thresholds and interval apply, including a cutoff above the warning threshold', async () => {
  const f = fixture();
  const custom = { ...defaults, cutoffPercentage: 30, warningPercentage: 20, flashIntervalMinutes: 1 };
  await f.policy.update(custom, f.battery(25));
  expect(f.writes).toEqual(['off']);
  await f.policy.update({ ...custom, cutoffEnabled: false }, f.battery(20));
  expect(f.writes).toEqual(['off', null, 'red']);
  await f.finishFlash();
  f.advance(60_000);
  await f.policy.update({ ...custom, cutoffEnabled: false }, f.battery(20));
  expect(f.writes.at(-1)).toBe('red');
  await f.policy.dispose();
});

test('policy validates percentages and intervals, and unrelated settings patches do not reset it', () => {
  expect(mouseBatteryLightingPolicySchema.safeParse({ cutoffPercentage: -1 }).success).toBe(false);
  expect(mouseBatteryLightingPolicySchema.safeParse({ warningPercentage: 101 }).success).toBe(false);
  expect(mouseBatteryLightingPolicySchema.safeParse({ flashIntervalMinutes: 0 }).success).toBe(false);
  expect(updateSettingsInputSchema.parse({ closeToTray: false })).not.toHaveProperty('mouseBatteryLighting');
});
