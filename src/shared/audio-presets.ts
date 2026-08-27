import type {
  AudioPathId,
  AudioPathPreset,
  AudioState,
  ChannelAudioBusId,
  ChannelProcessing,
  EqBand,
  MicProcessor,
} from './contracts';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function bands(prefix: string, values: Array<[number, number, number, EqBand['type']]>): EqBand[] {
  return values.map(([frequency, gainDb, q, type], index) => ({
    id: `${prefix}-${index + 1}`,
    enabled: true,
    type,
    frequency,
    gainDb,
    q,
  }));
}

const FLAT_BANDS = bands('flat', [
  [80, 0, 0.7, 'low-shelf'],
  [180, 0, 1, 'bell'],
  [700, 0, 1, 'bell'],
  [2_500, 0, 1, 'bell'],
  [6_000, 0, 1, 'bell'],
  [10_000, 0, 0.7, 'high-shelf'],
]);

export function createDefaultChannelProcessing(busId: ChannelAudioBusId): ChannelProcessing {
  return {
    busId,
    equalizer: { enabled: true, bands: clone(FLAT_BANDS) },
    normalization: { enabled: false, targetLufs: -18, maxGainDb: 8 },
    compressor: {
      enabled: false,
      thresholdDb: -18,
      ratio: 3,
      attackMs: 15,
      releaseMs: 180,
      makeupDb: 0,
    },
    limiter: { enabled: true, thresholdDb: -1, releaseMs: 90 },
  };
}

export function createNaturalMicrophoneProcessors(): MicProcessor[] {
  return [
    { id: 'gain', label: 'Input gain', enabled: true, cost: 'none', parameters: { gainDb: 0 } },
    {
      id: 'noise-gate',
      label: 'Noise gate',
      enabled: true,
      cost: 'low',
      parameters: { thresholdDb: -48, attackMs: 10, releaseMs: 180 },
    },
    {
      id: 'noise-suppression',
      label: 'Noise suppression',
      enabled: true,
      cost: 'medium',
      parameters: { amount: 45 },
    },
    {
      id: 'equalizer',
      label: 'Parametric EQ',
      enabled: true,
      cost: 'low',
      parameters: {
        bands: bands('mic-natural', [
          [80, -1, 0.7, 'low-shelf'],
          [180, -1.5, 1, 'bell'],
          [500, 0, 1.1, 'bell'],
          [2_800, 2, 1.2, 'bell'],
          [5_500, 1, 1, 'bell'],
          [10_000, 1, 0.7, 'high-shelf'],
        ]),
      },
    },
    {
      id: 'compressor',
      label: 'Compressor',
      enabled: true,
      cost: 'low',
      parameters: { thresholdDb: -18, ratio: 3, attackMs: 12, releaseMs: 180, makeupDb: 2 },
    },
    {
      id: 'limiter',
      label: 'Limiter',
      enabled: true,
      cost: 'low',
      parameters: { thresholdDb: -1, releaseMs: 90 },
    },
  ];
}

function outputPreset(
  kind: ChannelAudioBusId,
  id: string,
  name: string,
  configure: (processing: ChannelProcessing) => void,
): AudioPathPreset {
  const processing = createDefaultChannelProcessing(kind);
  configure(processing);
  const { busId: _busId, ...processors } = processing;
  return { id, name, kind, builtIn: true, schemaVersion: 1, processors } as AudioPathPreset;
}

function microphonePreset(
  id: string,
  name: string,
  configure: (processors: MicProcessor[]) => void,
): AudioPathPreset {
  const processors = createNaturalMicrophoneProcessors();
  configure(processors);
  return {
    id,
    name,
    kind: 'microphone',
    builtIn: true,
    schemaVersion: 1,
    processors,
    monitoring: { enabled: false, level: 0.18, deviceId: '' },
  };
}

function mic<T extends MicProcessor['id']>(processors: MicProcessor[], id: T): Extract<MicProcessor, { id: T }> {
  const processor = processors.find((candidate) => candidate.id === id);
  if (!processor) throw new Error(`Missing microphone processor: ${id}`);
  return processor as Extract<MicProcessor, { id: T }>;
}

export const defaultAudioPathPresets: AudioPathPreset[] = [
  outputPreset('game', 'game-flat', 'Flat', () => undefined),
  outputPreset('game', 'game-competitive-fps', 'Competitive FPS', (processing) => {
    processing.equalizer.bands = bands('game-fps', [
      [80, -3, 0.7, 'low-shelf'], [180, -2, 1, 'bell'], [700, -1, 1.1, 'bell'],
      [2_500, 3.5, 1.1, 'bell'], [5_500, 2.5, 1.2, 'bell'], [10_000, 1, 0.7, 'high-shelf'],
    ]);
    processing.normalization = { enabled: true, targetLufs: -17, maxGainDb: 6 };
    processing.compressor = { enabled: true, thresholdDb: -20, ratio: 2.5, attackMs: 12, releaseMs: 140, makeupDb: 1 };
  }),
  outputPreset('game', 'game-immersive', 'Immersive', (processing) => {
    processing.equalizer.bands = bands('game-immersive', [
      [70, 3, 0.7, 'low-shelf'], [180, 1.5, 1, 'bell'], [700, -0.5, 1, 'bell'],
      [2_500, 1, 1, 'bell'], [6_000, 1.5, 1, 'bell'], [11_000, 2, 0.7, 'high-shelf'],
    ]);
  }),
  outputPreset('chat', 'chat-natural', 'Natural', () => undefined),
  outputPreset('chat', 'chat-clear-voice', 'Clear Voice', (processing) => {
    processing.equalizer.bands = bands('chat-clear', [
      [100, -4, 0.7, 'low-shelf'], [220, -2, 1, 'bell'], [700, -1, 1, 'bell'],
      [2_200, 3, 1.1, 'bell'], [4_500, 2, 1.2, 'bell'], [9_000, 1, 0.7, 'high-shelf'],
    ]);
    processing.normalization = { enabled: true, targetLufs: -19, maxGainDb: 7 };
    processing.compressor = { enabled: true, thresholdDb: -22, ratio: 3, attackMs: 10, releaseMs: 160, makeupDb: 1 };
  }),
  outputPreset('chat', 'chat-reduced-bass', 'Reduced Bass', (processing) => {
    processing.equalizer.bands[0] = { ...processing.equalizer.bands[0]!, gainDb: -5 };
    processing.equalizer.bands[1] = { ...processing.equalizer.bands[1]!, gainDb: -2 };
  }),
  outputPreset('media', 'media-flat', 'Flat', () => undefined),
  outputPreset('media', 'media-music', 'Music', (processing) => {
    processing.equalizer.bands = bands('media-music', [
      [70, 2, 0.7, 'low-shelf'], [180, 0.5, 1, 'bell'], [700, -1, 1, 'bell'],
      [2_500, 1, 1, 'bell'], [6_000, 1.5, 1, 'bell'], [11_000, 2, 0.7, 'high-shelf'],
    ]);
  }),
  outputPreset('media', 'media-movies', 'Movies', (processing) => {
    processing.equalizer.bands = bands('media-movies', [
      [65, 2.5, 0.7, 'low-shelf'], [180, 1, 1, 'bell'], [700, -1.5, 1, 'bell'],
      [2_200, 2.5, 1.1, 'bell'], [5_500, 1, 1, 'bell'], [10_000, 1.5, 0.7, 'high-shelf'],
    ]);
    processing.normalization = { enabled: true, targetLufs: -18, maxGainDb: 5 };
  }),
  microphonePreset('mic-natural-voice', 'Natural Voice', () => undefined),
  microphonePreset('mic-clear-speech', 'Clear Speech', (processors) => {
    mic(processors, 'noise-suppression').parameters.amount = 60;
    mic(processors, 'noise-gate').parameters.thresholdDb = -44;
    mic(processors, 'equalizer').parameters.bands = bands('mic-clear', [
      [90, -3, 0.7, 'low-shelf'], [220, -2, 1, 'bell'], [650, -1, 1, 'bell'],
      [2_800, 3, 1.1, 'bell'], [5_500, 2, 1.2, 'bell'], [10_000, 1, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -20, ratio: 3.5, attackMs: 10, releaseMs: 150, makeupDb: 2.5 };
  }),
  microphonePreset('mic-broadcast', 'Broadcast', (processors) => {
    mic(processors, 'gain').parameters.gainDb = 1.5;
    mic(processors, 'noise-suppression').parameters.amount = 50;
    mic(processors, 'equalizer').parameters.bands = bands('mic-broadcast', [
      [75, 1.5, 0.7, 'low-shelf'], [180, 1, 1, 'bell'], [450, -2, 1.1, 'bell'],
      [2_400, 2.5, 1.1, 'bell'], [5_000, 1.5, 1, 'bell'], [10_000, 2, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -22, ratio: 4, attackMs: 8, releaseMs: 130, makeupDb: 3 };
  }),
  microphonePreset('mic-studio', 'Studio', (processors) => {
    mic(processors, 'noise-suppression').parameters.amount = 20;
    mic(processors, 'noise-gate').parameters.thresholdDb = -56;
    mic(processors, 'compressor').parameters = { thresholdDb: -16, ratio: 2.2, attackMs: 18, releaseMs: 220, makeupDb: 1 };
  }),
];

export function snapshotAudioPathPreset(
  audio: AudioState,
  kind: AudioPathId,
  id: string,
  name: string,
): AudioPathPreset {
  if (kind === 'microphone') {
    return {
      id,
      name,
      kind,
      builtIn: false,
      schemaVersion: 1,
      processors: clone(audio.micProcessors),
      monitoring: {
        enabled: audio.monitoringEnabled,
        level: audio.monitoring,
        deviceId: audio.monitoringDeviceId,
      },
    };
  }

  const processing = audio.channelProcessing.find((candidate) => candidate.busId === kind)
    ?? createDefaultChannelProcessing(kind);
  const { busId: _busId, ...processors } = clone(processing);
  return { id, name, kind, builtIn: false, schemaVersion: 1, processors } as AudioPathPreset;
}

export function applyAudioPathPreset(audio: AudioState, preset: AudioPathPreset): void {
  if (preset.kind === 'microphone') {
    const currentMonitoringDeviceId = audio.monitoringDeviceId;
    audio.micProcessors = clone(preset.processors);
    audio.monitoring = preset.monitoring.level;
    const monitoringDevice = audio.devices.find((device) => (
      device.id === preset.monitoring.deviceId
      && device.direction === 'output'
      && device.available
      && !device.isSwitchboard
    )) ?? audio.devices.find((device) => (
      device.id === currentMonitoringDeviceId
      && device.direction === 'output'
      && device.available
      && !device.isSwitchboard
    )) ?? audio.devices.find((device) => (
      device.direction === 'output'
      && device.available
      && device.isDefault
      && !device.isSwitchboard
    ));
    audio.monitoringDeviceId = monitoringDevice?.id ?? '';
    audio.monitoringEnabled = preset.monitoring.enabled && Boolean(monitoringDevice);
    audio.activePresetIds.microphone = audio.monitoringEnabled === preset.monitoring.enabled
      && audio.monitoringDeviceId === preset.monitoring.deviceId
      ? preset.id
      : null;
    return;
  }

  const next = { busId: preset.kind, ...clone(preset.processors) } as ChannelProcessing;
  const index = audio.channelProcessing.findIndex((candidate) => candidate.busId === preset.kind);
  if (index >= 0) audio.channelProcessing[index] = next;
  else audio.channelProcessing.push(next);
  audio.activePresetIds[preset.kind] = preset.id;
}

export function findMatchingAudioPresetId(audio: AudioState, kind: AudioPathId): string | null {
  const current = snapshotAudioPathPreset(audio, kind, 'current', 'Current');
  for (const preset of audio.pathPresets) {
    if (preset.kind !== kind) continue;
    const candidate = { ...preset, id: 'current', name: 'Current', builtIn: false };
    if (JSON.stringify(candidate) === JSON.stringify(current)) return preset.id;
  }
  return null;
}
