import { z } from 'zod';

export const pageIdSchema = z.enum([
  'devices',
  'audio',
  'capture',
  'modules',
  'settings',
]);
export type PageId = z.infer<typeof pageIdSchema>;

export const engineKindSchema = z.enum(['audio', 'capture']);
export type EngineKind = z.infer<typeof engineKindSchema>;

export const engineStateSchema = z.enum(['stopped', 'starting', 'running', 'error']);
export type EngineState = z.infer<typeof engineStateSchema>;

export const engineStatusSchema = z.object({
  kind: engineKindSchema,
  state: engineStateSchema,
  pid: z.number().int().positive().optional(),
  cpuPercent: z.number().min(0),
  memoryMb: z.number().min(0),
  uptimeSeconds: z.number().min(0),
  message: z.string().optional(),
  updatedAt: z.string(),
});
export type EngineStatus = z.infer<typeof engineStatusSchema>;

export const moduleKindSchema = z.enum(['device', 'capture', 'audio', 'integration']);
export type ModuleKind = z.infer<typeof moduleKindSchema>;

export const moduleManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  kind: moduleKindSchema,
  sizeMb: z.number().nonnegative(),
  installed: z.boolean(),
  enabled: z.boolean(),
  official: z.boolean(),
  restartRequired: z.boolean().default(false),
  capabilities: z.array(z.string()),
  vendors: z.array(z.string()).default([]),
});
export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

export const deviceKindSchema = z.enum(['mouse', 'microphone', 'keyboard', 'headset', 'unknown']);
export type DeviceKind = z.infer<typeof deviceKindSchema>;

export const deviceConnectionSchema = z.enum(['usb', 'wireless', 'bluetooth', 'unknown']);
export type DeviceConnection = z.infer<typeof deviceConnectionSchema>;

export const deviceSettingValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.number()),
  z.array(z.string()),
]);
export type DeviceSettingValue = z.infer<typeof deviceSettingValueSchema>;

export const deviceIdentitySchema = z.object({
  manufacturer: z.string().min(1).optional(),
  productFamily: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  variant: z.string().min(1).optional(),
  colorway: z.string().min(1).optional(),
  connection: deviceConnectionSchema.optional(),
  hardwareRevision: z.string().min(1).optional(),
  vendorId: z.number().int().min(0).max(0xffff).optional(),
  productId: z.number().int().min(0).max(0xffff).optional(),
  transportProductId: z.number().int().min(0).max(0xffff).optional(),
  interfaceProductIds: z.array(z.number().int().min(0).max(0xffff)).optional(),
  serialNumber: z.string().min(1).optional(),
  productString: z.string().min(1).optional(),
});
export type DeviceIdentity = z.infer<typeof deviceIdentitySchema>;

export const deviceVariantConfidenceSchema = z.enum([
  'hardware',
  'product-id',
  'module-metadata',
  'user-override',
  'fallback',
]);
export type DeviceVariantConfidence = z.infer<typeof deviceVariantConfidenceSchema>;

export const deviceVariantResolutionSchema = z.object({
  confidence: deviceVariantConfidenceSchema,
  source: z.string().min(1),
  evidence: z.string().min(1).optional(),
});
export type DeviceVariantResolution = z.infer<typeof deviceVariantResolutionSchema>;

export const productAssetResolutionSchema = z.object({
  key: z.string().min(1),
  matchedBy: z.enum(['exact-variant', 'exact-model', 'manufacturer-default', 'generic']),
  source: z.enum(['bundled-official', 'bundled-generic']),
});
export type ProductAssetResolution = z.infer<typeof productAssetResolutionSchema>;

export const deviceAppearanceOverrideSchema = z.object({
  variant: z.string().trim().min(1),
  colorway: z.string().trim().min(1).optional(),
});
export type DeviceAppearanceOverride = z.infer<typeof deviceAppearanceOverrideSchema>;

export const deviceControlBindingSchema = z.object({
  id: z.string(),
  label: z.string(),
  assignment: z.string(),
  side: z.enum(['left', 'right']),
  order: z.number().int().min(0),
});
export type DeviceControlBinding = z.infer<typeof deviceControlBindingSchema>;

export const deviceSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  displayName: z.string(),
  kind: deviceKindSchema,
  connected: z.boolean(),
  batteryPercent: z.number().min(0).max(100).optional(),
  identity: deviceIdentitySchema,
  variantResolution: deviceVariantResolutionSchema,
  asset: productAssetResolutionSchema,
  capabilities: z.array(z.string()),
  controlBindings: z.array(deviceControlBindingSchema).optional(),
  settings: z.record(z.string(), deviceSettingValueSchema),
});
export type Device = z.infer<typeof deviceSchema>;

export const audioBusIdSchema = z.enum(['game', 'chat', 'media', 'mic', 'aux']);
export type AudioBusId = z.infer<typeof audioBusIdSchema>;

export const audioDeviceDirectionSchema = z.enum(['output', 'input']);
export type AudioDeviceDirection = z.infer<typeof audioDeviceDirectionSchema>;

export const audioDeviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: audioDeviceDirectionSchema,
  isDefault: z.boolean(),
  available: z.boolean(),
});
export type AudioDevice = z.infer<typeof audioDeviceSchema>;

export const audioBusSchema = z.object({
  id: audioBusIdSchema,
  label: z.string(),
  enabled: z.boolean().default(true),
  appCount: z.number().int().min(0),
  gain: z.number().min(0).max(1.5),
  muted: z.boolean(),
  meter: z.number().min(0).max(1),
  endpoint: z.string(),
  deviceId: z.string().default(''),
});
export type AudioBus = z.infer<typeof audioBusSchema>;

export const audioMeterValueSchema = z.object({
  busId: audioBusIdSchema,
  level: z.number().min(0).max(1),
  peak: z.number().min(0).max(1),
  clipping: z.boolean(),
});
export type AudioMeterValue = z.infer<typeof audioMeterValueSchema>;

export const audioMeterFrameSchema = z.object({
  sequence: z.number().int().nonnegative(),
  timestamp: z.string(),
  values: z.array(audioMeterValueSchema),
});
export type AudioMeterFrame = z.infer<typeof audioMeterFrameSchema>;

export const micProcessorIdSchema = z.enum([
  'gain',
  'noise-gate',
  'noise-suppression',
  'equalizer',
  'compressor',
  'limiter',
]);
export type MicProcessorId = z.infer<typeof micProcessorIdSchema>;

export const eqFilterTypeSchema = z.enum(['low-shelf', 'bell', 'high-shelf']);
export type EqFilterType = z.infer<typeof eqFilterTypeSchema>;

export const eqBandSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  type: eqFilterTypeSchema,
  frequency: z.number().min(20).max(20_000),
  gainDb: z.number().min(-12).max(12),
  q: z.number().min(0.2).max(10),
});
export type EqBand = z.infer<typeof eqBandSchema>;

const processorBaseSchema = {
  label: z.string(),
  enabled: z.boolean(),
  cost: z.enum(['none', 'low', 'medium']),
};

export const micProcessorSchema = z.discriminatedUnion('id', [
  z.object({
    ...processorBaseSchema,
    id: z.literal('gain'),
    parameters: z.object({ gainDb: z.number().min(-20).max(30) }).default({ gainDb: 0 }),
  }),
  z.object({
    ...processorBaseSchema,
    id: z.literal('noise-gate'),
    parameters: z.object({
      thresholdDb: z.number().min(-80).max(-10),
      attackMs: z.number().min(0.1).max(100),
      releaseMs: z.number().min(10).max(1_000),
    }).default({ thresholdDb: -48, attackMs: 10, releaseMs: 180 }),
  }),
  z.object({
    ...processorBaseSchema,
    id: z.literal('noise-suppression'),
    parameters: z.object({ amount: z.number().min(0).max(100) }).default({ amount: 55 }),
  }),
  z.object({
    ...processorBaseSchema,
    id: z.literal('equalizer'),
    parameters: z.object({
      bands: z.array(eqBandSchema).min(1).max(8),
    }).default({
      bands: [
        { id: 'low', enabled: true, type: 'low-shelf', frequency: 90, gainDb: 0, q: 0.7 },
        { id: 'body', enabled: true, type: 'bell', frequency: 250, gainDb: -1.5, q: 1 },
        { id: 'clarity', enabled: true, type: 'bell', frequency: 2_800, gainDb: 2, q: 1.2 },
        { id: 'air', enabled: true, type: 'high-shelf', frequency: 9_000, gainDb: 1, q: 0.7 },
      ],
    }),
  }),
  z.object({
    ...processorBaseSchema,
    id: z.literal('compressor'),
    parameters: z.object({
      thresholdDb: z.number().min(-60).max(0),
      ratio: z.number().min(1).max(20),
      attackMs: z.number().min(0.1).max(200),
      releaseMs: z.number().min(10).max(2_000),
      makeupDb: z.number().min(0).max(18),
    }).default({ thresholdDb: -18, ratio: 4, attackMs: 12, releaseMs: 180, makeupDb: 2 }),
  }),
  z.object({
    ...processorBaseSchema,
    id: z.literal('limiter'),
    parameters: z.object({
      thresholdDb: z.number().min(-18).max(0),
      releaseMs: z.number().min(10).max(1_000),
    }).default({ thresholdDb: -1, releaseMs: 90 }),
  }),
]);
export type MicProcessor = z.infer<typeof micProcessorSchema>;

export const audioPresetBusSchema = z.object({
  busId: audioBusIdSchema,
  enabled: z.boolean(),
  gain: z.number().min(0).max(1.5),
  deviceId: z.string().min(1),
});
export type AudioPresetBus = z.infer<typeof audioPresetBusSchema>;

export const audioPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  chatMix: z.number().min(-1).max(1),
  buses: z.array(audioPresetBusSchema),
  micProcessors: z.array(z.object({
    processorId: micProcessorIdSchema,
    enabled: z.boolean(),
  })),
});
export type AudioPreset = z.infer<typeof audioPresetSchema>;

export const audioStateSchema = z.object({
  enabled: z.boolean(),
  outputDevice: z.string(),
  microphoneDevice: z.string(),
  sampleRate: z.literal(48000),
  chatMix: z.number().min(-1).max(1),
  monitoring: z.number().min(0).max(1),
  buses: z.array(audioBusSchema),
  micProcessors: z.array(micProcessorSchema),
  devices: z.array(audioDeviceSchema).default([]),
  presets: z.array(audioPresetSchema).default([]),
  activePresetId: z.string().nullable().default(null),
});
export type AudioState = z.infer<typeof audioStateSchema>;

export const captureSourceTypeSchema = z.enum(['automatic-game', 'window', 'display']);
export type CaptureSourceType = z.infer<typeof captureSourceTypeSchema>;

export const captureSourceSchema = z.object({
  id: z.string().min(1),
  type: captureSourceTypeSchema,
  name: z.string().min(1),
  processId: z.number().int().positive().optional(),
  windowHandle: z.string().optional(),
  displayId: z.string().optional(),
  available: z.boolean(),
});
export type CaptureSource = z.infer<typeof captureSourceSchema>;

export const captureResolutionSchema = z.enum(['720p', '1080p', '1440p', '2160p', 'native']);
export type CaptureResolution = z.infer<typeof captureResolutionSchema>;

export const captureCodecSchema = z.enum(['h264', 'hevc', 'av1']);
export type CaptureCodec = z.infer<typeof captureCodecSchema>;

export const captureEncoderPreferenceSchema = z.enum(['auto', 'nvenc', 'amf', 'qsv', 'software']);
export type CaptureEncoderPreference = z.infer<typeof captureEncoderPreferenceSchema>;

export const captureConfigSchema = z.object({
  enabled: z.boolean(),
  source: captureSourceTypeSchema,
  sourceId: z.string().min(1).nullable(),
  displayIndex: z.number().int().min(0),
  fps: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  resolution: captureResolutionSchema,
  codec: captureCodecSchema,
  encoder: captureEncoderPreferenceSchema,
  quality: z.number().int().min(1).max(5),
  replaySeconds: z.number().int().min(15).max(300),
  includeMic: z.boolean(),
  includeSystemAudio: z.boolean(),
  includeCursor: z.boolean(),
  hotkey: z.string().min(1).max(128),
  clipsDirectory: z.string().max(4_096).nullable(),
});
export type CaptureConfig = z.infer<typeof captureConfigSchema>;

export const replayStateSchema = z.enum([
  'stopped',
  'starting',
  'waiting',
  'buffering',
  'saving',
  'recovering',
  'error',
]);
export type ReplayState = z.infer<typeof replayStateSchema>;

export const captureStorageSchema = z.object({
  clipsDirectory: z.string(),
  cacheDirectory: z.string(),
  availableBytes: z.number().nonnegative(),
  clipsBytes: z.number().nonnegative(),
  replayCacheBytes: z.number().nonnegative(),
  lowSpace: z.boolean(),
  criticalSpace: z.boolean(),
  warning: z.string().optional(),
});
export type CaptureStorage = z.infer<typeof captureStorageSchema>;

export const captureCapabilitiesSchema = z.object({
  backend: z.enum(['windows-graphics-capture', 'desktop-duplication', 'unavailable']),
  encoders: z.array(z.string()),
  codecs: z.array(captureCodecSchema),
  maximumFps: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  systemAudio: z.boolean(),
  microphoneAudio: z.boolean(),
  exclusiveFullscreen: z.literal(false),
});
export type CaptureCapabilities = z.infer<typeof captureCapabilitiesSchema>;

export const captureRuntimeSchema = z.object({
  state: replayStateSchema,
  bufferedSeconds: z.number().min(0),
  segmentCount: z.number().int().min(0),
  replayCacheBytes: z.number().min(0),
  observedBitrateBps: z.number().min(0),
  encoderLabel: z.string(),
  backendLabel: z.string(),
  droppedFrames: z.number().int().min(0),
  encodedFrames: z.number().int().min(0),
  audioSyncCorrections: z.number().int().min(0),
  activeSource: captureSourceSchema.nullable(),
  saveQueueDepth: z.number().int().min(0),
  shortcutRegistered: z.boolean(),
  warning: z.string().optional(),
  error: z.string().optional(),
  lastSavedAt: z.string().optional(),
});
export type CaptureRuntime = z.infer<typeof captureRuntimeSchema>;

export const captureHostSnapshotSchema = z.object({
  runtime: captureRuntimeSchema,
  storage: captureStorageSchema,
  capabilities: captureCapabilitiesSchema,
  sources: z.array(captureSourceSchema),
});
export type CaptureHostSnapshot = z.infer<typeof captureHostSnapshotSchema>;

export const clipSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  game: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  fileSize: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  fps: z.number().nonnegative(),
  codec: z.string().optional(),
  thumbnailPath: z.string().optional(),
});
export type Clip = z.infer<typeof clipSchema>;

export const performanceSnapshotSchema = z.object({
  coreMemoryMb: z.number().min(0),
  rendererMemoryMb: z.number().min(0),
  totalMemoryMb: z.number().min(0),
  totalCpuPercent: z.number().min(0),
  activeProcesses: z.number().int().min(1),
  budgetMemoryMb: z.number().min(1),
  budgetCpuPercent: z.number().min(0),
});
export type PerformanceSnapshot = z.infer<typeof performanceSnapshotSchema>;

export const appSettingsSchema = z.object({
  launchAtStartup: z.boolean(),
  closeToTray: z.boolean(),
  destroyRendererInTray: z.boolean(),
  automaticModuleUpdates: z.boolean(),
  performanceGuard: z.boolean(),
  diagnosticsRetentionDays: z.number().int().min(1).max(30),
  telemetry: z.literal(false),
  deviceAppearanceOverrides: z.record(z.string(), deviceAppearanceOverrideSchema).default({}),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const systemSnapshotSchema = z.object({
  version: z.string(),
  prototypeMode: z.boolean(),
  modules: z.array(moduleManifestSchema),
  devices: z.array(deviceSchema),
  engines: z.array(engineStatusSchema),
  audio: audioStateSchema,
  capture: z.object({
    config: captureConfigSchema,
    runtime: captureRuntimeSchema,
    storage: captureStorageSchema,
    capabilities: captureCapabilitiesSchema,
    sources: z.array(captureSourceSchema),
  }),
  clips: z.array(clipSchema),
  performance: performanceSnapshotSchema,
  settings: appSettingsSchema,
});
export type SystemSnapshot = z.infer<typeof systemSnapshotSchema>;

export const setModuleStateInputSchema = z.object({
  moduleId: z.string(),
  enabled: z.boolean(),
});
export type SetModuleStateInput = z.infer<typeof setModuleStateInputSchema>;

export const setDeviceSettingInputSchema = z.object({
  deviceId: z.string(),
  key: z.string(),
  value: deviceSettingValueSchema,
});
export type SetDeviceSettingInput = z.infer<typeof setDeviceSettingInputSchema>;

export const setDeviceAppearanceOverrideInputSchema = z.object({
  deviceId: z.string().min(1),
  override: deviceAppearanceOverrideSchema.nullable(),
});
export type SetDeviceAppearanceOverrideInput = z.infer<typeof setDeviceAppearanceOverrideInputSchema>;

export const setAudioBusGainInputSchema = z.object({
  busId: audioBusIdSchema,
  gain: z.number().min(0).max(1.5),
});
export type SetAudioBusGainInput = z.infer<typeof setAudioBusGainInputSchema>;

export const setAudioBusEnabledInputSchema = z.object({
  busId: audioBusIdSchema,
  enabled: z.boolean(),
});
export type SetAudioBusEnabledInput = z.infer<typeof setAudioBusEnabledInputSchema>;

export const setAudioBusDeviceInputSchema = z.object({
  busId: audioBusIdSchema,
  deviceId: z.string().min(1),
});
export type SetAudioBusDeviceInput = z.infer<typeof setAudioBusDeviceInputSchema>;

export const applyAudioPresetInputSchema = z.object({
  presetId: z.string().min(1),
});
export type ApplyAudioPresetInput = z.infer<typeof applyAudioPresetInputSchema>;

export const setMicProcessorInputSchema = z.discriminatedUnion('processorId', [
  z.object({
    processorId: z.literal('gain'),
    enabled: z.boolean().optional(),
    parameters: z.object({ gainDb: z.number().min(-20).max(30).optional() }).optional(),
  }),
  z.object({
    processorId: z.literal('noise-gate'),
    enabled: z.boolean().optional(),
    parameters: z.object({
      thresholdDb: z.number().min(-80).max(-10).optional(),
      attackMs: z.number().min(0.1).max(100).optional(),
      releaseMs: z.number().min(10).max(1_000).optional(),
    }).optional(),
  }),
  z.object({
    processorId: z.literal('noise-suppression'),
    enabled: z.boolean().optional(),
    parameters: z.object({ amount: z.number().min(0).max(100).optional() }).optional(),
  }),
  z.object({
    processorId: z.literal('equalizer'),
    enabled: z.boolean().optional(),
    parameters: z.object({ bands: z.array(eqBandSchema).min(1).max(8).optional() }).optional(),
  }),
  z.object({
    processorId: z.literal('compressor'),
    enabled: z.boolean().optional(),
    parameters: z.object({
      thresholdDb: z.number().min(-60).max(0).optional(),
      ratio: z.number().min(1).max(20).optional(),
      attackMs: z.number().min(0.1).max(200).optional(),
      releaseMs: z.number().min(10).max(2_000).optional(),
      makeupDb: z.number().min(0).max(18).optional(),
    }).optional(),
  }),
  z.object({
    processorId: z.literal('limiter'),
    enabled: z.boolean().optional(),
    parameters: z.object({
      thresholdDb: z.number().min(-18).max(0).optional(),
      releaseMs: z.number().min(10).max(1_000).optional(),
    }).optional(),
  }),
]);
export type SetMicProcessorInput = z.infer<typeof setMicProcessorInputSchema>;

export const updateSettingsInputSchema = appSettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

export const settingsResetScopeSchema = z.enum([
  'all',
  'general',
  'audio',
  'capture',
  'modules',
  'diagnostics',
]);
export type SettingsResetScope = z.infer<typeof settingsResetScopeSchema>;

export const ipcChannels = {
  getSnapshot: 'system:get-snapshot',
  setModuleState: 'modules:set-state',
  setDeviceSetting: 'devices:set-setting',
  setDeviceAppearanceOverride: 'devices:set-appearance-override',
  setAudioEnabled: 'audio:set-enabled',
  setAudioBusGain: 'audio:set-bus-gain',
  setAudioBusEnabled: 'audio:set-bus-enabled',
  setAudioBusDevice: 'audio:set-bus-device',
  applyAudioPreset: 'audio:apply-preset',
  setChatMix: 'audio:set-chat-mix',
  setMicProcessor: 'audio:set-mic-processor',
  audioMeterUpdated: 'audio:meter-updated',
  setCaptureConfig: 'capture:set-config',
  saveReplay: 'capture:save-replay',
  chooseClipDirectory: 'capture:choose-clip-directory',
  openClipsDirectory: 'capture:open-clips-directory',
  refreshCaptureSources: 'capture:refresh-sources',
  updateSettings: 'settings:update',
  resetSettings: 'settings:reset',
  revealClip: 'clips:reveal',
  deleteClip: 'clips:delete',
  renameClip: 'clips:rename',
  snapshotUpdated: 'system:snapshot-updated',
} as const;

export interface SwitchboardApi {
  getSnapshot(): Promise<SystemSnapshot>;
  setModuleState(input: SetModuleStateInput): Promise<SystemSnapshot>;
  setDeviceSetting(input: SetDeviceSettingInput): Promise<SystemSnapshot>;
  setDeviceAppearanceOverride(input: SetDeviceAppearanceOverrideInput): Promise<SystemSnapshot>;
  setAudioEnabled(enabled: boolean): Promise<SystemSnapshot>;
  setAudioBusGain(input: SetAudioBusGainInput): Promise<SystemSnapshot>;
  setAudioBusEnabled(input: SetAudioBusEnabledInput): Promise<SystemSnapshot>;
  setAudioBusDevice(input: SetAudioBusDeviceInput): Promise<SystemSnapshot>;
  applyAudioPreset(input: ApplyAudioPresetInput): Promise<SystemSnapshot>;
  setChatMix(value: number): Promise<SystemSnapshot>;
  setMicProcessor(input: SetMicProcessorInput): Promise<SystemSnapshot>;
  subscribeAudioMeters(listener: (frame: AudioMeterFrame) => void): () => void;
  setCaptureConfig(input: Partial<CaptureConfig>): Promise<SystemSnapshot>;
  saveReplay(): Promise<SystemSnapshot>;
  chooseClipDirectory(): Promise<SystemSnapshot>;
  openClipsDirectory(): Promise<void>;
  refreshCaptureSources(): Promise<SystemSnapshot>;
  updateSettings(input: UpdateSettingsInput): Promise<SystemSnapshot>;
  resetSettings(scope: SettingsResetScope): Promise<SystemSnapshot>;
  revealClip(id: string): Promise<void>;
  deleteClip(id: string): Promise<SystemSnapshot>;
  renameClip(input: RenameClipInput): Promise<SystemSnapshot>;
  subscribe(listener: (snapshot: SystemSnapshot) => void): () => void;
}

export const renameClipInputSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(120),
});
export type RenameClipInput = z.infer<typeof renameClipInputSchema>;
