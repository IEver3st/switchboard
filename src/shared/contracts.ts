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
  shiftMode: z.enum(['device-profile', 'host-button-spy']).optional(),
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
  controls: z.array(z.enum(['color', 'zones', 'brightness', 'speed', 'direction'])).optional(),
});
export type LightingEffect = z.infer<typeof lightingEffectSchema>;

export const lightingDirectionSchema = z.enum([
  'cycle',
  'left',
  'right',
  'up',
  'down',
  'in',
  'out',
  'center-in',
  'center-out',
]);
export type LightingDirection = z.infer<typeof lightingDirectionSchema>;

export const lightingZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  colorWritable: z.boolean(),
});
export type LightingZone = z.infer<typeof lightingZoneSchema>;

export const lightingProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  effectId: z.string().min(1),
  brightness: z.number().min(0).max(100),
  speed: z.number().min(1).max(100),
});
export type LightingProfile = z.infer<typeof lightingProfileSchema>;

export const lightingCapabilitySchema = z.object({
  writable: z.boolean(),
  enabled: z.boolean(),
  activeEffectId: z.string().min(1),
  availableEffects: z.array(lightingEffectSchema).min(1),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  colorWritable: z.boolean().default(false),
  brightness: z.number().min(0).max(100).optional(),
  brightnessWritable: z.boolean().default(false),
  speed: z.number().min(1).max(100).optional(),
  speedWritable: z.boolean().default(false),
  direction: lightingDirectionSchema.optional(),
  availableDirections: z.array(lightingDirectionSchema).optional(),
  directionWritable: z.boolean().optional(),
  zones: z.array(lightingZoneSchema).optional(),
  profiles: z.array(lightingProfileSchema).default([]),
  activeProfileId: z.string().min(1).optional(),
  muteLinked: z.boolean().default(false),
  muteLinkedWritable: z.boolean().default(false),
  state: z.enum(['maintained', 'acknowledged', 'unknown']).optional(),
  stateReason: z.string().optional(),
  physicalEffectVerified: z.boolean().default(false),
  profileMode: deviceProfileModeSchema,
  source: z.enum(['software', 'firmware']),
  unavailableReason: z.string().optional(),
});
export type LightingCapability = z.infer<typeof lightingCapabilitySchema>;

export const keyboardFeatureStatusSchema = z.enum(['native', 'synapse', 'observed']);
export type KeyboardFeatureStatus = z.infer<typeof keyboardFeatureStatusSchema>;

export const keyboardFeatureSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().min(1),
  status: keyboardFeatureStatusSchema,
  unavailableReason: z.string().optional(),
});
export type KeyboardFeature = z.infer<typeof keyboardFeatureSchema>;

export const keyboardToggleCapabilitySchema = z.object({
  enabled: z.boolean().nullable(),
  writable: z.boolean(),
  unavailableReason: z.string().optional(),
});
export type KeyboardToggleCapability = z.infer<typeof keyboardToggleCapabilitySchema>;

export const keyboardOnboardProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type KeyboardOnboardProfile = z.infer<typeof keyboardOnboardProfileSchema>;

export const keyboardOnboardProfilesCapabilitySchema = z.object({
  activeProfileId: z.string().min(1).nullable(),
  profiles: z.array(keyboardOnboardProfileSchema),
  writable: z.boolean(),
  unavailableReason: z.string().optional(),
});
export type KeyboardOnboardProfilesCapability = z.infer<typeof keyboardOnboardProfilesCapabilitySchema>;

export const keyboardDiagnosticReadSchema = z.object({
  id: z.string().min(1),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type KeyboardDiagnosticRead = z.infer<typeof keyboardDiagnosticReadSchema>;

export const keyboardDiagnosticsSchema = z.object({
  protocol: z.string().min(1),
  endpoint: z.enum(['ready', 'partial', 'unavailable']),
  lastSyncAt: z.string().optional(),
  lastControlError: z.string().optional(),
  reads: z.array(keyboardDiagnosticReadSchema),
});
export type KeyboardDiagnostics = z.infer<typeof keyboardDiagnosticsSchema>;

export const keyboardCapabilitySchema = z.object({
  firmwareVersion: z.string().min(1).optional(),
  pollingRateHz: z.number().int().positive().optional(),
  transport: z.enum(['native-hid', 'unavailable']),
  features: z.array(keyboardFeatureSchema),
  gamingMode: keyboardToggleCapabilitySchema.optional(),
  rapidTrigger: keyboardToggleCapabilitySchema.optional(),
  snapTap: keyboardToggleCapabilitySchema.optional(),
  onboardProfiles: keyboardOnboardProfilesCapabilitySchema.optional(),
  diagnostics: keyboardDiagnosticsSchema.optional(),
});
export type KeyboardCapability = z.infer<typeof keyboardCapabilitySchema>;

export const microphoneMuteStateCapabilitySchema = z.object({
  muted: z.boolean().nullable(),
  source: z.literal('hardware'),
  updatedAt: z.string().optional(),
  unavailableReason: z.string().optional(),
});
export type MicrophoneMuteStateCapability = z.infer<typeof microphoneMuteStateCapabilitySchema>;

export const onboardMemoryCapabilitySchema = z.object({
  writable: z.boolean(),
  enabled: z.boolean(),
  activeProfile: z.string().min(1).optional(),
});
export type OnboardMemoryCapability = z.infer<typeof onboardMemoryCapabilitySchema>;

export const headsetTransportStateSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'busy',
  'unsupported',
  'error',
]);
export type HeadsetTransportState = z.infer<typeof headsetTransportStateSchema>;

export const headsetControlAvailabilitySchema = z.enum([
  'available',
  'temporarily-unavailable',
  'read-only',
]);
export type HeadsetControlAvailability = z.infer<typeof headsetControlAvailabilitySchema>;

export const headsetToggleCapabilitySchema = z.object({
  enabled: z.boolean().nullable(),
  writable: z.boolean(),
  availability: headsetControlAvailabilitySchema.default('available'),
  unavailableReason: z.string().optional(),
});
export type HeadsetToggleCapability = z.infer<typeof headsetToggleCapabilitySchema>;

export const sonyNoiseControlModeSchema = z.enum(['noise-cancelling', 'ambient', 'off']);
export type SonyNoiseControlMode = z.infer<typeof sonyNoiseControlModeSchema>;

export const sonyNoiseControlCapabilitySchema = z.object({
  writable: z.boolean(),
  availability: headsetControlAvailabilitySchema.default('available'),
  supportedModes: z.array(sonyNoiseControlModeSchema).min(1).default(['noise-cancelling', 'ambient', 'off']),
  mode: sonyNoiseControlModeSchema.nullable(),
  ambientLevel: z.number().int().min(1).max(20).nullable(),
  ambientLevelMin: z.literal(1),
  ambientLevelMax: z.literal(20),
  focusOnVoice: z.boolean().nullable(),
  unavailableReason: z.string().optional(),
});
export type SonyNoiseControlCapability = z.infer<typeof sonyNoiseControlCapabilitySchema>;

export const sonyEqualizerBandSchema = z.object({
  frequencyHz: z.number().int().positive(),
  gainDb: z.number().int().min(-6).max(6),
});
export type SonyEqualizerBand = z.infer<typeof sonyEqualizerBandSchema>;

export const sonyEqualizerPresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  writable: z.boolean(),
  storedOnHeadphones: z.boolean(),
});
export type SonyEqualizerPreset = z.infer<typeof sonyEqualizerPresetSchema>;

export const sonyEqualizerCapabilitySchema = z.object({
  writable: z.boolean(),
  bandsWritable: z.boolean().default(true),
  availability: headsetControlAvailabilitySchema.default('available'),
  activePresetId: z.string().min(1).nullable(),
  bands: z.array(sonyEqualizerBandSchema).length(10),
  presets: z.array(sonyEqualizerPresetSchema).min(1),
  gainMinDb: z.literal(-6),
  gainMaxDb: z.literal(6),
  unavailableReason: z.string().optional(),
});
export type SonyEqualizerCapability = z.infer<typeof sonyEqualizerCapabilitySchema>;

export const sonyListeningModeSchema = z.enum(['standard', 'background-music', 'cinema']);
export type SonyListeningMode = z.infer<typeof sonyListeningModeSchema>;

export const sonyBackgroundRoomSchema = z.enum(['my-room', 'living-room', 'cafe']);
export type SonyBackgroundRoom = z.infer<typeof sonyBackgroundRoomSchema>;

export const sonyListeningModeCapabilitySchema = z.object({
  writable: z.boolean(),
  availability: headsetControlAvailabilitySchema.default('available'),
  supportedModes: z.array(sonyListeningModeSchema).min(1).default(['standard', 'background-music', 'cinema']),
  mode: sonyListeningModeSchema.nullable(),
  backgroundRoom: sonyBackgroundRoomSchema.nullable(),
  unavailableReason: z.string().optional(),
});
export type SonyListeningModeCapability = z.infer<typeof sonyListeningModeCapabilitySchema>;

export const sonyHeadsetDiagnosticsSchema = z.object({
  protocol: z.literal('sony-mdr-v2'),
  lastSyncAt: z.string().nullable(),
  reconnectCount: z.number().int().nonnegative(),
  malformedFrameCount: z.number().int().nonnegative(),
  commandFailureCount: z.number().int().nonnegative(),
  lastErrorCode: z.string().nullable(),
});
export type SonyHeadsetDiagnostics = z.infer<typeof sonyHeadsetDiagnosticsSchema>;

export const sonyHeadsetCapabilitySchema = z.object({
  platform: z.literal('sony-mdr'),
  model: z.literal('wh-1000xm6'),
  transportState: headsetTransportStateSchema,
  transportMessage: z.string().optional(),
  firmwareVersion: z.string().min(1).optional(),
  codec: z.string().min(1).optional(),
  noiseControl: sonyNoiseControlCapabilitySchema.optional(),
  equalizer: sonyEqualizerCapabilitySchema.optional(),
  dseeExtreme: headsetToggleCapabilitySchema.optional(),
  speakToChat: headsetToggleCapabilitySchema.optional(),
  listeningMode: sonyListeningModeCapabilitySchema.optional(),
  diagnostics: sonyHeadsetDiagnosticsSchema,
});
export type SonyHeadsetCapability = z.infer<typeof sonyHeadsetCapabilitySchema>;

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
  muteState: microphoneMuteStateCapabilitySchema.optional(),
  keyboard: keyboardCapabilitySchema.optional(),
  headset: sonyHeadsetCapabilitySchema.optional(),
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

export const audioEndpointFormFactorSchema = z.enum([
  'remote-network-device',
  'speakers',
  'line-level',
  'headphones',
  'microphone',
  'headset',
  'handset',
  'spdif',
  'digital-display',
  'unknown',
]);
export type AudioEndpointFormFactor = z.infer<typeof audioEndpointFormFactorSchema>;

export const audioDeviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  direction: audioDeviceDirectionSchema,
  isDefault: z.boolean(),
  available: z.boolean(),
  formFactor: audioEndpointFormFactorSchema.nullable().optional(),
  isVirtual: z.boolean().default(false),
  isSwitchboard: z.boolean().default(false),
});
export type AudioDevice = z.infer<typeof audioDeviceSchema>;

export const audioBusSchema = z.object({
  id: audioBusIdSchema,
  label: z.string(),
  enabled: z.boolean().default(true),
  appCount: z.number().int().min(0),
  meter: z.number().min(0).max(1),
  endpoint: z.string(),
  deviceId: z.string().default(''),
});
export type AudioBus = z.infer<typeof audioBusSchema>;

export const audioMasterSchema = z.object({
  gain: z.number().min(0).max(1.5),
  enabled: z.boolean(),
});
export type AudioMaster = z.infer<typeof audioMasterSchema>;

export const audioMixIdSchema = z.enum(['personal', 'stream', 'clip']);
export type AudioMixId = z.infer<typeof audioMixIdSchema>;

export const audioMixBusSchema = z.object({
  id: audioBusIdSchema,
  gain: z.number().min(0).max(1.5),
  enabled: z.boolean(),
});
export type AudioMixBus = z.infer<typeof audioMixBusSchema>;

export const audioMixSchema = z.object({
  id: audioMixIdSchema,
  label: z.string().min(1),
  master: audioMasterSchema,
  buses: z.array(audioMixBusSchema),
});
export type AudioMix = z.infer<typeof audioMixSchema>;

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
  noiseSuppression: audioSupportLevelSchema.default('unavailable'),
  realtimeMetering: audioSupportLevelSchema,
  microphoneTest: audioSupportLevelSchema,
  monitoring: audioSupportLevelSchema,
  spatialAudio: audioSupportLevelSchema,
  reason: z.string().nullable().optional(),
});
export type AudioCapabilities = z.infer<typeof audioCapabilitiesSchema>;

export const noiseSuppressionDiagnosticsSchema = z.object({
  backend: z.string(),
  available: z.boolean(),
  modelIdentifier: z.string().nullable().default(null),
  modelHash: z.string().nullable().default(null),
  nativeLibraryHash: z.string().nullable().default(null),
  state: z.enum(['not-loaded', 'ready', 'bypassed']),
  modelInitializationMs: z.number().nonnegative(),
  inputSampleRate: z.number().int().nonnegative(),
  processingSampleRate: z.literal(48000),
  frameLength: z.number().int().nonnegative(),
  algorithmicLatencyMs: z.number().nonnegative(),
  attenuationLimitDb: z.number().nonnegative(),
  localSnrDb: z.number().nullable().default(null),
  p50Ms: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  p99Ms: z.number().nonnegative(),
  maximumMs: z.number().nonnegative(),
  captureCallbackP99Ms: z.number().nonnegative(),
  captureOverruns: z.number().int().nonnegative(),
  monitorOverruns: z.number().int().nonnegative().default(0),
  monitorUnderruns: z.number().int().nonnegative(),
  droppedOrBypassedFrames: z.number().int().nonnegative(),
  recoveryCount: z.number().int().nonnegative(),
  lastError: z.string().nullable().default(null),
});
export type NoiseSuppressionDiagnostics = z.infer<typeof noiseSuppressionDiagnosticsSchema>;

export const virtualDriverStateSchema = z.object({
  state: z.enum(['ready', 'not-installed', 'incomplete']),
  interfaceName: z.string(),
  missingEndpoints: z.array(z.string()),
  endpoints: z.array(z.object({ id: z.string(), name: z.string(), flow: z.enum(['render', 'capture']) })),
  message: z.string(),
});
export type VirtualDriverState = z.infer<typeof virtualDriverStateSchema>;

export const audioApplicationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  executableName: z.string().min(1),
  processId: z.number().int().positive(),
  iconDataUrl: z.string().startsWith('data:image/').optional(),
  destination: z.enum(['game', 'chat', 'media']),
  currentDestination: z.enum(['game', 'chat', 'media']),
  preferredDestination: z.enum(['game', 'chat', 'media']).nullable(),
  routingState: z.enum(['unmanaged', 'applied', 'pending-restart']),
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

export const configuredMicProcessorSchema = z.object({
  id: micProcessorIdSchema,
  enabled: z.boolean(),
  parameters: z.record(z.string(), z.unknown()),
});
export type ConfiguredMicProcessor = z.infer<typeof configuredMicProcessorSchema>;

export const microphoneMonitoringRuntimeSchema = z.object({
  requested: z.boolean(),
  active: z.boolean(),
  level: z.number().min(0).max(1),
  requestedDeviceId: z.string().nullable().default(null),
  activeDeviceId: z.string().nullable().default(null),
});
export type MicrophoneMonitoringRuntime = z.infer<typeof microphoneMonitoringRuntimeSchema>;

export const microphoneRuntimeSchema = z.object({
  configurationVersion: z.number().int().nonnegative(),
  requestedInputDeviceId: z.string().nullable().default(null),
  activeInputDeviceId: z.string().nullable().default(null),
  inputFormat: z.string().nullable().default(null),
  processors: z.array(configuredMicProcessorSchema),
  monitoring: microphoneMonitoringRuntimeSchema,
  error: z.string().nullable().default(null),
});
export type MicrophoneRuntime = z.infer<typeof microphoneRuntimeSchema>;

export const audioHostSnapshotSchema = z.object({
  capabilities: audioCapabilitiesSchema,
  noiseSuppression: noiseSuppressionDiagnosticsSchema,
  inputDeviceId: z.string().nullable().default(null),
  inputFormat: z.string().nullable().default(null),
  monitoringDeviceId: z.string().nullable().default(null),
  running: z.boolean(),
  error: z.string().nullable().default(null),
  driver: virtualDriverStateSchema,
  applications: z.array(audioApplicationSchema),
  buses: z.array(z.object({
    id: audioBusIdSchema,
    applicationCount: z.number().int().nonnegative(),
  })),
  mixes: z.array(audioMixSchema),
  microphone: microphoneRuntimeSchema.nullable().default(null),
});
export type AudioHostSnapshot = z.infer<typeof audioHostSnapshotSchema>;

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
      deviceId: z.string(),
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
  mixes: z.array(audioMixSchema),
  chatMix: z.number().min(-1).max(1),
  monitoring: z.number().min(0).max(1),
  monitoringEnabled: z.boolean().default(false),
  monitoringDeviceId: z.string().default(''),
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
    noiseSuppression: 'unavailable',
    realtimeMetering: 'unavailable',
    microphoneTest: 'unavailable',
    monitoring: 'unavailable',
    spatialAudio: 'unavailable',
  }),
  host: audioHostSnapshotSchema.nullable().default(null),
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
  volumeTotalBytes: z.number().nonnegative(),
  volumeAvailableBytes: z.number().nonnegative(),
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

export const clipCanvasSizeSchema = z.enum(['original', '9:16']);
export type ClipCanvasSize = z.infer<typeof clipCanvasSizeSchema>;

export const clipAudioWaveformTrackSchema = z.object({
  trackIndex: z.number().int().min(0).max(7),
  label: z.string().trim().min(1).max(80),
  channel: clipAudioChannelSchema.optional(),
  samples: z.array(z.number().min(0).max(1)).max(256),
});
export type ClipAudioWaveformTrack = z.infer<typeof clipAudioWaveformTrackSchema>;

export const clipAudioWaveformSchema = z.object({
  clipId: z.string().min(1),
  tracks: z.array(clipAudioWaveformTrackSchema).max(8),
});
export type ClipAudioWaveform = z.infer<typeof clipAudioWaveformSchema>;

export const clipAudioTrackTrimSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
}).refine((trim) => trim.endMs > trim.startMs, {
  message: 'The audio track trim end must be after its start.',
  path: ['endMs'],
});
export type ClipAudioTrackTrim = z.infer<typeof clipAudioTrackTrimSchema>;

export const clipAudioTrackTrimsSchema = z.array(clipAudioTrackTrimSchema.nullable()).max(8);

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
  trimStartMs: z.number().int().nonnegative().optional(),
  trimEndMs: z.number().int().positive().optional(),
  canvasSize: clipCanvasSizeSchema.default('original'),
  audioChannels: z.array(clipAudioChannelSchema).max(4).optional(),
  audioTrackLevels: z.array(z.number().int().min(0).max(100)).max(8).optional(),
  audioTrackTrims: clipAudioTrackTrimsSchema.optional(),
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

export const detectedGameSourceSchema = z.enum(['steam', 'epic', 'manual']);
export type DetectedGameSource = z.infer<typeof detectedGameSourceSchema>;

export const detectedGameSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  source: detectedGameSourceSchema,
  installDirectory: z.string().min(1),
  executablePath: z.string().min(1).nullable(),
  launchUri: z.string().min(1).nullable(),
  iconDataUrl: z.string().startsWith('data:image/').max(262_144).optional(),
  addedAt: z.string(),
});
export type DetectedGame = z.infer<typeof detectedGameSchema>;

export const gameDetectionStateSchema = z.object({
  capability: z.enum(['available', 'simulation']),
  scanState: z.enum(['idle', 'scanning', 'error']),
  games: z.array(detectedGameSchema),
  lastScanAt: z.string().nullable(),
  warning: z.string().optional(),
  error: z.string().optional(),
});
export type GameDetectionState = z.infer<typeof gameDetectionStateSchema>;

export const appSettingsSchema = z.object({
  launchAtStartup: z.boolean(),
  closeToTray: z.boolean(),
  destroyRendererInTray: z.boolean(),
  automaticAppUpdates: z.boolean(),
  automaticAppUpdateDownloads: z.boolean(),
  installAppUpdatesOnNextStartup: z.boolean(),
  automaticModuleUpdates: z.boolean(),
  performanceGuard: z.boolean(),
  diagnosticsRetentionDays: z.number().int().min(1).max(30),
  telemetry: z.literal(false),
  scanGamesAutomatically: z.boolean(),
  clipEditorInspectorOpen: z.boolean(),
  deviceAppearanceOverrides: z.record(z.string(), deviceAppearanceOverrideSchema).default({}),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const appUpdateStateSchema = z.object({
  capability: z.enum(['available', 'unavailable']),
  status: z.enum(['idle', 'checking', 'available', 'downloading', 'downloaded', 'installing', 'error', 'unavailable']),
  currentVersion: z.string().min(1),
  availableVersion: z.string().min(1).nullable(),
  downloadProgress: z.number().min(0).max(100).nullable(),
  checkedAt: z.string().nullable(),
  error: z.string().nullable(),
  unavailableReason: z.string().nullable(),
});
export type AppUpdateState = z.infer<typeof appUpdateStateSchema>;

export const systemSnapshotSchema = z.object({
  version: z.string(),
  prototypeMode: z.boolean(),
  appUpdate: appUpdateStateSchema,
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
  gameDetection: gameDetectionStateSchema,
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
  z.object({ type: z.literal('lighting-speed'), speed: z.number().min(1).max(100) }),
  z.object({ type: z.literal('lighting-direction'), direction: lightingDirectionSchema }),
  z.object({
    type: z.literal('lighting-zone-color'),
    zoneId: z.string().min(1),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  z.object({ type: z.literal('lighting-profile'), profileId: z.string().min(1) }),
  z.object({ type: z.literal('keyboard-gaming-mode'), enabled: z.boolean() }),
  z.object({ type: z.literal('keyboard-rapid-trigger'), enabled: z.boolean() }),
  z.object({ type: z.literal('keyboard-snap-tap'), enabled: z.boolean() }),
  z.object({ type: z.literal('keyboard-onboard-profile'), profileId: z.string().min(1) }),
  z.object({ type: z.literal('microphone-mute-lighting'), enabled: z.boolean() }),
  z.object({ type: z.literal('headset-noise-control'), mode: sonyNoiseControlModeSchema }),
  z.object({ type: z.literal('headset-ambient-level'), level: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal('headset-focus-on-voice'), enabled: z.boolean() }),
  z.object({ type: z.literal('headset-equalizer-preset'), presetId: z.string().min(1) }),
  z.object({ type: z.literal('headset-equalizer-bands'), gainsDb: z.array(z.number().int().min(-6).max(6)).length(10) }),
  z.object({ type: z.literal('headset-dsee-extreme'), enabled: z.boolean() }),
  z.object({ type: z.literal('headset-speak-to-chat'), enabled: z.boolean() }),
  z.object({ type: z.literal('headset-reconnect') }),
  z.object({
    type: z.literal('headset-listening-mode'),
    mode: sonyListeningModeSchema,
    backgroundRoom: sonyBackgroundRoomSchema.optional(),
  }),
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
  mixId: audioMixIdSchema,
  busId: audioBusIdSchema,
  gain: z.number().min(0).max(1.5),
});
export type SetAudioBusGainInput = z.infer<typeof setAudioBusGainInputSchema>;

export const setAudioMasterGainInputSchema = z.object({
  mixId: audioMixIdSchema,
  gain: z.number().min(0).max(1.5),
});
export type SetAudioMasterGainInput = z.infer<typeof setAudioMasterGainInputSchema>;

export const setAudioMasterEnabledInputSchema = z.object({
  mixId: audioMixIdSchema,
  enabled: z.boolean(),
});
export type SetAudioMasterEnabledInput = z.infer<typeof setAudioMasterEnabledInputSchema>;

export const setAudioBusEnabledInputSchema = z.object({
  mixId: audioMixIdSchema,
  busId: audioBusIdSchema,
  enabled: z.boolean(),
});
export type SetAudioBusEnabledInput = z.infer<typeof setAudioBusEnabledInputSchema>;

export const setAudioChannelEnabledInputSchema = z.object({
  busId: audioBusIdSchema,
  enabled: z.boolean(),
});
export type SetAudioChannelEnabledInput = z.infer<typeof setAudioChannelEnabledInputSchema>;

export const setAudioBusDeviceInputSchema = z.object({
  busId: audioBusIdSchema,
  deviceId: z.string().min(1),
});
export type SetAudioBusDeviceInput = z.infer<typeof setAudioBusDeviceInputSchema>;

export const setAudioApplicationRouteInputSchema = z.object({
  applicationId: z.string().min(1),
  destination: z.enum(['game', 'chat', 'media']),
});
export type SetAudioApplicationRouteInput = z.infer<typeof setAudioApplicationRouteInputSchema>;

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
  'games',
  'modules',
  'diagnostics',
]);
export type SettingsResetScope = z.infer<typeof settingsResetScopeSchema>;

export const feedbackReportKindSchema = z.enum(['bug', 'feature']);
export type FeedbackReportKind = z.infer<typeof feedbackReportKindSchema>;

export const feedbackReportInputSchema = z.object({
  kind: feedbackReportKindSchema,
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(10).max(2_000),
  supportingDetails: z.string().trim().max(1_200).optional(),
  includeDiagnostics: z.boolean(),
});
export type FeedbackReportInput = z.infer<typeof feedbackReportInputSchema>;

export const feedbackHandoffResultSchema = z.object({
  copied: z.boolean(),
  opened: z.boolean(),
});
export type FeedbackHandoffResult = z.infer<typeof feedbackHandoffResultSchema>;

export const ipcChannels = {
  getSnapshot: 'system:get-snapshot',
  refreshDevices: 'devices:refresh',
  setModuleState: 'modules:set-state',
  setDeviceControl: 'devices:set-control',
  setDeviceSetting: 'devices:set-setting',
  setDeviceAppearanceOverride: 'devices:set-appearance-override',
  setAudioEnabled: 'audio:set-enabled',
  setAudioMasterGain: 'audio:set-master-gain',
  setAudioMasterEnabled: 'audio:set-master-enabled',
  setAudioBusGain: 'audio:set-bus-gain',
  setAudioBusEnabled: 'audio:set-bus-enabled',
  setAudioChannelEnabled: 'audio:set-channel-enabled',
  setAudioBusDevice: 'audio:set-bus-device',
  setAudioApplicationRoute: 'audio:set-application-route',
  applyAudioPreset: 'audio:apply-preset',
  createAudioPreset: 'audio:create-preset',
  renameAudioPreset: 'audio:rename-preset',
  duplicateAudioPreset: 'audio:duplicate-preset',
  deleteAudioPreset: 'audio:delete-preset',
  importAudioPreset: 'audio:import-preset',
  exportAudioPreset: 'audio:export-preset',
  setAudioChannelProcessor: 'audio:set-channel-processor',
  setAudioMonitoring: 'audio:set-monitoring',
  testMicrophone: 'audio:test-microphone',
  setChatMix: 'audio:set-chat-mix',
  setMicProcessor: 'audio:set-mic-processor',
  audioMeterUpdated: 'audio:meter-updated',
  setCaptureConfig: 'capture:set-config',
  saveReplay: 'capture:save-replay',
  chooseClipDirectory: 'capture:choose-clip-directory',
  openClipsDirectory: 'capture:open-clips-directory',
  refreshCaptureSources: 'capture:refresh-sources',
  scanGames: 'games:scan',
  addGame: 'games:add',
  checkAppUpdates: 'updates:check',
  downloadAppUpdate: 'updates:download',
  installAppUpdate: 'updates:install',
  updateSettings: 'settings:update',
  resetSettings: 'settings:reset',
  handoffFeedbackReport: 'feedback:handoff-report',
  revealClip: 'clips:reveal',
  deleteClip: 'clips:delete',
  renameClip: 'clips:rename',
  setClipFavorite: 'clips:set-favorite',
  setClipTrim: 'clips:set-trim',
  setClipCanvasSize: 'clips:set-canvas-size',
  setClipAudioTrackLevel: 'clips:set-audio-track-level',
  loadClipAudioWaveform: 'clips:load-audio-waveform',
  exportClip: 'clips:export',
  exportMontage: 'clips:export-montage',
  cancelClipExport: 'clips:cancel-export',
  snapshotUpdated: 'system:snapshot-updated',
} as const;

export interface SwitchboardApi {
  getSnapshot(): Promise<SystemSnapshot>;
  refreshDevices(): Promise<SystemSnapshot>;
  setModuleState(input: SetModuleStateInput): Promise<SystemSnapshot>;
  setDeviceControl(input: SetDeviceControlInput): Promise<SystemSnapshot>;
  setDeviceSetting(input: SetDeviceSettingInput): Promise<SystemSnapshot>;
  setDeviceAppearanceOverride(input: SetDeviceAppearanceOverrideInput): Promise<SystemSnapshot>;
  setAudioEnabled(enabled: boolean): Promise<SystemSnapshot>;
  setAudioMasterGain(input: SetAudioMasterGainInput): Promise<SystemSnapshot>;
  setAudioMasterEnabled(input: SetAudioMasterEnabledInput): Promise<SystemSnapshot>;
  setAudioBusGain(input: SetAudioBusGainInput): Promise<SystemSnapshot>;
  setAudioBusEnabled(input: SetAudioBusEnabledInput): Promise<SystemSnapshot>;
  setAudioChannelEnabled(input: SetAudioChannelEnabledInput): Promise<SystemSnapshot>;
  setAudioBusDevice(input: SetAudioBusDeviceInput): Promise<SystemSnapshot>;
  setAudioApplicationRoute(input: SetAudioApplicationRouteInput): Promise<SystemSnapshot>;
  applyAudioPreset(input: ApplyAudioPresetInput): Promise<SystemSnapshot>;
  createAudioPreset(input: CreateAudioPresetInput): Promise<SystemSnapshot>;
  renameAudioPreset(input: RenameAudioPresetInput): Promise<SystemSnapshot>;
  duplicateAudioPreset(input: AudioPresetIdInput): Promise<SystemSnapshot>;
  deleteAudioPreset(input: AudioPresetIdInput): Promise<SystemSnapshot>;
  importAudioPreset(): Promise<SystemSnapshot>;
  exportAudioPreset(input: AudioPresetIdInput): Promise<void>;
  setAudioChannelProcessor(input: SetAudioChannelProcessorInput): Promise<SystemSnapshot>;
  setAudioMonitoring(input: SetAudioMonitoringInput): Promise<SystemSnapshot>;
  testMicrophone(): Promise<void>;
  setChatMix(value: number): Promise<SystemSnapshot>;
  setMicProcessor(input: SetMicProcessorInput): Promise<SystemSnapshot>;
  subscribeAudioMeters(listener: (frame: AudioMeterFrame) => void): () => void;
  setCaptureConfig(input: Partial<CaptureConfig>): Promise<SystemSnapshot>;
  saveReplay(): Promise<SystemSnapshot>;
  chooseClipDirectory(): Promise<SystemSnapshot>;
  openClipsDirectory(): Promise<void>;
  refreshCaptureSources(): Promise<SystemSnapshot>;
  scanGames(): Promise<SystemSnapshot>;
  addGame(): Promise<SystemSnapshot>;
  checkAppUpdates(): Promise<SystemSnapshot>;
  downloadAppUpdate(): Promise<SystemSnapshot>;
  installAppUpdate(): Promise<void>;
  updateSettings(input: UpdateSettingsInput): Promise<SystemSnapshot>;
  resetSettings(scope: SettingsResetScope): Promise<SystemSnapshot>;
  handoffFeedbackReport(input: FeedbackReportInput): Promise<FeedbackHandoffResult>;
  revealClip(id: string): Promise<void>;
  deleteClip(id: string): Promise<SystemSnapshot>;
  renameClip(input: RenameClipInput): Promise<SystemSnapshot>;
  setClipFavorite(input: SetClipFavoriteInput): Promise<SystemSnapshot>;
  setClipTrim(input: SetClipTrimInput): Promise<SystemSnapshot>;
  setClipCanvasSize(input: SetClipCanvasSizeInput): Promise<SystemSnapshot>;
  setClipAudioTrackLevel(input: SetClipAudioTrackLevelInput): Promise<SystemSnapshot>;
  loadClipAudioWaveform(id: string): Promise<ClipAudioWaveform>;
  exportClip(input: ExportClipInput): Promise<boolean>;
  exportMontage(input: ExportMontageInput): Promise<boolean>;
  cancelClipExport(exportId: string): Promise<void>;
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

export const setClipCanvasSizeInputSchema = z.object({
  id: z.string().min(1).max(256),
  canvasSize: clipCanvasSizeSchema,
});
export type SetClipCanvasSizeInput = z.infer<typeof setClipCanvasSizeInputSchema>;

export const setClipAudioTrackLevelInputSchema = z.object({
  id: z.string().min(1).max(256),
  trackIndex: z.number().int().min(0).max(7),
  level: z.number().int().min(0).max(100),
});
export type SetClipAudioTrackLevelInput = z.infer<typeof setClipAudioTrackLevelInputSchema>;

const clipTrimInputShape = {
  id: z.string().min(1).max(256),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  audioTrackTrims: clipAudioTrackTrimsSchema.optional(),
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
  exportId: z.string().uuid().optional(),
}).refine((input) => input.endMs > input.startMs, {
  message: 'The trim end must be after the trim start.',
  path: ['endMs'],
});
export type ExportClipInput = z.infer<typeof exportClipInputSchema>;

export const montageProjectSegmentSchema = z.object({
  id: z.string().min(1).max(256),
  clipId: z.string().min(1).max(256),
  sourceDurationMs: z.number().int().positive(),
  trimStartMs: z.number().int().nonnegative(),
  trimEndMs: z.number().int().positive(),
  audioTrackLevels: z.array(z.number().int().min(0).max(100)).max(8).optional(),
  audioTrackTrims: clipAudioTrackTrimsSchema.optional(),
}).superRefine((segment, context) => {
  if (segment.trimEndMs <= segment.trimStartMs) {
    context.addIssue({ code: 'custom', message: 'The segment trim end must be after its start.', path: ['trimEndMs'] });
  }
  if (segment.trimEndMs > segment.sourceDurationMs) {
    context.addIssue({ code: 'custom', message: 'The segment trim exceeds its source duration.', path: ['trimEndMs'] });
  }
  if (segment.trimEndMs - segment.trimStartMs < 100) {
    context.addIssue({ code: 'custom', message: 'Keep at least 0.1 seconds in each montage segment.', path: ['trimEndMs'] });
  }
});
export type MontageProjectSegment = z.infer<typeof montageProjectSegmentSchema>;

export const montageProjectSchema = z.object({
  type: z.literal('montage'),
  id: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(120),
  durationMs: z.number().int().positive(),
  canvasSize: clipCanvasSizeSchema,
  segments: z.array(montageProjectSegmentSchema).min(1).max(500),
}).superRefine((project, context) => {
  const expectedDurationMs = project.segments.reduce((total, segment) => total + segment.trimEndMs - segment.trimStartMs, 0);
  if (project.durationMs !== expectedDurationMs) {
    context.addIssue({ code: 'custom', message: 'The montage duration does not match its segments.', path: ['durationMs'] });
  }
  const clipIds = new Set<string>();
  project.segments.forEach((segment, index) => {
    if (clipIds.has(segment.clipId)) {
      context.addIssue({ code: 'custom', message: 'A clip can appear only once in a montage.', path: ['segments', index, 'clipId'] });
    }
    clipIds.add(segment.clipId);
  });
});
export type MontageProject = z.infer<typeof montageProjectSchema>;

export const exportMontageInputSchema = z.object({
  exportId: z.string().uuid(),
  project: montageProjectSchema,
  preset: clipExportPresetSchema,
});
export type ExportMontageInput = z.infer<typeof exportMontageInputSchema>;
