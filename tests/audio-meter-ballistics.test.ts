import { describe, expect, test } from 'bun:test';
import { createMeterBallistics, METER_FLOOR_DB } from '../src/renderer/src/components/audio/meter-bus';

describe('meter ballistics', () => {
  test('rises quickly, falls at a steady rate, and settles at the floor', () => {
    const step = createMeterBallistics(24, 0.6);
    let now = 0;
    let reading = step(-12, now);
    for (let frame = 0; frame < 5; frame += 1) reading = step(-12, (now += 16));
    expect(reading.db).toBeGreaterThan(-12.5);

    // A one-frame dip must not drag the display down (the source of flicker).
    reading = step(-40, (now += 16));
    expect(reading.db).toBeGreaterThan(-13);

    // Silence decays at about 24 dB per second, then stops at the floor.
    reading = step(METER_FLOOR_DB, (now += 500));
    expect(reading.db).toBeLessThan(-12);
    for (let frame = 0; frame < 200; frame += 1) reading = step(METER_FLOOR_DB, (now += 16));
    expect(reading.db).toBe(METER_FLOOR_DB);
    expect(reading.settling).toBe(false);
  });
});
