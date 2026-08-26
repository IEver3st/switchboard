import { HIDAsync, type Device as HidDevice } from 'node-hid';
import type { DeviceSettingValue, LightingProfile } from '../../../shared/contracts';
import {
  buildQuadCast2LightingReports,
  parseQuadCast2MuteReport,
  quadCast2LightingFrameIntervalMs,
  type QuadCast2LightingConfig,
  type QuadCast2LightingEffectId,
} from './quadcast2-protocol';

type SessionUpdateListener = (persist: boolean) => void;

interface QuadCast2HidHandle {
  read(timeout?: number): Promise<Buffer | undefined>;
  sendFeatureReport(data: Buffer): Promise<number>;
  close(): Promise<void>;
}

export interface QuadCast2HidIo {
  open(path: string): Promise<QuadCast2HidHandle>;
}

const nativeHidIo: QuadCast2HidIo = {
  open: (path) => HIDAsync.open(path, { nonExclusive: true }),
};

export const quadCast2LightingProfiles: readonly LightingProfile[] = [
  { id: 'broadcast', label: 'Broadcast', effectId: 'solid', brightness: 72, speed: 50 },
  { id: 'breathe', label: 'Breathe', effectId: 'breathing', brightness: 55, speed: 42 },
  { id: 'night', label: 'Night', effectId: 'solid', brightness: 25, speed: 50 },
  { id: 'custom', label: 'Custom', effectId: 'solid', brightness: 55, speed: 50 },
] as const;

interface SessionSettings {
  lightingEnabled: boolean;
  lightingBrightness: number;
  lightingEffect: QuadCast2LightingEffectId;
  lightingSpeed: number;
  lightingProfileId: string;
  customLightingBrightness: number;
  customLightingEffect: QuadCast2LightingEffectId;
  customLightingSpeed: number;
  muteLed: boolean;
  lightingColor: string;
}

export interface QuadCast2SessionState {
  physicalMuted: boolean | null;
  muteStateUpdatedAt?: string;
  muteStateUnavailableReason?: string;
  lightingStatus: 'maintained' | 'unknown';
  lightingStateReason?: string;
  config: QuadCast2LightingConfig;
  activeProfileId: string;
  profiles: LightingProfile[];
  settings: Record<string, DeviceSettingValue>;
}

export class QuadCast2Session {
  private settings: SessionSettings;
  private physicalMuted: boolean | null = null;
  private muteStateUpdatedAt: string | undefined;
  private muteStateUnavailableReason: string | undefined;
  private lightingStatus: 'maintained' | 'unknown' = 'unknown';
  private lightingStateReason = 'Waiting for the maintained lighting stream.';
  private muteHandle: QuadCast2HidHandle | null = null;
  private lightingHandle: QuadCast2HidHandle | null = null;
  private muteStart: Promise<void> | null = null;
  private lightingStart: Promise<void> | null = null;
  private lightingQueue: Promise<void> = Promise.resolve();
  private muteRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private lightingTimer: ReturnType<typeof setTimeout> | null = null;
  private lightingFrameIndex = 0;
  private closed = false;

  public constructor(
    private descriptors: HidDevice[],
    previousSettings: Record<string, DeviceSettingValue> | undefined,
    private readonly onUpdate: SessionUpdateListener,
    private readonly hidIo: QuadCast2HidIo = nativeHidIo,
  ) {
    this.settings = normalizeSettings(previousSettings);
  }

  public updateDescriptors(descriptors: HidDevice[]): void {
    this.descriptors = descriptors;
    if (!this.muteHandle) void this.ensureMuteMonitor();
    if (!this.lightingHandle) void this.ensureLightingStream();
  }

  public start(): void {
    void this.ensureMuteMonitor();
    void this.ensureLightingStream();
  }

  public getState(): QuadCast2SessionState {
    const profiles = quadCast2LightingProfiles.map((profile) => (
      profile.id === 'custom'
        ? {
            ...profile,
            effectId: this.settings.customLightingEffect,
            brightness: this.settings.customLightingBrightness,
            speed: this.settings.customLightingSpeed,
          }
        : { ...profile }
    ));
    return {
      physicalMuted: this.physicalMuted,
      ...(this.muteStateUpdatedAt ? { muteStateUpdatedAt: this.muteStateUpdatedAt } : {}),
      ...(this.muteStateUnavailableReason ? { muteStateUnavailableReason: this.muteStateUnavailableReason } : {}),
      lightingStatus: this.lightingStatus,
      ...(this.lightingStateReason ? { lightingStateReason: this.lightingStateReason } : {}),
      config: this.currentConfig(),
      activeProfileId: this.settings.lightingProfileId,
      profiles,
      settings: { ...this.settings },
    };
  }

  public async applyEnabled(enabled: boolean): Promise<void> {
    await this.applyConfig({ ...this.currentConfig(), enabled }, { lightingEnabled: enabled });
  }

  public async applyBrightness(brightness: number): Promise<void> {
    const value = clamp(Math.round(brightness), 0, 100);
    await this.applyCustomConfig({ ...this.currentConfig(), brightness: value }, {
      lightingBrightness: value,
      customLightingBrightness: value,
    });
  }

  public async applyEffect(effectId: string): Promise<void> {
    if (!isLightingEffect(effectId)) throw new Error('That lighting effect is not supported by QuadCast 2.');
    await this.applyCustomConfig({ ...this.currentConfig(), effectId }, {
      lightingEffect: effectId,
      customLightingEffect: effectId,
    });
  }

  public async applySpeed(speed: number): Promise<void> {
    const value = clamp(Math.round(speed), 1, 100);
    await this.applyCustomConfig({ ...this.currentConfig(), speed: value }, {
      lightingSpeed: value,
      customLightingSpeed: value,
    });
  }

  public async applyMuteLinked(muteLinked: boolean): Promise<void> {
    await this.applyConfig({ ...this.currentConfig(), muteLinked }, { muteLed: muteLinked });
  }

  public async applyProfile(profileId: string): Promise<void> {
    const profile = this.getState().profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('Unknown QuadCast 2 lighting profile.');
    await this.applyConfig({
      ...this.currentConfig(),
      brightness: profile.brightness,
      effectId: profile.effectId as QuadCast2LightingEffectId,
      speed: profile.speed,
    }, {
      lightingProfileId: profile.id,
      lightingBrightness: profile.brightness,
      lightingEffect: profile.effectId as QuadCast2LightingEffectId,
      lightingSpeed: profile.speed,
    });
  }

  public updatePassiveSetting(key: string, value: DeviceSettingValue): void {
    if (key in this.settings) (this.settings as unknown as Record<string, DeviceSettingValue>)[key] = value;
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.muteRetryTimer) clearTimeout(this.muteRetryTimer);
    if (this.lightingTimer) clearTimeout(this.lightingTimer);
    this.muteRetryTimer = null;
    this.lightingTimer = null;
    const muteHandle = this.muteHandle;
    const lightingHandle = this.lightingHandle;
    this.muteHandle = null;
    this.lightingHandle = null;
    await Promise.all([
      muteHandle?.close().catch(() => undefined),
      lightingHandle?.close().catch(() => undefined),
      this.lightingQueue.catch(() => undefined),
    ]);
  }

  private currentConfig(): QuadCast2LightingConfig {
    return {
      enabled: this.settings.lightingEnabled,
      brightness: this.settings.lightingBrightness,
      effectId: this.settings.lightingEffect,
      speed: this.settings.lightingSpeed,
      muteLinked: this.settings.muteLed,
    };
  }

  private async applyCustomConfig(
    config: QuadCast2LightingConfig,
    patch: Partial<SessionSettings>,
  ): Promise<void> {
    await this.applyConfig(config, { ...patch, lightingProfileId: 'custom' });
  }

  private async applyConfig(
    config: QuadCast2LightingConfig,
    patch: Partial<SessionSettings>,
  ): Promise<void> {
    if (this.closed) throw new Error('The QuadCast 2 session is closed.');
    await this.writeConfig(config);
    this.settings = { ...this.settings, ...patch };
    this.lightingStatus = 'maintained';
    this.lightingStateReason = '';
    this.onUpdate(true);
  }

  private async writeConfig(config: QuadCast2LightingConfig): Promise<void> {
    await this.ensureLightingStream(config);
    if (!this.lightingHandle) throw new Error(this.lightingStateReason || 'The lighting interface is unavailable.');
    await this.enqueueLighting(async () => {
      if (!this.lightingHandle) throw new Error('The lighting interface was released.');
      await sendLightingReports(this.lightingHandle, config, 0, this.physicalMuted);
    });
  }

  private async ensureMuteMonitor(): Promise<void> {
    if (this.closed || this.muteHandle || this.muteStart) return this.muteStart ?? undefined;
    this.muteStart = this.runMuteMonitor().finally(() => { this.muteStart = null; });
    return this.muteStart;
  }

  private async runMuteMonitor(): Promise<void> {
    const descriptor = this.descriptors.find(isMuteInterface);
    if (!descriptor?.path) {
      this.physicalMuted = null;
      this.muteStateUnavailableReason = 'The microphone mute-state collection is unavailable.';
      this.onUpdate(false);
      return;
    }

    let handle: QuadCast2HidHandle | null = null;
    try {
      handle = await this.hidIo.open(descriptor.path);
      if (this.closed) {
        await handle.close().catch(() => undefined);
        return;
      }
      this.muteHandle = handle;
      this.muteStateUnavailableReason = undefined;
      while (!this.closed && this.muteHandle === handle) {
        const report = await handle.read(1_000);
        if (!report) continue;
        const muted = parseQuadCast2MuteReport(report);
        if (muted === null || muted === this.physicalMuted) continue;
        this.physicalMuted = muted;
        this.muteStateUpdatedAt = new Date().toISOString();
        this.onUpdate(false);
        if (this.settings.muteLed && this.lightingHandle) {
          void this.enqueueLighting(async () => {
            if (this.lightingHandle) {
              await sendLightingReports(this.lightingHandle, this.currentConfig(), this.lightingFrameIndex, muted);
            }
          }).catch((error) => this.loseLighting(error));
        }
      }
    } catch (error) {
      if (!this.closed) {
        this.physicalMuted = null;
        this.muteStateUnavailableReason = errorMessage(error, 'The physical mute state could not be read.');
        this.onUpdate(false);
      }
    } finally {
      if (this.muteHandle === handle) this.muteHandle = null;
      await handle?.close().catch(() => undefined);
      if (!this.closed) this.scheduleMuteRetry();
    }
  }

  private scheduleMuteRetry(): void {
    if (this.muteRetryTimer || this.closed) return;
    this.muteRetryTimer = setTimeout(() => {
      this.muteRetryTimer = null;
      void this.ensureMuteMonitor();
    }, 1_000);
    this.muteRetryTimer.unref?.();
  }

  private async ensureLightingStream(config = this.currentConfig()): Promise<void> {
    if (this.closed || this.lightingHandle) return;
    if (this.lightingStart) return this.lightingStart;
    this.lightingStart = this.startLightingStream(config).finally(() => { this.lightingStart = null; });
    return this.lightingStart;
  }

  private async startLightingStream(config: QuadCast2LightingConfig): Promise<void> {
    const candidates = this.descriptors.filter(isLightingInterface).sort(lightingInterfaceScore);
    let lastError: unknown;
    for (const descriptor of candidates) {
      if (!descriptor.path || this.closed) continue;
      let handle: QuadCast2HidHandle | null = null;
      try {
        handle = await this.hidIo.open(descriptor.path);
        await sendLightingReports(handle, config, 0, this.physicalMuted);
        if (this.closed) {
          await handle.close().catch(() => undefined);
          return;
        }
        this.lightingHandle = handle;
        this.lightingFrameIndex = 1;
        this.lightingStatus = 'maintained';
        this.lightingStateReason = '';
        this.onUpdate(false);
        this.scheduleLightingFrame();
        return;
      } catch (error) {
        lastError = error;
        await handle?.close().catch(() => undefined);
      }
    }
    this.lightingStatus = 'unknown';
    this.lightingStateReason = candidates.length === 0
      ? 'No researched QuadCast 2 lighting collection is available.'
      : errorMessage(lastError, 'The maintained lighting stream could not start.');
    this.onUpdate(false);
  }

  private scheduleLightingFrame(): void {
    if (this.closed || !this.lightingHandle || this.lightingTimer) return;
    this.lightingTimer = setTimeout(() => {
      this.lightingTimer = null;
      void this.enqueueLighting(async () => {
        if (!this.lightingHandle) return;
        await sendLightingReports(
          this.lightingHandle,
          this.currentConfig(),
          this.lightingFrameIndex,
          this.physicalMuted,
        );
        this.lightingFrameIndex += 1;
        this.scheduleLightingFrame();
      }).catch((error) => this.loseLighting(error));
    }, quadCast2LightingFrameIntervalMs);
    this.lightingTimer.unref?.();
  }

  private loseLighting(error: unknown): void {
    if (this.closed) return;
    if (this.lightingTimer) clearTimeout(this.lightingTimer);
    this.lightingTimer = null;
    const handle = this.lightingHandle;
    this.lightingHandle = null;
    void handle?.close().catch(() => undefined);
    this.lightingStatus = 'unknown';
    this.lightingStateReason = errorMessage(error, 'The maintained lighting stream stopped.');
    this.onUpdate(false);
  }

  private enqueueLighting<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lightingQueue.then(operation, operation);
    this.lightingQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

async function sendLightingReports(
  handle: QuadCast2HidHandle,
  config: QuadCast2LightingConfig,
  frameIndex: number,
  physicalMuted: boolean | null,
): Promise<void> {
  for (const report of buildQuadCast2LightingReports(config, frameIndex, physicalMuted)) {
    const written = await handle.sendFeatureReport(report);
    if (written !== report.byteLength && written !== report.byteLength - 1) {
      throw new Error(`HIDAPI reported ${written} of ${report.byteLength} lighting bytes.`);
    }
  }
}

function isMuteInterface(descriptor: HidDevice): boolean {
  return descriptor.vendorId === 0x03f0
    && descriptor.productId === 0x07b4
    && descriptor.usagePage === 0xffc0
    && descriptor.usage === 0x01
    && Boolean(descriptor.path);
}

function isLightingInterface(descriptor: HidDevice): boolean {
  return descriptor.vendorId === 0x03f0
    && descriptor.productId === 0x09af
    && (descriptor.usagePage ?? 0) >= 0xff00
    && Boolean(descriptor.path);
}

function lightingInterfaceScore(left: HidDevice, right: HidDevice): number {
  return score(right) - score(left);
}

function score(descriptor: HidDevice): number {
  return (descriptor.interface === 0 ? 2_000 : 0)
    + (descriptor.usagePage === 0xff90 ? 1_500 : 0)
    + (descriptor.usage === 0xff00 ? 750 : 0);
}

function normalizeSettings(settings: Record<string, DeviceSettingValue> | undefined): SessionSettings {
  const effect = isLightingEffect(settings?.lightingEffect) ? settings.lightingEffect : 'solid';
  const customEffect = isLightingEffect(settings?.customLightingEffect) ? settings.customLightingEffect : effect;
  return {
    lightingEnabled: booleanSetting(settings?.lightingEnabled, true),
    lightingBrightness: numberSetting(settings?.lightingBrightness, 72, 0, 100),
    lightingEffect: effect,
    lightingSpeed: numberSetting(settings?.lightingSpeed, 50, 1, 100),
    lightingProfileId: stringSetting(settings?.lightingProfileId, 'broadcast'),
    customLightingBrightness: numberSetting(settings?.customLightingBrightness, 55, 0, 100),
    customLightingEffect: customEffect,
    customLightingSpeed: numberSetting(settings?.customLightingSpeed, 50, 1, 100),
    muteLed: booleanSetting(settings?.muteLed, true),
    lightingColor: '#f20000',
  };
}

function isLightingEffect(value: unknown): value is QuadCast2LightingEffectId {
  return value === 'solid' || value === 'breathing' || value === 'pulse';
}

function booleanSetting(value: DeviceSettingValue | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberSetting(value: DeviceSettingValue | undefined, fallback: number, min: number, max: number): number {
  return typeof value === 'number' ? clamp(Math.round(value), min, max) : fallback;
}

function stringSetting(value: DeviceSettingValue | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
