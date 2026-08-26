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
  connectionLabel: z.string().min(1).optional(),
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

export const batteryCapabilitySchema = z.object({
  percentage: z.number().min(0).max(100),
  charging: z.boolean().optional(),
  fullyCharged: z.boolean().optional(),
  estimatedMinutesRemaining: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative(),
});
export type BatteryCapability = z.infer<typeof batteryCapabilitySchema>;

export const deviceProfileModeSchema = z.enum(['software', 'onboard']);
export type DeviceProfileMode = z.infer<typeof deviceProfileModeSchema>;

export const dpiCapabilitySchema = z.object({
  writable: z.boolean(),
  min: z.number().int().positive(),
  max: z.number().int().positive(),
  step: z.number().int().positive(),
  stages: z.array(z.number().int().positive()).min(1),
  activeDpi: z.number().int().positive(),
  defaultDpi: z.number().int().positive(),
  shiftDpi: z.number().int().positive().optional(),
  maxStages: z.number().int().positive().optional(),
  profileMode: deviceProfileModeSchema,
  unavailableReason: z.string().optional(),
});
export type DpiCapability = z.infer<typeof dpiCapabilitySchema>;

export const reportRateCapabilitySchema = z.object({
  writable: z.boolean(),
  value: z.number().int().positive(),
  supportedRates: z.array(z.number().int().positive()).min(1),
  profileMode: deviceProfileModeSchema,
  unavailableReason: z.string().optional(),
});
export type ReportRateCapability = z.infer<typeof reportRateCapabilitySchema>;

export const mouseActionCategorySchema = z.enum(['mouse', 'system']);
export type MouseActionCategory = z.infer<typeof mouseActionCategorySchema>;

export const mouseActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: mouseActionCategorySchema,
  searchTerms: z.array(z.string()).default([]),
  selectable: z.boolean().optional(),
});
export type MouseAction = z.infer<typeof mouseActionSchema>;

export const deviceHotspotSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  position: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }),
  calloutSide: z.enum(['left', 'right']),
  order: z.number().int().nonnegative(),
  capability: z.literal('button-assignment'),
});
export type DeviceHotspot = z.infer<typeof deviceHotspotSchema>;

export const buttonAssignmentBindingSchema = z.object({
  buttonId: z.string().min(1),
  slotId: z.string().min(1),
  currentActionId: z.string().min(1),
  hotspot: deviceHotspotSchema,
});
export type ButtonAssignmentBinding = z.infer<typeof buttonAssignmentBindingSchema>;

export const buttonAssignmentsCapabilitySchema = z.object({
  writable: z.boolean(),
  profileMode: deviceProfileModeSchema,
  bindings: z.array(buttonAssignmentBindingSchema),
  availableActions: z.array(mouseActionSchema),
  unavailableReason: z.string().optional(),
});
export type ButtonAssignmentsCapability = z.infer<typeof buttonAssignmentsCapabilitySchema>;

export const lightingEffectSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type LightingEffect = z.infer<typeof lightingEffectSchema>;

export const lightingCapabilitySchema = z.object({
  writable: z.boolean(),
  enabled: z.boolean(),
  activeEffectId: z.string().min(1),
  availableEffects: z.array(lightingEffectSchema).min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  colorWritable: z.boolean().default(false),
  brightness: z.number().min(0).max(100).optional(),
  brightnessWritable: z.boolean().default(false),
  profileMode: deviceProfileModeSchema,
  source: z.enum(['software', 'firmware']),
  unavailableReason: z.string().optional(),
});
export type LightingCapability = z.infer<typeof lightingCapabilitySchema>;

export const onboardMemoryCapabilitySchema = z.object({
  writable: z.boolean(),
  enabled: z.boolean(),
  activeProfile: z.string().min(1).optional(),
});
export type OnboardMemoryCapability = z.infer<typeof onboardMemoryCapabilitySchema>;

export const deviceCapabilitiesSchema = z.object({
  battery: batteryCapabilitySchema.optional(),
  dpi: dpiCapabilitySchema.optional(),
  reportRate: reportRateCapabilitySchema.optional(),
  buttonAssignments: buttonAssignmentsCapabilitySchema.optional(),
  lighting: lightingCapabilitySchema.optional(),
  onboardMemory: onboardMemoryCapabilitySchema.optional(),
  gain: z.boolean().optional(),
  monitoring: z.boolean().optional(),
  mute: z.boolean().optional(),
});
export type DeviceCapabilities = z.infer<typeof deviceCapabilitiesSchema>;

export const deviceSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  displayName: z.string(),
  kind: deviceKindSchema,
  connected: z.boolean(),
  identity: deviceIdentitySchema,
  variantResolution: deviceVariantResolutionSchema,
  asset: productAssetResolutionSchema,
  capabilities: deviceCapabilitiesSchema,
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

export const audioPathIdSchema = z.enum(['game', 'chat', 'media', 'microphone']);
export type AudioPathId = z.infer<typeof audioPathIdSchema>;

export const audioSupportLevelSchema = z.enum(['available', 'simulation', 'unavailable']);
export type AudioSupportLevel = z.infer<typeof audioSupportLevelSchema>;

export const audioCapabilitiesSchema = z.object({
  virtualChannels: audioSupportLevelSchema,
  applicationRouting: audioSupportLevelSchema,
  channelDsp: audioSupportLevelSchema,
  microphoneDsp: audioSupportLevelSchema,
  realtimeMetering: audioSupportLevelSchema,
  microphoneTest: audioSupportLevelSchema,
  monitoring: audioSupportLevelSchema,
  spatialAudio: audioSupportLevelSchema,
});
export type AudioCapabilities = z.infer<typeof audioCapabilitiesSchema>;

export const audioApplicationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  processId: z.number().int().positive(),
  iconDataUrl: z.string().startsWith('data:image/').optional(),
  destination: z.enum(['game', 'chat', 'media']),
  active: z.boolean(),
});
export type AudioApplication = z.infer<typeof audioApplicationSchema>;

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

export const channelAudioBusIdSchema = z.enum(['game', 'chat', 'media']);
export type ChannelAudioBusId = z.infer<typeof channelAudioBusIdSchema>;

export const channelProcessingSchema = z.object({
  busId: channelAudioBusIdSchema,
  equalizer: z.object({
    enabled: z.boolean(),
    bands: z.array(eqBandSchema).min(1).max(8),
  }),
  normalization: z.object({
    enabled: z.boolean(),
    targetLufs: z.number().min(-30).max(-10),
    maxGainDb: z.number().min(0).max(18),
  }),
  compressor: z.object({
    enabled: z.boolean(),
    thresholdDb: z.number().min(-60).max(0),
    ratio: z.number().min(1).max(20),
    attackMs: z.number().min(0.1).max(200),
    releaseMs: z.number().min(10).max(2_000),
    makeupDb: z.number().min(0).max(18),
  }),
  limiter: z.object({
    enabled: z.boolean(),
    thresholdDb: z.number().min(-18).max(0),
    releaseMs: z.number().min(10).max(1_000),
  }),
});
export type ChannelProcessing = z.infer<typeof channelProcessingSchema>;

const audioPresetBaseSchema = {
  id: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  builtIn: z.boolean(),
  schemaVersion: z.literal(1),
};

function channelPresetSchema(kind: 'game' | 'chat' | 'media') {
  return z.object({
    ...audioPresetBaseSchema,
    kind: z.literal(kind),
    processors: channelProcessingSchema.omit({ busId: true }),
  });
}

export const audioPathPresetSchema = z.discriminatedUnion('kind', [
  channelPresetSchema('game'),
  channelPresetSchema('chat'),
  channelPresetSchema('media'),
  z.object({
    ...audioPresetBaseSchema,
    kind: z.literal('microphone'),
    processors: z.array(micProcessorSchema),
    monitoring: z.object({
      enabled: z.boolean(),
      level: z.number().min(0).max(1),
      deviceId: z.string().min(1),
    }),
  }),
]);
export type AudioPathPreset = z.infer<typeof audioPathPresetSchema>;

export const audioPresetFileSchema = z.object({
  schemaVersion: z.literal(1),
  preset: audioPathPresetSchema,
});
export type AudioPresetFile = z.infer<typeof audioPresetFileSchema>;

export const audioStateSchema = z.object({
  enabled: z.boolean(),
  outputDevice: z.string(),
  microphoneDevice: z.string(),
  sampleRate: z.literal(48000),
  chatMix: z.number().min(-1).max(1),
  monitoring: z.number().min(0).max(1),
  monitoringEnabled: z.boolean().default(false),
  monitoringDeviceId: z.string().default('output-nova-pro'),
  buses: z.array(audioBusSchema),
  micProcessors: z.array(micProcessorSchema),
  channelProcessing: z.array(channelProcessingSchema).default([]),
  devices: z.array(audioDeviceSchema).default([]),
  applications: z.array(audioApplicationSchema).default([]),
  capabilities: audioCapabilitiesSchema.default({
    virtualChannels: 'unavailable',
    applicationRouting: 'unavailable',
    channelDsp: 'unavailable',
    microphoneDsp: 'unavailable',
    realtimeMetering: 'unavailable',
    microphoneTest: 'unavailable',
    monitoring: 'unavailable',
    spatialAudio: 'unavailable',
  }),
  pathPresets: z.array(audioPathPresetSchema).default([]),
  activePresetIds: z.object({
    game: z.string().nullable(),
    chat: z.string().nullable(),
    media: z.string().nullable(),
    microphone: z.string().nullable(),
  }).default({ game: null, chat: null, media: null, microphone: null }),
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
  activeSource: captureSourceSchema.nullish().transform((source) => source ?? null),
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

export const clipAudioChannelSchema = z.enum(['game', 'chat', 'microphone', 'media']);
export type ClipAudioChannel = z.infer<typeof clipAudioChannelSchema>;

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
  favorite: z.boolean().default(false),
  titleEdited: z.boolean().default(false),
  trimStartMs: z.number().int().nonnegative().default(0),
  trimEndMs: z.number().int().positive().optional(),
  audioChannels: z.array(clipAudioChannelSchema).max(4).optional(),
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

export const deviceControlChangeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dpi'), value: z.number().int().positive() }),
  z.object({ type: z.literal('dpi-stages'), stages: z.array(z.number().int().positive()).min(1) }),
  z.object({ type: z.literal('dpi-shift'), value: z.number().int().positive() }),
  z.object({ type: z.literal('report-rate'), value: z.number().int().positive() }),
  z.object({ type: z.literal('button-assignment'), buttonId: z.string().min(1), actionId: z.string().min(1) }),
  z.object({ type: z.literal('onboard-memory'), enabled: z.boolean() }),
  z.object({ type: z.literal('lighting-enabled'), enabled: z.boolean() }),
  z.object({ type: z.literal('lighting-color'), color: z.string().regex(/^#[0-9a-f]{6}$/i) }),
  z.object({ type: z.literal('lighting-brightness'), brightness: z.number().min(0).max(100) }),
  z.object({ type: z.literal('lighting-effect'), effectId: z.string().min(1) }),
]);
export type DeviceControlChange = z.infer<typeof deviceControlChangeSchema>;

export const setDeviceControlInputSchema = z.object({
  deviceId: z.string().min(1),
  change: deviceControlChangeSchema,
});
export type SetDeviceControlInput = z.infer<typeof setDeviceControlInputSchema>;

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

export const createAudioPresetInputSchema = z.object({
  kind: audioPathIdSchema,
  name: z.string().trim().min(1).max(64),
});
export type CreateAudioPresetInput = z.infer<typeof createAudioPresetInputSchema>;

export const renameAudioPresetInputSchema = z.object({
  presetId: z.string().min(1),
  name: z.string().trim().min(1).max(64),
});
export type RenameAudioPresetInput = z.infer<typeof renameAudioPresetInputSchema>;

export const audioPresetIdInputSchema = z.object({ presetId: z.string().min(1) });
export type AudioPresetIdInput = z.infer<typeof audioPresetIdInputSchema>;

export const setAudioMonitoringInputSchema = z.object({
  enabled: z.boolean().optional(),
  level: z.number().min(0).max(1).optional(),
  deviceId: z.string().min(1).optional(),
});
export type SetAudioMonitoringInput = z.infer<typeof setAudioMonitoringInputSchema>;

export const setAudioChannelProcessorInputSchema = z.discriminatedUnion('processorId', [
  z.object({
    busId: channelAudioBusIdSchema,
    processorId: z.literal('equalizer'),
    enabled: z.boolean().optional(),
    parameters: z.object({ bands: z.array(eqBandSchema).min(1).max(8).optional() }).optional(),
  }),
  z.object({
    busId: channelAudioBusIdSchema,
    processorId: z.literal('normalization'),
    enabled: z.boolean().optional(),
    parameters: z.object({
      targetLufs: z.number().min(-30).max(-10).optional(),
      maxGainDb: z.number().min(0).max(18).optional(),
    }).optional(),
  }),
  z.object({
    busId: channelAudioBusIdSchema,
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
    busId: channelAudioBusIdSchema,
    processorId: z.literal('limiter'),
    enabled: z.boolean().optional(),
    parameters: z.object({
      thresholdDb: z.number().min(-18).max(0).optional(),
      releaseMs: z.number().min(10).max(1_000).optional(),
    }).optional(),
  }),
]);
export type SetAudioChannelProcessorInput = z.infer<typeof setAudioChannelProcessorInputSchema>;

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
  'devices',
  'audio',
  'capture',
  'modules',
  'diagnostics',
]);
export type SettingsResetScope = z.infer<typeof settingsResetScopeSchema>;

export const ipcChannels = {
  getSnapshot: 'system:get-snapshot',
  setModuleState: 'modules:set-state',
  setDeviceControl: 'devices:set-control',
  setDeviceSetting: 'devices:set-setting',
  setDeviceAppearanceOverride: 'devices:set-appearance-override',
  setAudioEnabled: 'audio:set-enabled',
  setAudioBusGain: 'audio:set-bus-gain',
  setAudioBusEnabled: 'audio:set-bus-enabled',
  setAudioBusDevice: 'audio:set-bus-device',
  applyAudioPreset: 'audio:apply-preset',
  createAudioPreset: 'audio:create-preset',
  renameAudioPreset: 'audio:rename-preset',
  duplicateAudioPreset: 'audio:duplicate-preset',
  deleteAudioPreset: 'audio:delete-preset',
  importAudioPreset: 'audio:import-preset',
  exportAudioPreset: 'audio:export-preset',
  setAudioChannelProcessor: 'audio:set-channel-processor',
  setAudioMonitoring: 'audio:set-monitoring',
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
  setClipFavorite: 'clips:set-favorite',
  setClipTrim: 'clips:set-trim',
  exportClip: 'clips:export',
  snapshotUpdated: 'system:snapshot-updated',
} as const;

export interface SwitchboardApi {
  getSnapshot(): Promise<SystemSnapshot>;
  setModuleState(input: SetModuleStateInput): Promise<SystemSnapshot>;
  setDeviceControl(input: SetDeviceControlInput): Promise<SystemSnapshot>;
  setDeviceSetting(input: SetDeviceSettingInput): Promise<SystemSnapshot>;
  setDeviceAppearanceOverride(input: SetDeviceAppearanceOverrideInput): Promise<SystemSnapshot>;
  setAudioEnabled(enabled: boolean): Promise<SystemSnapshot>;
  setAudioBusGain(input: SetAudioBusGainInput): Promise<SystemSnapshot>;
  setAudioBusEnabled(input: SetAudioBusEnabledInput): Promise<SystemSnapshot>;
  setAudioBusDevice(input: SetAudioBusDeviceInput): Promise<SystemSnapshot>;
  applyAudioPreset(input: ApplyAudioPresetInput): Promise<SystemSnapshot>;
  createAudioPreset(input: CreateAudioPresetInput): Promise<SystemSnapshot>;
  renameAudioPreset(input: RenameAudioPresetInput): Promise<SystemSnapshot>;
  duplicateAudioPreset(input: AudioPresetIdInput): Promise<SystemSnapshot>;
  deleteAudioPreset(input: AudioPresetIdInput): Promise<SystemSnapshot>;
  importAudioPreset(): Promise<SystemSnapshot>;
  exportAudioPreset(input: AudioPresetIdInput): Promise<void>;
  setAudioChannelProcessor(input: SetAudioChannelProcessorInput): Promise<SystemSnapshot>;
  setAudioMonitoring(input: SetAudioMonitoringInput): Promise<SystemSnapshot>;
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
  setClipFavorite(input: SetClipFavoriteInput): Promise<SystemSnapshot>;
  setClipTrim(input: SetClipTrimInput): Promise<SystemSnapshot>;
  exportClip(input: ExportClipInput): Promise<boolean>;
  subscribe(listener: (snapshot: SystemSnapshot) => void): () => void;
}

export const renameClipInputSchema = z.object({
  id: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(120),
});
export type RenameClipInput = z.infer<typeof renameClipInputSchema>;

export const setClipFavoriteInputSchema = z.object({
  id: z.string().min(1).max(256),
  favorite: z.boolean(),
});
export type SetClipFavoriteInput = z.infer<typeof setClipFavoriteInputSchema>;

const clipTrimInputShape = {
  id: z.string().min(1).max(256),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
};

export const clipTrimInputSchema = z.object(clipTrimInputShape).refine((input) => input.endMs > input.startMs, {
  message: 'The trim end must be after the trim start.',
  path: ['endMs'],
});
export type SetClipTrimInput = z.infer<typeof clipTrimInputSchema>;

export const clipExportPresetSchema = z.enum(['original', '10mb', '25mb', '50mb']);
export type ClipExportPreset = z.infer<typeof clipExportPresetSchema>;

export const exportClipInputSchema = z.object({
  ...clipTrimInputShape,
  preset: clipExportPresetSchema,
}).refine((input) => input.endMs > input.startMs, {
  message: 'The trim end must be after the trim start.',
  path: ['endMs'],
});
export type ExportClipInput = z.infer<typeof exportClipInputSchema>;
