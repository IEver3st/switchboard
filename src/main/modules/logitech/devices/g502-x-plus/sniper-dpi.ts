import type { Device as HidDevice } from 'node-hid';
import type { BatteryCapability, DpiCapability, ReportRateCapability } from '../../../../../shared/contracts';
import { HidppLongTransport } from '../../hidpp-long-transport';

const deviceNameFeatureId = 0x0005;
const unifiedBatteryFeatureId = 0x1004;
const adjustableDpiFeatureId = 0x2201;
const adjustableReportRateFeatureId = 0x8060;
const mouseButtonSpyFeatureId = 0x8110;
const sniperButtonMask = 0x0020;
const sensorIndex = 0;
const receiverSlotIndexes = [1] as const;

interface AdjustableDpiIo {
  read(): Promise<number>;
  write(dpi: number): Promise<void>;
}

/**
 * Keeps the user's base DPI separate from the temporary held value. The queue
 * guarantees that a quick press/release always writes shift then restore in
 * order, and dispose restores before the HID handle is released.
 */
export class SniperDpiRuntime {
  private baseDpi: number;
  private shiftDpi: number;
  private held = false;
  private restoreDpi: number | null = null;
  private tail: Promise<void> = Promise.resolve();
  private acceptingInput = true;

  public constructor(
    private readonly io: AdjustableDpiIo,
    initialDpi: number,
    initialShiftDpi: number,
    private readonly onBackgroundError: (error: Error) => void = () => undefined,
  ) {
    this.baseDpi = initialDpi;
    this.shiftDpi = initialShiftDpi;
  }

  public get currentBaseDpi(): number {
    return this.baseDpi;
  }

  public get currentShiftDpi(): number {
    return this.shiftDpi;
  }

  public handleButtonBitmap(bitmap: number): void {
    if (!this.acceptingInput) return;
    const nextHeld = (bitmap & sniperButtonMask) !== 0;
    if (nextHeld === this.held) return;
    this.held = nextHeld;

    if (nextHeld) {
      this.restoreDpi = this.baseDpi;
      void this.enqueue(() => this.io.write(this.shiftDpi)).catch(this.onBackgroundError);
      return;
    }

    const restore = this.restoreDpi;
    this.restoreDpi = null;
    if (restore !== null) {
      void this.enqueue(() => this.io.write(restore)).catch(this.onBackgroundError);
    }
  }

  public async refreshBaseDpi(): Promise<number> {
    if (this.held) return this.baseDpi;
    const value = await this.enqueue(() => this.io.read());
    this.baseDpi = value;
    return value;
  }

  public async setBaseDpi(value: number): Promise<void> {
    if (this.held) {
      this.baseDpi = value;
      this.restoreDpi = value;
      return;
    }
    await this.enqueue(() => this.io.write(value));
    this.baseDpi = value;
  }

  public async setShiftDpi(value: number): Promise<void> {
    this.shiftDpi = value;
    if (this.held) await this.enqueue(() => this.io.write(value));
  }

  public async dispose(): Promise<void> {
    if (!this.acceptingInput) return;
    this.acceptingInput = false;
    const restore = this.restoreDpi;
    this.restoreDpi = null;
    this.held = false;
    if (restore !== null) {
      try {
        await this.enqueue(() => this.io.write(restore));
      } catch (error) {
        this.onBackgroundError(error instanceof Error ? error : new Error(String(error)));
      }
    }
    await this.tail;
  }

  public idle(): Promise<void> {
    return this.tail;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export class G502SniperDpiSession {
  private readonly runtime: SniperDpiRuntime;
  private readonly supportedDpi: number[];
  private supportedReportRates: number[] = [];
  private stages: number[];
  private unsubscribe: (() => void) | null;
  private closed = false;

  private constructor(
    private readonly transport: HidppLongTransport,
    private readonly deviceIndex: number,
    private readonly dpiFeatureIndex: number,
    private readonly buttonSpyFeatureIndex: number,
    private readonly batteryFeatureIndex: number | null,
    private readonly reportRateFeatureIndex: number | null,
    supportedDpi: number[],
    currentDpi: number,
    preferredShiftDpi: number | undefined,
    preferredStages: number[] | undefined,
  ) {
    this.supportedDpi = supportedDpi;
    const shiftDpi = selectShiftDpi(supportedDpi, currentDpi, preferredShiftDpi);
    this.stages = selectStages(supportedDpi, currentDpi, preferredStages);
    const io: AdjustableDpiIo = {
      read: () => this.readCurrentDpi(),
      write: (dpi) => this.writeCurrentDpi(dpi),
    };
    this.runtime = new SniperDpiRuntime(io, currentDpi, shiftDpi, (error) => {
      console.warn('G502 X Plus DPI Shift transition failed.', error);
    });
    this.unsubscribe = this.transport.subscribe((report) => this.handleNotification(report));
  }

  public static async open(
    endpoint: HidDevice,
    previous: DpiCapability | undefined,
  ): Promise<G502SniperDpiSession> {
    if (!endpoint.path) throw new Error('The Logitech HID++ long-report path is unavailable.');
    const transport = await HidppLongTransport.open(endpoint.path);
    try {
      const deviceIndex = await findG502XPlusIndex(transport, endpoint.productId);
      const dpiFeatureIndex = await transport.getFeatureIndex(deviceIndex, adjustableDpiFeatureId);
      const buttonSpyFeatureIndex = await transport.getFeatureIndex(deviceIndex, mouseButtonSpyFeatureId);
      const batteryFeatureIndex = await transport.getFeatureIndex(deviceIndex, unifiedBatteryFeatureId);
      const reportRateFeatureIndex = await transport.getFeatureIndex(deviceIndex, adjustableReportRateFeatureId);
      if (dpiFeatureIndex === null || buttonSpyFeatureIndex === null) {
        throw new Error('The connected G502 X Plus does not expose live DPI Shift support.');
      }

      const countResponse = await transport.request(deviceIndex, buttonSpyFeatureIndex, 0);
      if ((countResponse[4] ?? 0) < 6) throw new Error('The mouse button-spy bitmap does not include the sniper button.');
      const listResponse = await transport.request(deviceIndex, dpiFeatureIndex, 1, [sensorIndex, 0, 0]);
      const supportedDpi = parseAdjustableDpiListPayload(listResponse.subarray(4));
      const currentResponse = await transport.request(deviceIndex, dpiFeatureIndex, 2, [sensorIndex, 0, 0]);
      const currentDpi = parseCurrentDpiPayload(currentResponse.subarray(4));
      return new G502SniperDpiSession(
        transport,
        deviceIndex,
        dpiFeatureIndex,
        buttonSpyFeatureIndex,
        batteryFeatureIndex,
        reportRateFeatureIndex,
        supportedDpi,
        currentDpi,
        previous?.shiftDpi,
        previous?.stages,
      );
    } catch (error) {
      await transport.close();
      throw error;
    }
  }

  public get isClosed(): boolean {
    return this.closed;
  }

  public async getCapability(): Promise<DpiCapability> {
    const currentDpi = await this.runtime.refreshBaseDpi();
    const min = this.supportedDpi[0]!;
    const max = this.supportedDpi.at(-1)!;
    return {
      writable: true,
      min,
      max,
      step: inferDpiStep(this.supportedDpi),
      stages: [...this.stages],
      activeDpi: currentDpi,
      defaultDpi: currentDpi,
      shiftDpi: this.runtime.currentShiftDpi,
      shiftMode: 'host-button-spy',
      maxStages: 5,
      profileMode: 'software',
    };
  }

  public async getBatteryCapability(now = Date.now()): Promise<BatteryCapability | undefined> {
    if (this.batteryFeatureIndex === null) return undefined;
    const response = await this.transport.request(this.deviceIndex, this.batteryFeatureIndex, 1);
    return parseUnifiedBatteryInfoPayload(response.subarray(4), now);
  }

  public async getReportRateCapability(): Promise<ReportRateCapability | undefined> {
    if (this.reportRateFeatureIndex === null) return undefined;
    const listResponse = await this.transport.request(this.deviceIndex, this.reportRateFeatureIndex, 0);
    const currentResponse = await this.transport.request(this.deviceIndex, this.reportRateFeatureIndex, 1);
    const supportedRates = parseAdjustableReportRateListPayload(listResponse.subarray(4));
    const value = parseAdjustableReportRatePayload(currentResponse.subarray(4));
    if (!supportedRates.includes(value)) throw new Error('The mouse reported an active polling rate outside its supported list.');
    this.supportedReportRates = supportedRates;
    return { writable: true, value, supportedRates, profileMode: 'software' };
  }

  public async setBaseDpi(value: number): Promise<void> {
    this.assertSupported(value);
    await this.runtime.setBaseDpi(value);
    if (!this.stages.includes(value)) this.stages = selectStages(this.supportedDpi, value, [...this.stages, value]);
  }

  public async setShiftDpi(value: number): Promise<void> {
    this.assertSupported(value);
    await this.runtime.setShiftDpi(value);
  }

  public setStages(values: number[]): void {
    const stages = [...new Set(values)].sort((left, right) => left - right);
    if (stages.length === 0 || stages.length > 5 || stages.some((value) => !this.supportedDpi.includes(value))) {
      throw new Error('DPI stages must contain one to five values supported by this mouse.');
    }
    this.stages = stages;
  }

  public async setReportRate(value: number): Promise<void> {
    if (this.reportRateFeatureIndex === null || !this.supportedReportRates.includes(value)) {
      throw new Error(`${value.toLocaleString()} Hz is not supported by this mouse.`);
    }
    await this.transport.request(this.deviceIndex, this.reportRateFeatureIndex, 2, [reportRateInterval(value)]);
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.runtime.dispose();
    await this.transport.close();
  }

  private handleNotification(report: Buffer): void {
    const bitmap = parseMouseButtonSpyNotification(report, this.deviceIndex, this.buttonSpyFeatureIndex);
    if (bitmap !== null) this.runtime.handleButtonBitmap(bitmap);
  }

  private readCurrentDpi = async (): Promise<number> => {
    const response = await this.transport.request(this.deviceIndex, this.dpiFeatureIndex, 2, [sensorIndex, 0, 0]);
    return parseCurrentDpiPayload(response.subarray(4));
  };

  private writeCurrentDpi = async (dpi: number): Promise<void> => {
    const [high, low] = toUint16(dpi);
    await this.transport.request(this.deviceIndex, this.dpiFeatureIndex, 3, [sensorIndex, high, low]);
  };

  private assertSupported(value: number): void {
    if (!this.supportedDpi.includes(value)) throw new Error(`${value.toLocaleString()} DPI is not supported by this mouse.`);
  }
}

export function parseUnifiedBatteryInfoPayload(payload: Uint8Array, updatedAt = Date.now()): BatteryCapability {
  const percentage = payload[0] ?? -1;
  const status = payload[2] ?? -1;
  if (percentage < 0 || percentage > 100) throw new Error('The mouse returned an invalid battery percentage.');
  if (status < 0 || status > 4) throw new Error('The mouse returned an unknown battery status.');
  if (status === 4) throw new Error('The mouse reported a battery subsystem error.');
  return {
    percentage,
    charging: status === 1 || status === 2,
    fullyCharged: status === 3,
    updatedAt,
  };
}

export function parseAdjustableReportRateListPayload(payload: Uint8Array): number[] {
  const bitFlags = payload[0] ?? 0;
  const rates = Array.from({ length: 8 }, (_, index) => index + 1)
    .filter((interval) => (bitFlags & (1 << (interval - 1))) !== 0)
    .map((interval) => reportRateFromInterval(interval))
    .filter((rate): rate is number => rate !== null)
    .sort((left, right) => left - right);
  if (rates.length === 0) throw new Error('The mouse did not report any supported polling rates.');
  return rates;
}

export function parseAdjustableReportRatePayload(payload: Uint8Array): number {
  const rate = reportRateFromInterval(payload[0] ?? 0);
  if (rate === null) throw new Error('The mouse returned an invalid polling-rate interval.');
  return rate;
}

function reportRateFromInterval(intervalMilliseconds: number): number | null {
  if (intervalMilliseconds <= 0 || 1_000 % intervalMilliseconds !== 0) return null;
  return 1_000 / intervalMilliseconds;
}

function reportRateInterval(rate: number): number {
  const interval = 1_000 / rate;
  if (!Number.isInteger(interval) || interval < 1 || interval > 8) {
    throw new Error(`${rate.toLocaleString()} Hz cannot be represented by this mouse.`);
  }
  return interval;
}

export function parseMouseButtonSpyNotification(
  report: Uint8Array,
  deviceIndex: number,
  featureIndex: number,
): number | null {
  if (report[0] !== 0x11 || report[1] !== deviceIndex || report[2] !== featureIndex || report[3] !== 0x00) return null;
  return ((report[4] ?? 0) << 8) | (report[5] ?? 0);
}

export function parseAdjustableDpiListPayload(payload: Uint8Array): number[] {
  const values: number[] = [];
  let offset = 1; // byte 0 echoes the sensor index
  while (offset + 1 < payload.length) {
    const value = ((payload[offset] ?? 0) << 8) | (payload[offset + 1] ?? 0);
    if (value === 0) break;
    if ((value >>> 13) === 0b111) {
      const step = value & 0x1fff;
      if (step === 0 || values.length === 0 || offset + 3 >= payload.length) {
        throw new Error('The mouse returned an invalid DPI range.');
      }
      const end = ((payload[offset + 2] ?? 0) << 8) | (payload[offset + 3] ?? 0);
      const start = values.at(-1)!;
      if (end < start) throw new Error('The mouse returned a descending DPI range.');
      for (let next = start + step; next < end; next += step) values.push(next);
      values.push(end);
      offset += 4;
      continue;
    }
    values.push(value);
    offset += 2;
  }
  const normalized = [...new Set(values)].sort((left, right) => left - right);
  if (normalized.length === 0) throw new Error('The mouse did not report any supported DPI values.');
  return normalized;
}

export function inferDpiStep(values: number[]): number {
  let step = Number.POSITIVE_INFINITY;
  for (let index = 1; index < values.length; index += 1) {
    const difference = values[index]! - values[index - 1]!;
    if (difference > 0) step = Math.min(step, difference);
  }
  return Number.isFinite(step) ? step : 1;
}

async function findG502XPlusIndex(transport: HidppLongTransport, productId: number): Promise<number> {
  const indexes = productId === 0xc095 ? [0xff] : receiverSlotIndexes;
  let lastError: unknown;
  for (const index of indexes) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // A sleeping LIGHTSPEED mouse may drop the first control packet even
        // though the receiver remains enumerated. A bounded protocol handshake
        // wakes that path before feature discovery; no background polling is
        // introduced.
        await transport.request(index, 0x00, 1, [2, 0, 0], 650);
        const nameFeatureIndex = await transport.getFeatureIndex(index, deviceNameFeatureId, 650);
        if (nameFeatureIndex === null) break;
        const name = await readDeviceName(transport, index, nameFeatureIndex);
        if (/g502\s*x\s*plus/i.test(name)) return index;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await delay(80 * (attempt + 1));
      }
    }
  }
  throw new Error('No responsive G502 X Plus was found on this Logitech transport.', { cause: lastError });
}

async function readDeviceName(
  transport: HidppLongTransport,
  deviceIndex: number,
  featureIndex: number,
): Promise<string> {
  const countResponse = await transport.request(deviceIndex, featureIndex, 0);
  const count = countResponse[4] ?? 0;
  const bytes: number[] = [];
  while (bytes.length < count) {
    const response = await transport.request(deviceIndex, featureIndex, 1, [bytes.length, 0, 0]);
    bytes.push(...response.subarray(4, 4 + Math.min(16, count - bytes.length)));
  }
  return Buffer.from(bytes).toString('utf8').replace(/\0+$/g, '');
}

function parseCurrentDpiPayload(payload: Uint8Array): number {
  const value = ((payload[1] ?? 0) << 8) | (payload[2] ?? 0);
  if (value <= 0) throw new Error('The mouse returned an invalid active DPI value.');
  return value;
}

function selectShiftDpi(values: number[], currentDpi: number, preferred: number | undefined): number {
  if (preferred !== undefined && values.includes(preferred)) return preferred;
  const lower = values.filter((value) => value < currentDpi);
  if (lower.includes(800)) return 800;
  return lower.at(Math.max(0, lower.length - 1)) ?? values[0]!;
}

function selectStages(values: number[], currentDpi: number, preferred: number[] | undefined): number[] {
  const validPreferred = [...new Set(preferred ?? [])].filter((value) => values.includes(value));
  const defaults = [800, 1_600, 3_200].filter((value) => values.includes(value));
  const stages = validPreferred.length > 0 ? validPreferred : defaults;
  if (!stages.includes(currentDpi)) stages.push(currentDpi);
  return stages.sort((left, right) => left - right).slice(0, 5);
}

function toUint16(value: number): [number, number] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
