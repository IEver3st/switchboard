import { describe, expect, test } from 'bun:test';
import {
  crcCcitt,
  G502OnboardProfile,
  parseOnboardProfilesInfo,
  parseProfileDirectory,
} from '../src/main/modules/logitech/devices/g502-x-plus/onboard-profile';

const profileInfo = parseOnboardProfilesInfo(Uint8Array.from([
  1, 5, 1, 5, 2, 11, 16, 0, 255, 10, 4,
]));

describe('G502 X Plus native onboard profile', () => {
  test('decodes the hardware-captured profile without G HUB metadata', () => {
    const profile = capturedProfile();

    expect(profile.reportRate).toBe(1_000);
    expect(profile.stages).toEqual([800, 1_200, 1_600, 2_400, 3_200]);
    expect(profile.defaultDpi).toBe(1_600);
    expect(profile.shiftDpi).toBe(800);
    expect(profile.shiftButtonMask).toBe(0x0010);
    expect(profile.buttonAssignments.bindings.find((binding) => binding.buttonId === 'dpi-shift')?.currentActionId)
      .toBe('mouse.dpi-shift');
  });

  test('persists a lower DPI Shift without changing unrelated profile bytes', () => {
    const profile = capturedProfile();
    const before = profile.toSector();

    profile.setShiftDpi(400);
    const after = profile.toSector();
    const decoded = new G502OnboardProfile(profileInfo, after);

    expect(decoded.shiftDpi).toBe(400);
    expect(decoded.defaultDpi).toBe(1_600);
    expect(decoded.shiftButtonMask).toBe(0x0010);
    expect(changedOffsets(before, after)).toEqual([3, 4, 253, 254]);
  });

  test('writes native button assignments and static lighting into only their verified fields', () => {
    const profile = capturedProfile();
    const before = profile.toSector();

    profile.setButtonAction('forward', 'mouse.dpi-up');
    profile.setLightingColor('#12abef');
    const after = profile.toSector();
    const decoded = new G502OnboardProfile(profileInfo, after);

    expect(decoded.buttonAssignments.bindings.find((binding) => binding.buttonId === 'forward')?.currentActionId)
      .toBe('mouse.dpi-up');
    expect(decoded.buildLighting('onboard', true)).toMatchObject({
      enabled: true,
      activeEffectId: 'solid',
      color: '#12abef',
      colorWritable: true,
    });
    expect(changedOffsets(before, after).every((offset) => (
      (offset >= 52 && offset <= 55)
      || (offset >= 219 && offset <= 229)
      || offset >= 253
    ))).toBe(true);
  });

  test('updates the stored report rate and validates the rewritten CRC', () => {
    const profile = capturedProfile();
    profile.setReportRate(500);
    const sector = profile.toSector();

    expect(sector[0]).toBe(2);
    expect(crcCcitt(sector.subarray(0, 253))).toBe(sector.readUInt16BE(253));
    expect(new G502OnboardProfile(profileInfo, sector).reportRate).toBe(500);
  });

  test('rejects corrupt or unverified profile data before mutation', () => {
    const corrupt = capturedSector();
    corrupt[40] ^= 1;
    expect(() => new G502OnboardProfile(profileInfo, corrupt)).toThrow('CRC');
    expect(() => new G502OnboardProfile({ ...profileInfo, profileFormatId: 9 }, capturedSector()))
      .toThrow('not verified');
  });

  test('parses the hardware profile directory addresses', () => {
    expect(parseProfileDirectory(Buffer.from('0001010000020100000300000004000000050000ffff0000', 'hex')))
      .toEqual([1, 2, 3, 4, 5]);
  });
});

function capturedProfile(): G502OnboardProfile {
  return new G502OnboardProfile(profileInfo, capturedSector());
}

function capturedSector(): Buffer {
  const sector = Buffer.alloc(255, 0xff);
  Buffer.from('0102002003b00440066009800cffffffff00ffffffffffffffffffff3c002c01', 'hex').copy(sector, 0);
  Buffer.from(
    '8001000180010002800100048001000890070000800100109001000090020000900a00009003000090040000',
    'hex',
  ).copy(sector, 32);
  Buffer.from(
    '0f000000000000006400000f0000000000000064000010000000000000006400001000000000000000640000',
    'hex',
  ).copy(sector, 208);
  sector[252] = 0x03;
  sector.writeUInt16BE(0x94fb, 253);
  return sector;
}

function changedOffsets(before: Uint8Array, after: Uint8Array): number[] {
  return [...before.keys()].filter((offset) => before[offset] !== after[offset]);
}
