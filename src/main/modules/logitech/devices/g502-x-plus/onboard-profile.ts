import type {
  ButtonAssignmentsCapability,
  DeviceProfileMode,
  LightingCapability,
} from '../../../../../shared/contracts';
import { g502XPlusActions, g502XPlusBindings } from './definition';

const supportedMemoryModel = 1;
const supportedProfileFormats = new Set([3, 5]);
const profileDpiCount = 5;
const profileButtonTableOffset = 32;
const profileButtonEntrySize = 4;
const profileLightingOffset = 219;
const profileLightingSize = 11;

export interface OnboardProfilesInfo {
  memoryModelId: number;
  profileFormatId: number;
  macroFormatId: number;
  profileCount: number;
  profileCountOob: number;
  buttonCount: number;
  sectorCount: number;
  sectorSize: number;
  mechanicalLayout: number;
  variousInfo: number;
}

const directButtonSlots: Record<string, number> = {
  primary: 0,
  secondary: 1,
  wheel: 2,
  back: 3,
  'dpi-shift': 4,
  forward: 5,
};

const actionEntries: Record<string, readonly [number, number, number, number]> = {
  'mouse.primary-click': [0x80, 0x01, 0x00, 0x01],
  'mouse.secondary-click': [0x80, 0x01, 0x00, 0x02],
  'mouse.middle-click': [0x80, 0x01, 0x00, 0x04],
  'mouse.back': [0x80, 0x01, 0x00, 0x08],
  'mouse.forward': [0x80, 0x01, 0x00, 0x10],
  'mouse.dpi-up': [0x90, 0x03, 0x00, 0x00],
  'mouse.dpi-down': [0x90, 0x04, 0x00, 0x00],
  'mouse.dpi-shift': [0x90, 0x07, 0x00, 0x00],
};

export function parseOnboardProfilesInfo(payload: Uint8Array): OnboardProfilesInfo {
  const sectorSize = ((payload[7] ?? 0) << 8) | (payload[8] ?? 0);
  if (payload.length < 11 || sectorSize < 16) throw new Error('The mouse returned invalid onboard-profile metadata.');
  return {
    memoryModelId: payload[0]!,
    profileFormatId: payload[1]!,
    macroFormatId: payload[2]!,
    profileCount: payload[3]!,
    profileCountOob: payload[4]!,
    buttonCount: payload[5]!,
    sectorCount: payload[6]!,
    sectorSize,
    mechanicalLayout: payload[9]!,
    variousInfo: payload[10]!,
  };
}

export function parseProfileDirectory(sector: Uint8Array): number[] {
  const addresses: number[] = [];
  for (let offset = 0; offset + 3 < sector.length; offset += 4) {
    const address = ((sector[offset] ?? 0) << 8) | (sector[offset + 1] ?? 0);
    if (address === 0xffff) break;
    if (address > 0) addresses.push(address);
  }
  return addresses;
}

export function crcCcitt(data: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of data) {
    const temp = (crc >>> 8) ^ byte;
    crc = (crc << 8) & 0xffff;
    let quick = temp ^ (temp >>> 4);
    crc ^= quick;
    quick <<= 5;
    crc ^= quick;
    quick <<= 7;
    crc ^= quick;
    crc &= 0xffff;
  }
  return crc;
}

export class G502OnboardProfile {
  private readonly data: Buffer;

  public constructor(
    public readonly info: OnboardProfilesInfo,
    sector: Uint8Array,
  ) {
    if (info.memoryModelId !== supportedMemoryModel || !supportedProfileFormats.has(info.profileFormatId)) {
      throw new Error(`Onboard profile layout ${info.memoryModelId}/${info.profileFormatId} is not verified for safe writes.`);
    }
    if (sector.length !== info.sectorSize || sector.length < profileLightingOffset + profileLightingSize + 2) {
      throw new Error('The onboard profile sector has an invalid size.');
    }
    const storedCrc = ((sector[sector.length - 2] ?? 0) << 8) | (sector[sector.length - 1] ?? 0);
    const computedCrc = crcCcitt(sector.subarray(0, sector.length - 2));
    if (storedCrc !== computedCrc) throw new Error('The onboard profile CRC is invalid.');
    if ((sector[1] ?? profileDpiCount) >= profileDpiCount || (sector[2] ?? profileDpiCount) >= profileDpiCount) {
      throw new Error('The onboard profile contains an invalid DPI stage index.');
    }
    this.data = Buffer.from(sector);
  }

  public get reportRate(): number {
    return 1_000 / Math.max(1, this.data[0]!);
  }

  public get stages(): number[] {
    return Array.from({ length: profileDpiCount }, (_, index) => this.dpiAt(index))
      .filter((value) => value > 0 && value !== 0xffff);
  }

  public get defaultDpi(): number {
    return this.dpiAt(this.data[1]!);
  }

  public get shiftDpi(): number {
    return this.dpiAt(this.data[2]!);
  }

  public get shiftButtonMask(): number {
    for (let slot = 0; slot < Math.min(this.info.buttonCount, 16); slot += 1) {
      if (this.actionAt(slot) === 'mouse.dpi-shift') return 1 << slot;
    }
    return 0;
  }

  public get buttonAssignments(): ButtonAssignmentsCapability {
    return this.buildButtonAssignments('onboard', true);
  }

  public buildButtonAssignments(profileMode: DeviceProfileMode, writable: boolean): ButtonAssignmentsCapability {
    const unavailableReason = writable ? undefined : 'Enable onboard memory to change stored button assignments.';
    const bindings = g502XPlusBindings.map((binding) => ({
      ...binding,
      currentActionId: this.actionAt(directButtonSlots[binding.buttonId]!) ?? 'system.custom',
    }));
    const availableActions = bindings.some((binding) => binding.currentActionId === 'system.custom')
      ? [...structuredClone(g502XPlusActions), {
          id: 'system.custom',
          label: 'Existing onboard assignment',
          category: 'system' as const,
          searchTerms: ['custom', 'onboard'],
          selectable: false,
        }]
      : structuredClone(g502XPlusActions);
    return { writable, profileMode, bindings, availableActions, unavailableReason };
  }

  public buildLighting(profileMode: DeviceProfileMode, writable: boolean): LightingCapability {
    const mode = this.data[profileLightingOffset]!;
    const solid = mode === 0x01;
    const off = mode === 0x00;
    const activeEffectId = solid || off ? 'solid' : 'stored';
    const availableEffects = activeEffectId === 'stored'
      ? [{ id: 'stored', label: 'Stored effect' }, { id: 'solid', label: 'Static' }]
      : [{ id: 'solid', label: 'Static' }];
    return {
      writable,
      enabled: !off,
      activeEffectId,
      availableEffects,
      color: solid ? rgbToHex(this.data.subarray(profileLightingOffset + 1, profileLightingOffset + 4)) : undefined,
      colorWritable: writable && solid,
      brightnessWritable: false,
      speedWritable: false,
      profiles: [],
      muteLinked: false,
      muteLinkedWritable: false,
      physicalEffectVerified: false,
      profileMode,
      source: 'firmware',
      unavailableReason: writable ? undefined : 'Enable onboard memory to change stored lighting.',
    };
  }

  public setBaseDpi(value: number): void {
    const existing = this.stageIndex(value);
    const shiftIndex = this.data[2]!;
    const defaultIndex = this.data[1]!;
    const target = existing >= 0 ? existing : defaultIndex !== shiftIndex
      ? defaultIndex
      : Array.from({ length: profileDpiCount }, (_, index) => index).find((index) => index !== shiftIndex);
    if (target === undefined || target < 0) throw new Error('The onboard profile has no safe DPI stage for the base sensitivity.');
    this.writeDpi(target, value);
    this.data[1] = target;
  }

  public setStages(values: number[], activeDpi: number): void {
    const stages = [...new Set(values)].sort((left, right) => left - right);
    if (!stages.includes(activeDpi)) stages.push(activeDpi);
    const shiftDpi = this.shiftDpi;
    if (!stages.includes(shiftDpi)) stages.push(shiftDpi);
    if (stages.length > profileDpiCount) throw new Error('The mouse can store at most five DPI stages, including DPI Shift.');
    stages.sort((left, right) => left - right);
    for (let index = 0; index < profileDpiCount; index += 1) this.writeDpi(index, stages[index] ?? 0);
    this.data[1] = stages.indexOf(activeDpi);
    this.data[2] = stages.indexOf(shiftDpi);
  }

  public setShiftDpi(value: number): void {
    const defaultIndex = this.data[1]!;
    const currentShiftIndex = this.data[2]!;
    const existing = this.stageIndex(value);
    const unused = Array.from({ length: profileDpiCount }, (_, index) => index)
      .find((index) => index !== defaultIndex && this.dpiAt(index) === 0);
    const target = currentShiftIndex !== defaultIndex && this.shiftButtonMask !== 0
      ? currentShiftIndex
      : existing >= 0 && existing !== defaultIndex
        ? existing
        : unused;
    if (target === undefined) throw new Error('All non-default DPI stages are in use; no safe DPI Shift slot is available.');
    this.writeDpi(target, value);
    this.data[2] = target;
    this.setButtonAction('dpi-shift', 'mouse.dpi-shift');
  }

  public setReportRate(value: number): void {
    const interval = 1_000 / value;
    if (!Number.isInteger(interval) || interval < 1 || interval > 8) throw new Error(`${value.toLocaleString()} Hz cannot be stored by this mouse.`);
    this.data[0] = interval;
  }

  public setButtonAction(buttonId: string, actionId: string): void {
    const slot = directButtonSlots[buttonId];
    const entry = actionEntries[actionId];
    if (slot === undefined || slot >= this.info.buttonCount || !entry) throw new Error('That onboard button assignment is not supported.');
    this.data.set(entry, profileButtonTableOffset + slot * profileButtonEntrySize);
  }

  public setLightingEnabled(enabled: boolean, fallbackColor = '#ff1744'): void {
    if (!enabled) {
      this.data.fill(0, profileLightingOffset, profileLightingOffset + profileLightingSize);
      return;
    }
    this.setLightingColor(this.lightingColor ?? fallbackColor);
  }

  public setLightingColor(color: string): void {
    const rgb = parseHexColor(color);
    this.data.fill(0, profileLightingOffset, profileLightingOffset + profileLightingSize);
    this.data[profileLightingOffset] = 0x01;
    this.data.set(rgb, profileLightingOffset + 1);
  }

  public get lightingColor(): string | undefined {
    return this.data[profileLightingOffset] === 0x01
      ? rgbToHex(this.data.subarray(profileLightingOffset + 1, profileLightingOffset + 4))
      : undefined;
  }

  public toSector(): Buffer {
    const next = Buffer.from(this.data);
    const crc = crcCcitt(next.subarray(0, next.length - 2));
    next.writeUInt16BE(crc, next.length - 2);
    return next;
  }

  private actionAt(slot: number): string | undefined {
    const offset = profileButtonTableOffset + slot * profileButtonEntrySize;
    const encoded = this.data.subarray(offset, offset + profileButtonEntrySize);
    return Object.entries(actionEntries).find(([, entry]) => entry.every((byte, index) => encoded[index] === byte))?.[0];
  }

  private dpiAt(index: number): number {
    return this.data.readUInt16LE(3 + index * 2);
  }

  private stageIndex(value: number): number {
    return Array.from({ length: profileDpiCount }, (_, index) => this.dpiAt(index)).indexOf(value);
  }

  private writeDpi(index: number, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error('DPI is outside the onboard profile range.');
    this.data.writeUInt16LE(value, 3 + index * 2);
  }
}

function parseHexColor(color: string): Buffer {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Lighting color must use #RRGGBB format.');
  return Buffer.from(color.slice(1), 'hex');
}

function rgbToHex(rgb: Uint8Array): string {
  return `#${Buffer.from(rgb).toString('hex').padEnd(6, '0')}`;
}
