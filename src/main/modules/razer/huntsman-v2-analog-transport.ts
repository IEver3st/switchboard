import { HIDAsync } from 'node-hid';
import {
  activeOnboardProfileReadCommand,
  activeOnboardProfileWriteCommand,
  brightnessReadCommand,
  brightnessWriteCommand,
  buildRazerReport,
  effectIdListCommand,
  effectReadCommand,
  effectWriteCommand,
  firmwareVersionCommand,
  gamingModeReadCommand,
  gamingModeWriteCommand,
  onboardProfileListCommand,
  parseActiveOnboardProfile,
  parseBrightness,
  parseFirmwareVersion,
  parseGamingMode,
  parseLightingEffectCodes,
  parseLightingState,
  parseOnboardProfileIds,
  parseRapidTrigger,
  parseRazerResponse,
  parseSerialNumber,
  parseSnapTap,
  rapidTriggerReadCommand,
  razerReportLength,
  serialNumberCommand,
  snapTapReadCommand,
  type HuntsmanLightingEffectId,
  type HuntsmanLightingState,
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
  lightingState: HuntsmanLightingState;
  lightingEffectCodes: number[];
  gamingMode: boolean;
  onboardProfileIds: number[];
  activeOnboardProfileId: number;
  rapidTrigger?: boolean;
  snapTap?: boolean;
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
      const lightingState = parseLightingState(await this.request(handle, effectReadCommand()));
      const lightingEffectCodes = parseLightingEffectCodes(await this.request(handle, effectIdListCommand()));
      const gamingMode = parseGamingMode(await this.request(handle, gamingModeReadCommand()));
      const onboardProfileIds = parseOnboardProfileIds(await this.request(handle, onboardProfileListCommand()));
      const activeOnboardProfileId = parseActiveOnboardProfile(await this.request(handle, activeOnboardProfileReadCommand()));
      const rapidTriggerResponse = await this.requestIfSupported(handle, rapidTriggerReadCommand(activeOnboardProfileId));
      const snapTapResponse = await this.requestIfSupported(handle, snapTapReadCommand(activeOnboardProfileId));
      return {
        firmwareVersion,
        serialNumber,
        brightness,
        lightingState,
        lightingEffectCodes,
        gamingMode,
        onboardProfileIds,
        activeOnboardProfileId,
        ...(rapidTriggerResponse ? { rapidTrigger: parseRapidTrigger(rapidTriggerResponse) } : {}),
        ...(snapTapResponse ? { snapTap: parseSnapTap(snapTapResponse) } : {}),
      };
    });
  }

  public async setBrightness(path: string, brightness: number): Promise<number> {
    return this.withHandle(path, async (handle) => {
      await this.request(handle, brightnessWriteCommand(brightness));
      return parseBrightness(await this.request(handle, brightnessReadCommand()));
    });
  }

  public async setEffect(path: string, effectId: HuntsmanLightingEffectId, color: string): Promise<HuntsmanLightingState> {
    return this.withHandle(path, async (handle) => {
      await this.request(handle, effectWriteCommand(effectId, color));
      return parseLightingState(await this.request(handle, effectReadCommand()));
    });
  }

  public async setGamingMode(path: string, enabled: boolean): Promise<boolean> {
    return this.withHandle(path, async (handle) => {
      await this.request(handle, gamingModeWriteCommand(enabled));
      return parseGamingMode(await this.request(handle, gamingModeReadCommand()));
    });
  }

  public async setActiveOnboardProfile(path: string, profileId: number): Promise<number> {
    return this.withHandle(path, async (handle) => {
      await this.request(handle, activeOnboardProfileWriteCommand(profileId));
      return parseActiveOnboardProfile(await this.request(handle, activeOnboardProfileReadCommand()));
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
        throw new RazerCommandStatusError(response.status);
      }
      await delay(retryDelayMs * attempt);
    }
    throw new Error('The keyboard did not complete the Razer HID command.');
  }

  private async requestIfSupported(handle: RazerHidHandle, command: RazerCommand): Promise<RazerResponse | undefined> {
    try {
      return await this.request(handle, command);
    } catch (error) {
      if (error instanceof RazerCommandStatusError && error.status === 0x05) return undefined;
      throw error;
    }
  }
}

class RazerCommandStatusError extends Error {
  public constructor(public readonly status: number) {
    super(razerStatusMessage(status));
    this.name = 'RazerCommandStatusError';
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
