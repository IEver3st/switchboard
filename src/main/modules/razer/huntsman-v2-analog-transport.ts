import { HIDAsync } from 'node-hid';
import {
  brightnessReadCommand,
  brightnessWriteCommand,
  buildRazerReport,
  effectWriteCommand,
  firmwareVersionCommand,
  parseBrightness,
  parseFirmwareVersion,
  parseRazerResponse,
  parseSerialNumber,
  razerReportLength,
  serialNumberCommand,
  type HuntsmanLightingEffectId,
  type RazerCommand,
  type RazerResponse,
} from './huntsman-v2-analog-protocol';

interface RazerHidHandle {
  sendFeatureReport(data: Buffer): Promise<number>;
  getFeatureReport(reportId: number, reportLength: number): Promise<Buffer>;
  close(): Promise<void>;
}

export interface RazerHidIo {
  open(path: string): Promise<RazerHidHandle>;
}

export interface HuntsmanProbe {
  firmwareVersion: string;
  serialNumber?: string;
  brightness: number;
}

const nativeHidIo: RazerHidIo = {
  open: (path) => HIDAsync.open(path, { nonExclusive: true }),
};

const responseDelayMs = 35;
const retryDelayMs = 45;
const maximumAttempts = 3;

export class HuntsmanV2AnalogTransport {
  public constructor(private readonly hidIo: RazerHidIo = nativeHidIo) {}

  public async probe(path: string): Promise<HuntsmanProbe> {
    return this.withHandle(path, async (handle) => {
      const firmwareVersion = parseFirmwareVersion(await this.request(handle, firmwareVersionCommand()));
      const serialNumber = parseSerialNumber(await this.request(handle, serialNumberCommand()));
      const brightness = parseBrightness(await this.request(handle, brightnessReadCommand()));
      return { firmwareVersion, serialNumber, brightness };
    });
  }

  public async setBrightness(path: string, brightness: number): Promise<number> {
    return this.withHandle(path, async (handle) => {
      await this.request(handle, brightnessWriteCommand(brightness));
      return parseBrightness(await this.request(handle, brightnessReadCommand()));
    });
  }

  public async setEffect(path: string, effectId: HuntsmanLightingEffectId, color: string): Promise<void> {
    await this.withHandle(path, async (handle) => {
      await this.request(handle, effectWriteCommand(effectId, color));
    });
  }

  private async withHandle<T>(path: string, operation: (handle: RazerHidHandle) => Promise<T>): Promise<T> {
    const handle = await this.hidIo.open(path);
    try {
      return await operation(handle);
    } finally {
      await handle.close();
    }
  }

  private async request(handle: RazerHidHandle, command: RazerCommand): Promise<RazerResponse> {
    const report = buildRazerReport(command);
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const written = await handle.sendFeatureReport(report);
      if (written !== report.byteLength && written !== report.byteLength - 1) {
        throw new Error(`HIDAPI reported ${written} of ${report.byteLength} Razer command bytes.`);
      }
      await delay(responseDelayMs);
      const response = parseRazerResponse(await handle.getFeatureReport(0, razerReportLength), command);
      if (response.status === 0x02) return response;
      if (response.status !== 0x01 || attempt === maximumAttempts) {
        throw new Error(razerStatusMessage(response.status));
      }
      await delay(retryDelayMs * attempt);
    }
    throw new Error('The keyboard did not complete the Razer HID command.');
  }
}

function razerStatusMessage(status: number): string {
  const label = new Map<number, string>([
    [0x00, 'new command state'],
    [0x01, 'busy'],
    [0x03, 'command failure'],
    [0x04, 'command timeout'],
    [0x05, 'unsupported command'],
  ]).get(status);
  return `The keyboard rejected the Razer HID command${label ? `: ${label}` : ` with status 0x${status.toString(16).padStart(2, '0')}`}.`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
