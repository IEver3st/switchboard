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
  parseRazerResponse,
  parseSerialNumber,
  razerReportLength,
  serialNumberCommand,
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
  firmwareVersion?: string;
  serialNumber?: string;
  brightness?: number;
  lightingState?: HuntsmanLightingState;
  lightingEffectCodes?: number[];
  gamingMode?: boolean;
  onboardProfileIds?: number[];
  activeOnboardProfileId?: number;
  readFailures: Record<string, string>;
}

const nativeHidIo: RazerHidIo = {
  open: (path) => HIDAsync.open(path, { nonExclusive: true }),
};

const responseDelayMs = 35;
const retryDelayMs = 45;
const maximumAttempts = 3;
const defaultOperationTimeoutMs = 2_000;

export class HuntsmanV2AnalogTransport {
  public constructor(
    private readonly hidIo: RazerHidIo = nativeHidIo,
    private readonly operationTimeoutMs = defaultOperationTimeoutMs,
  ) {}

  public async probe(path: string): Promise<HuntsmanProbe> {
    return this.withHandle(path, async (handle) => {
      const readFailures: Record<string, string> = {};
      const read = async <T>(id: string, operation: () => Promise<T>): Promise<T | undefined> => {
        try {
          return await operation();
        } catch (error) {
          readFailures[id] = error instanceof Error ? error.message : String(error);
          return undefined;
        }
      };
      const firmwareVersion = await read('firmware', async () => parseFirmwareVersion(await this.request(handle, firmwareVersionCommand())));
      const serialNumber = await read('serial-number', async () => parseSerialNumber(await this.request(handle, serialNumberCommand())));
      const brightness = await read('brightness', async () => parseBrightness(await this.request(handle, brightnessReadCommand())));
      const lightingState = await read('lighting-effect', async () => parseLightingState(await this.request(handle, effectReadCommand())));
      const lightingEffectCodes = await read('lighting-effects', async () => parseLightingEffectCodes(await this.request(handle, effectIdListCommand())));
      const gamingMode = await read('gaming-mode', async () => parseGamingMode(await this.request(handle, gamingModeReadCommand())));
      const onboardProfileIds = await read('onboard-profiles', async () => parseOnboardProfileIds(await this.request(handle, onboardProfileListCommand())));
      const activeOnboardProfileId = await read('active-profile', async () => parseActiveOnboardProfile(await this.request(handle, activeOnboardProfileReadCommand())));
      return {
        ...(firmwareVersion ? { firmwareVersion } : {}),
        ...(serialNumber ? { serialNumber } : {}),
        ...(brightness !== undefined ? { brightness } : {}),
        ...(lightingState ? { lightingState } : {}),
        ...(lightingEffectCodes ? { lightingEffectCodes } : {}),
        ...(gamingMode !== undefined ? { gamingMode } : {}),
        ...(onboardProfileIds ? { onboardProfileIds } : {}),
        ...(activeOnboardProfileId !== undefined ? { activeOnboardProfileId } : {}),
        readFailures,
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
    const pendingHandle = this.hidIo.open(path);
    let handle: RazerHidHandle;
    try {
      handle = await withTimeout(pendingHandle, this.operationTimeoutMs, 'Opening the Razer control endpoint timed out.');
    } catch (error) {
      void pendingHandle.then((lateHandle) => lateHandle.close()).catch(() => undefined);
      throw error;
    }
    try {
      return await operation(handle);
    } finally {
      await withTimeout(handle.close(), this.operationTimeoutMs, 'Closing the Razer control endpoint timed out.')
        .catch(() => undefined);
    }
  }

  private async request(handle: RazerHidHandle, command: RazerCommand): Promise<RazerResponse> {
    const report = buildRazerReport(command);
    let lastResponseError: Error | undefined;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const written = await withTimeout(
        handle.sendFeatureReport(report),
        this.operationTimeoutMs,
        'Sending the Razer feature report timed out.',
      );
      if (written !== report.byteLength && written !== report.byteLength - 1) {
        throw new Error(`HIDAPI reported ${written} of ${report.byteLength} Razer command bytes.`);
      }
      await delay(responseDelayMs);
      let response: RazerResponse;
      try {
        response = parseRazerResponse(await withTimeout(
          handle.getFeatureReport(0, razerReportLength),
          this.operationTimeoutMs,
          'Reading the Razer feature response timed out.',
        ), command);
      } catch (error) {
        lastResponseError = error instanceof Error ? error : new Error(String(error));
        if (attempt === maximumAttempts) throw lastResponseError;
        await delay(retryDelayMs * attempt);
        continue;
      }
      if (response.status === 0x02) return response;
      if (response.status !== 0x01 || attempt === maximumAttempts) {
        throw new RazerCommandStatusError(response.status);
      }
      await delay(retryDelayMs * attempt);
    }
    throw lastResponseError ?? new Error('The keyboard did not complete the Razer HID command.');
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

function withTimeout<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
