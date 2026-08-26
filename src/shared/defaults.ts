import type {
  AppSettings,
  AudioState,
  CaptureConfig,
  CaptureRuntime,
  Clip,
  Device,
  EngineStatus,
  ModuleManifest,
  PerformanceSnapshot,
  SystemSnapshot,
} from './contracts';

const now = () => new Date().toISOString();

export const defaultModules: ModuleManifest[] = [
  {
    id: 'device.hyperx-quadcast',
    name: 'HyperX QuadCast',
    description: 'QuadCast, QuadCast S, and QuadCast 2 controls through one capability module.',
    version: '0.1.0',
    kind: 'device',
    sizeMb: 1.2,
    installed: true,
    enabled: true,
    official: true,
    restartRequired: false,
    capabilities: ['microphone', 'gain', 'monitoring', 'lighting', 'firmware'],
    vendors: ['0951'],
  },
  {
    id: 'device.logitech-hidpp',
    name: 'Logitech HID++',
    description: 'Self-describing Logitech mouse and keyboard support without one package per model.',
    version: '0.1.0',
    kind: 'device',
    sizeMb: 1.8,
    installed: true,
    enabled: true,
    official: true,
    restartRequired: false,
    capabilities: ['mouse', 'dpi', 'polling-rate', 'buttons', 'battery', 'profiles'],
    vendors: ['046d'],
  },
  {
    id: 'capability.replay',
    name: 'Instant Replay',
    description: 'Isolated capture process with a disk-backed rolling buffer and hardware encoder selection.',
    version: '0.1.0',
    kind: 'capture',
    sizeMb: 84,
    installed: true,
    enabled: false,
    official: true,
    restartRequired: false,
    capabilities: ['display-capture', 'window-capture', 'replay-buffer', 'clips'],
    vendors: [],
  },
  {
    id: 'capability.audio-router',
    name: 'Audio Router',
    description: 'Game, chat, media, and aux buses with independent personal, stream, and clip mixes.',
    version: '0.1.0',
    kind: 'audio',
    sizeMb: 11.6,
    installed: true,
    enabled: false,
    official: true,
    restartRequired: false,
    capabilities: ['audio-buses', 'chatmix', 'microphone-dsp', 'stream-mix'],
    vendors: [],
  },
  {
    id: 'device.steelseries-hid',
    name: 'SteelSeries Devices',
    description: 'Optional SteelSeries HID support without installing the GG suite.',
    version: '0.0.1',
    kind: 'device',
    sizeMb: 2.4,
    installed: false,
    enabled: false,
    official: true,
    restartRequired: false,
    capabilities: ['mouse', 'keyboard', 'headset', 'lighting'],
    vendors: ['1038'],
  },
  {
    id: 'integration.obs',
    name: 'OBS Integration',
    description: 'Expose clip, stream mix, and scene actions through OBS WebSocket.',
    version: '0.0.1',
    kind: 'integration',
    sizeMb: 0.7,
    installed: false,
    enabled: false,
    official: false,
    restartRequired: false,
    capabilities: ['obs-websocket', 'scene-actions'],
    vendors: [],
  },
];

export const defaultDevices: Device[] = [
  {
    id: 'logitech-g502x-plus-1',
    moduleId: 'device.logitech-hidpp',
    name: 'G502 X Plus',
    vendor: 'Logitech',
    kind: 'mouse',
    connected: true,
    batteryPercent: 82,
    connection: 'wireless',
    imageKey: 'mouse-g502x',
    capabilities: ['dpi', 'polling-rate', 'buttons', 'battery', 'profiles'],
    settings: {
      dpiStages: [800, 1600, 3200],
      activeDpi: 1600,
      pollingRate: 1000,
      onboardMemory: true,
      lightingEnabled: false,
    },
  },
  {
    id: 'hyperx-quadcast2-1',
    moduleId: 'device.hyperx-quadcast',
    name: 'QuadCast 2',
    vendor: 'HyperX',
    kind: 'microphone',
    connected: true,
    connection: 'usb',
    imageKey: 'mic-quadcast2',
    capabilities: ['gain', 'monitoring', 'mute', 'lighting'],
    settings: {
      gain: 58,
      monitoring: 18,
      muteLed: true,
      lightingEnabled: true,
      lightingColor: '#ff4f7d',
    },
  },
];

export const defaultAudio: AudioState = {
  enabled: false,
  outputDevice: 'Arctis Nova Pro Wireless',
  microphoneDevice: 'HyperX QuadCast 2',
  sampleRate: 48000,
  chatMix: 0.15,
  monitoring: 0.18,
  buses: [
    { id: 'game', label: 'Game', appCount: 1, gain: 1, muted: false, meter: 0.72, endpoint: 'Switchboard Game' },
    { id: 'chat', label: 'Chat', appCount: 1, gain: 0.76, muted: false, meter: 0.38, endpoint: 'Switchboard Chat' },
    { id: 'media', label: 'Media', appCount: 2, gain: 0.42, muted: false, meter: 0.21, endpoint: 'Switchboard Media' },
    { id: 'aux', label: 'Aux', appCount: 0, gain: 0.9, muted: false, meter: 0.08, endpoint: 'Switchboard Aux' },
  ],
  micProcessors: [
    { id: 'gain', label: 'Input gain', enabled: true, cost: 'none' },
    { id: 'noise-gate', label: 'Noise gate', enabled: true, cost: 'low' },
    { id: 'noise-suppression', label: 'Noise suppression', enabled: true, cost: 'medium' },
    { id: 'equalizer', label: 'Parametric EQ', enabled: true, cost: 'low' },
    { id: 'compressor', label: 'Compressor', enabled: true, cost: 'low' },
    { id: 'limiter', label: 'Limiter', enabled: true, cost: 'low' },
  ],
};

export const defaultCaptureConfig: CaptureConfig = {
  enabled: false,
  source: 'game',
  displayIndex: 0,
  fps: 60,
  resolution: '1440p',
  codec: 'av1',
  encoder: 'auto',
  quality: 4,
  replaySeconds: 60,
  includeMic: true,
  includeChat: true,
  includeCursor: false,
  hotkey: 'Ctrl+Shift+F10',
};

export const defaultCaptureRuntime: CaptureRuntime = {
  bufferedSeconds: 0,
  segmentCount: 0,
  estimatedDiskMb: 0,
  encoderLabel: 'NVIDIA NVENC AV1',
  droppedFrames: 0,
};

export const defaultSettings: AppSettings = {
  launchAtStartup: false,
  closeToTray: true,
  destroyRendererInTray: true,
  automaticModuleUpdates: true,
  performanceGuard: true,
  diagnosticsRetentionDays: 7,
  telemetry: false,
};

export const stoppedEngines: EngineStatus[] = [
  {
    kind: 'audio',
    state: 'stopped',
    cpuPercent: 0,
    memoryMb: 0,
    uptimeSeconds: 0,
    updatedAt: now(),
  },
  {
    kind: 'capture',
    state: 'stopped',
    cpuPercent: 0,
    memoryMb: 0,
    uptimeSeconds: 0,
    updatedAt: now(),
  },
];

export const defaultPerformance: PerformanceSnapshot = {
  coreMemoryMb: 44,
  rendererMemoryMb: 92,
  totalMemoryMb: 136,
  totalCpuPercent: 0.3,
  activeProcesses: 2,
  budgetMemoryMb: 240,
  budgetCpuPercent: 2,
};

export const seedClips: Clip[] = [
  {
    id: 'clip-demo-1',
    name: 'War Thunder · clean pass',
    game: 'War Thunder',
    durationSeconds: 45,
    sizeMb: 126,
    createdAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    path: 'C:\\Users\\Manuel\\Videos\\Switchboard Clips\\WarThunder_demo.mp4',
    prototype: true,
  },
  {
    id: 'clip-demo-2',
    name: 'FiveM · pursuit ending',
    game: 'FiveM',
    durationSeconds: 60,
    sizeMb: 178,
    createdAt: new Date(Date.now() - 3.2 * 60 * 60_000).toISOString(),
    path: 'C:\\Users\\Manuel\\Videos\\Switchboard Clips\\FiveM_demo.mp4',
    prototype: true,
  },
];

export function createDefaultSnapshot(): SystemSnapshot {
  return {
    version: '0.1.0',
    prototypeMode: true,
    modules: structuredClone(defaultModules),
    devices: structuredClone(defaultDevices),
    engines: structuredClone(stoppedEngines),
    audio: structuredClone(defaultAudio),
    capture: {
      config: structuredClone(defaultCaptureConfig),
      runtime: structuredClone(defaultCaptureRuntime),
    },
    clips: structuredClone(seedClips),
    performance: structuredClone(defaultPerformance),
    settings: structuredClone(defaultSettings),
  };
}
