import { z } from 'zod';

export const pageIdSchema = z.enum([
  'overview',
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

export const deviceSettingValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.number()),
  z.array(z.string()),
]);
export type DeviceSettingValue = z.infer<typeof deviceSettingValueSchema>;

export const deviceSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  name: z.string(),
  vendor: z.string(),
  kind: deviceKindSchema,
  connected: z.boolean(),
  batteryPercent: z.number().min(0).max(100).optional(),
  connection: z.enum(['usb', 'wireless', 'bluetooth']).optional(),
  imageKey: z.string(),
  capabilities: z.array(z.string()),
  settings: z.record(z.string(), deviceSettingValueSchema),
});
export type Device = z.infer<typeof deviceSchema>;

export const audioBusIdSchema = z.enum(['game', 'chat', 'media', 'aux']);
export type AudioBusId = z.infer<typeof audioBusIdSchema>;

export const audioBusSchema = z.object({
  id: audioBusIdSchema,
  label: z.string(),
  appCount: z.number().int().min(0),
  gain: z.number().min(0).max(1.5),
  muted: z.boolean(),
  meter: z.number().min(0).max(1),
  endpoint: z.string(),
});
export type AudioBus = z.infer<typeof audioBusSchema>;

export const micProcessorIdSchema = z.enum([
  'gain',
  'noise-gate',
  'noise-suppression',
  'equalizer',
  'compressor',
  'limiter',
]);
export type MicProcessorId = z.infer<typeof micProcessorIdSchema>;

export const micProcessorSchema = z.object({
  id: micProcessorIdSchema,
  label: z.string(),
  enabled: z.boolean(),
  cost: z.enum(['none', 'low', 'medium']),
});
export type MicProcessor = z.infer<typeof micProcessorSchema>;

export const audioStateSchema = z.object({
  enabled: z.boolean(),
  outputDevice: z.string(),
  microphoneDevice: z.string(),
  sampleRate: z.literal(48000),
  chatMix: z.number().min(-1).max(1),
  monitoring: z.number().min(0).max(1),
  buses: z.array(audioBusSchema),
  micProcessors: z.array(micProcessorSchema),
});
export type AudioState = z.infer<typeof audioStateSchema>;

export const captureConfigSchema = z.object({
  enabled: z.boolean(),
  source: z.enum(['display', 'window', 'game']),
  displayIndex: z.number().int().min(0),
  fps: z.union([z.literal(30), z.literal(60), z.literal(120)]),
  resolution: z.enum(['1080p', '1440p', 'native']),
  codec: z.enum(['h264', 'hevc', 'av1']),
  encoder: z.enum(['auto', 'nvenc', 'amf', 'qsv', 'software']),
  quality: z.number().int().min(1).max(5),
  replaySeconds: z.number().int().min(15).max(300),
  includeMic: z.boolean(),
  includeChat: z.boolean(),
  includeCursor: z.boolean(),
  hotkey: z.string(),
});
export type CaptureConfig = z.infer<typeof captureConfigSchema>;

export const captureRuntimeSchema = z.object({
  bufferedSeconds: z.number().min(0),
  segmentCount: z.number().int().min(0),
  estimatedDiskMb: z.number().min(0),
  encoderLabel: z.string(),
  droppedFrames: z.number().int().min(0),
  lastSavedAt: z.string().optional(),
});
export type CaptureRuntime = z.infer<typeof captureRuntimeSchema>;

export const clipSchema = z.object({
  id: z.string(),
  name: z.string(),
  game: z.string(),
  durationSeconds: z.number().min(0),
  sizeMb: z.number().min(0),
  createdAt: z.string(),
  path: z.string(),
  prototype: z.boolean(),
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

export const setAudioBusGainInputSchema = z.object({
  busId: audioBusIdSchema,
  gain: z.number().min(0).max(1.5),
});
export type SetAudioBusGainInput = z.infer<typeof setAudioBusGainInputSchema>;

export const setMicProcessorInputSchema = z.object({
  processorId: micProcessorIdSchema,
  enabled: z.boolean(),
});
export type SetMicProcessorInput = z.infer<typeof setMicProcessorInputSchema>;

export const updateSettingsInputSchema = appSettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

export const ipcChannels = {
  getSnapshot: 'system:get-snapshot',
  setModuleState: 'modules:set-state',
  setDeviceSetting: 'devices:set-setting',
  setAudioEnabled: 'audio:set-enabled',
  setAudioBusGain: 'audio:set-bus-gain',
  setChatMix: 'audio:set-chat-mix',
  setMicProcessor: 'audio:set-mic-processor',
  setCaptureConfig: 'capture:set-config',
  saveReplay: 'capture:save-replay',
  updateSettings: 'settings:update',
  revealClip: 'clips:reveal',
  snapshotUpdated: 'system:snapshot-updated',
} as const;

export interface SwitchboardApi {
  getSnapshot(): Promise<SystemSnapshot>;
  setModuleState(input: SetModuleStateInput): Promise<SystemSnapshot>;
  setDeviceSetting(input: SetDeviceSettingInput): Promise<SystemSnapshot>;
  setAudioEnabled(enabled: boolean): Promise<SystemSnapshot>;
  setAudioBusGain(input: SetAudioBusGainInput): Promise<SystemSnapshot>;
  setChatMix(value: number): Promise<SystemSnapshot>;
  setMicProcessor(input: SetMicProcessorInput): Promise<SystemSnapshot>;
  setCaptureConfig(input: Partial<CaptureConfig>): Promise<SystemSnapshot>;
  saveReplay(): Promise<SystemSnapshot>;
  updateSettings(input: UpdateSettingsInput): Promise<SystemSnapshot>;
  revealClip(path: string): Promise<void>;
  subscribe(listener: (snapshot: SystemSnapshot) => void): () => void;
}
