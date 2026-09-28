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
  [32, 0, 0.7, 'low-shelf'],
  [64, 0, 1, 'bell'],
  [125, 0, 1, 'bell'],
  [250, 0, 1, 'bell'],
  [500, 0, 1, 'bell'],
  [1_000, 0, 1, 'bell'],
  [2_000, 0, 1, 'bell'],
  [4_000, 0, 1, 'bell'],
  [8_000, 0, 1, 'bell'],
  [16_000, 0, 0.7, 'high-shelf'],
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
  // Preserve the source voice by default. Cleanup is a room-dependent choice,
  // not a prerequisite for tone. See docs/microphone-preset-tuning.md for the
  // reference curve, research, and measured response limits. Neutral editor
  // points cost no native filter passes; shelves are not high-pass filters.
  return [
    { id: 'gain', label: 'Input gain', enabled: true, cost: 'none', parameters: { gainDb: 0 } },
    {
      id: 'noise-gate',
      label: 'Noise gate',
      enabled: false,
      cost: 'low',
      parameters: { thresholdDb: -60, attackMs: 2, releaseMs: 300 },
    },
    {
      id: 'noise-suppression',
      label: 'Noise suppression',
      enabled: false,
      cost: 'medium',
      parameters: { amount: 20 },
    },
    {
      id: 'equalizer',
      label: 'Parametric EQ',
      enabled: true,
      cost: 'low',
      parameters: {
        bands: bands('mic-natural', [
          [50, -3, 0.7, 'low-shelf'], [125, 0, 0.8, 'bell'],
          [250, 0, 1, 'bell'], [500, 0, 1, 'bell'],
          [1_000, 0, 1, 'bell'], [2_000, 0, 1, 'bell'],
          [3_500, 0, 1, 'bell'], [5_000, 0, 1, 'bell'],
          [8_000, 0, 1, 'bell'], [12_000, 0, 0.7, 'high-shelf'],
        ]),
      },
    },
    {
      id: 'compressor',
      label: 'Compressor',
      enabled: true,
      cost: 'low',
      parameters: { thresholdDb: -16, ratio: 1.5, attackMs: 25, releaseMs: 250, makeupDb: 0 },
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
      [45, -5, 0.7, 'low-shelf'], [90, -3, 1, 'bell'], [180, -2, 1, 'bell'],
      [350, -1.5, 1.1, 'bell'], [750, -0.5, 1.2, 'bell'], [1_500, 1, 1, 'bell'],
      [2_500, 2.5, 1.1, 'bell'], [4_000, 1.5, 1.2, 'bell'],
      [6_500, -1.5, 1.8, 'bell'], [12_000, 0.5, 0.7, 'high-shelf'],
    ]);
    processing.normalization = { enabled: true, targetLufs: -20, maxGainDb: 3 };
    processing.compressor = { enabled: true, thresholdDb: -20, ratio: 1.8, attackMs: 18, releaseMs: 200, makeupDb: 0 };
  }),
  outputPreset('game', 'game-immersive', 'Immersive', (processing) => {
    processing.equalizer.bands = bands('game-immersive', [
      [45, 2.5, 0.7, 'low-shelf'], [100, 1.5, 0.9, 'bell'], [220, -0.5, 1, 'bell'],
      [400, -1, 1.1, 'bell'], [800, -0.5, 1.1, 'bell'], [1_600, 0.5, 1, 'bell'],
      [2_800, 1, 1.1, 'bell'], [4_500, -0.5, 1.3, 'bell'],
      [7_500, -1, 1.8, 'bell'], [14_000, 1.5, 0.7, 'high-shelf'],
    ]);
  }),
  outputPreset('game', 'game-night', 'Night play', (processing) => {
    processing.equalizer.bands = bands('game-night', [
      [90, -5, 0.7, 'low-shelf'], [180, -2, 1, 'bell'], [350, -1, 1.1, 'bell'],
      [800, 0.5, 1, 'bell'], [1_800, 1, 1, 'bell'], [2_800, 1.5, 1.1, 'bell'],
      [4_500, -0.5, 1.3, 'bell'], [6_500, -1.5, 1.8, 'bell'], [11_000, -2, 0.7, 'high-shelf'],
    ]);
    processing.compressor = { enabled: true, thresholdDb: -26, ratio: 4, attackMs: 5, releaseMs: 260, makeupDb: 0 };
    processing.limiter = { enabled: true, thresholdDb: -4, releaseMs: 150 };
  }),
  outputPreset('chat', 'chat-natural', 'Natural', () => undefined),
  outputPreset('chat', 'chat-clear-voice', 'Clear Voice', (processing) => {
    processing.equalizer.bands = bands('chat-clear', [
      [85, -6, 0.7, 'low-shelf'], [180, -2, 1, 'bell'], [350, -1.5, 1.1, 'bell'],
      [700, -0.5, 1.2, 'bell'], [1_500, 1, 1, 'bell'], [2_500, 2, 1.1, 'bell'],
      [4_200, 0.5, 1.2, 'bell'], [7_000, -2, 2, 'bell'], [12_000, -1, 0.7, 'high-shelf'],
    ]);
    processing.normalization = { enabled: true, targetLufs: -20, maxGainDb: 4 };
    processing.compressor = { enabled: true, thresholdDb: -22, ratio: 2.5, attackMs: 12, releaseMs: 220, makeupDb: 0 };
  }),
  outputPreset('chat', 'chat-reduced-bass', 'Reduced Bass', (processing) => {
    processing.equalizer.bands = bands('chat-reduced', [
      [110, -6, 0.7, 'low-shelf'], [220, -2.5, 1, 'bell'], [400, -1, 1.1, 'bell'],
      [900, -0.5, 1.2, 'bell'], [1_800, 0.25, 1, 'bell'], [3_000, 0.5, 1.1, 'bell'],
      [7_000, -0.75, 2, 'bell'], [12_000, -0.5, 0.7, 'high-shelf'],
    ]);
  }),
  outputPreset('media', 'media-flat', 'Flat', () => undefined),
  outputPreset('media', 'media-music', 'Music', (processing) => {
    processing.equalizer.bands = bands('media-music', [
      [40, 1.5, 0.7, 'low-shelf'], [90, 1, 0.9, 'bell'], [200, -0.5, 1, 'bell'],
      [400, -0.75, 1.1, 'bell'], [900, -0.25, 1.1, 'bell'], [1_800, 0.5, 1, 'bell'],
      [3_000, 0.75, 1.1, 'bell'], [4_800, -0.5, 1.3, 'bell'],
      [7_500, -0.75, 1.8, 'bell'], [14_000, 1.25, 0.7, 'high-shelf'],
    ]);
  }),
  outputPreset('media', 'media-movies', 'Movies', (processing) => {
    processing.equalizer.bands = bands('media-movies', [
      [45, 2, 0.7, 'low-shelf'], [100, 1, 1, 'bell'], [220, -1, 1, 'bell'],
      [450, -1.5, 1.1, 'bell'], [900, -0.5, 1.1, 'bell'], [1_800, 1, 1, 'bell'],
      [2_800, 1.5, 1.1, 'bell'], [4_500, 0.5, 1.2, 'bell'],
      [7_000, -1.5, 1.8, 'bell'], [13_000, 1, 0.7, 'high-shelf'],
    ]);
    processing.normalization = { enabled: true, targetLufs: -21, maxGainDb: 3 };
  }),
  outputPreset('media', 'media-warm', 'Warm', (processing) => {
    processing.equalizer.bands = bands('media-warm', [
      [60, 1, 0.7, 'low-shelf'], [140, 1.5, 0.9, 'bell'], [300, -0.75, 1.1, 'bell'],
      [700, -0.25, 1.1, 'bell'], [1_600, 0.25, 1, 'bell'], [3_500, -1.25, 1.2, 'bell'],
      [6_500, -1.5, 1.8, 'bell'], [11_000, -1.5, 0.7, 'high-shelf'],
    ]);
  }),
  outputPreset('media', 'media-dialogue', 'Dialogue', (processing) => {
    processing.equalizer.bands = bands('media-dialogue', [
      [85, -4, 0.7, 'low-shelf'], [180, -1, 1, 'bell'], [350, -1.5, 1.1, 'bell'],
      [700, -0.5, 1.2, 'bell'], [1_500, 1, 1, 'bell'], [2_500, 2, 1.1, 'bell'],
      [4_000, 0.5, 1.2, 'bell'], [7_000, -1.5, 2, 'bell'], [12_000, -0.5, 0.7, 'high-shelf'],
    ]);
    processing.compressor = { enabled: true, thresholdDb: -22, ratio: 2.2, attackMs: 15, releaseMs: 240, makeupDb: 0 };
  }),
  microphonePreset('mic-natural-voice', 'Natural Voice', () => undefined),
  microphonePreset('mic-clear-speech', 'Clear Speech', (processors) => {
    mic(processors, 'equalizer').parameters.bands = bands('mic-clear', [
      [60, -3, 0.7, 'low-shelf'], [125, 0, 0.8, 'bell'], [250, -0.5, 1, 'bell'],
      [500, -0.75, 0.9, 'bell'], [1_000, 0, 1, 'bell'], [2_000, 0.5, 0.8, 'bell'],
      [3_200, 1.25, 0.9, 'bell'], [5_000, 0, 1, 'bell'],
      [7_500, -0.5, 1.2, 'bell'], [12_000, 0, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -18, ratio: 1.8, attackMs: 20, releaseMs: 240, makeupDb: 0.5 };
  }),
  // Approximate the supplied Sonar Deep Voice response, not its undisclosed
  // filter parameters or ClearCast model. No pitch shifting or presence boost.
  microphonePreset('mic-deep-voice', 'Deep Voice', (processors) => {
    mic(processors, 'noise-suppression').enabled = true;
    mic(processors, 'noise-suppression').parameters.amount = 25;
    mic(processors, 'noise-gate').enabled = true;
    mic(processors, 'equalizer').parameters.bands = bands('mic-deep', [
      [40, -12, 0.7, 'low-shelf'], [65, -3, 1, 'bell'], [150, 4.5, 0.8, 'bell'],
      [250, 1.5, 1, 'bell'], [500, 0, 1, 'bell'], [1_100, -3.5, 0.8, 'bell'],
      [2_000, -0.5, 1, 'bell'], [4_000, 0, 1, 'bell'],
      [8_000, 0, 1, 'bell'], [16_000, 0, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -18, ratio: 2, attackMs: 25, releaseMs: 280, makeupDb: 0 };
  }),
  microphonePreset('mic-warm-smooth', 'Warm & Smooth', (processors) => {
    mic(processors, 'equalizer').parameters.bands = bands('mic-warm', [
      [45, -3, 0.7, 'low-shelf'], [160, 1.5, 0.7, 'bell'], [300, 0, 1, 'bell'],
      [600, 0, 1, 'bell'], [1_000, -0.5, 0.8, 'bell'], [2_000, 0, 1, 'bell'],
      [3_500, -1.5, 0.8, 'bell'], [5_000, 0, 1, 'bell'],
      [7_000, -1, 1, 'bell'], [12_000, -0.5, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -17, ratio: 1.7, attackMs: 25, releaseMs: 280, makeupDb: 0 };
  }),
  microphonePreset('mic-podcast', 'Podcast', (processors) => {
    mic(processors, 'equalizer').parameters.bands = bands('mic-podcast', [
      [50, -4, 0.7, 'low-shelf'], [150, 1, 0.8, 'bell'], [300, 0, 1, 'bell'],
      [500, -0.75, 1, 'bell'], [1_000, 0, 1, 'bell'], [2_000, 0, 1, 'bell'],
      [3_000, 0.75, 0.9, 'bell'], [5_000, 0, 1, 'bell'],
      [7_000, -0.75, 1.2, 'bell'], [12_000, 0, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -20, ratio: 2, attackMs: 25, releaseMs: 300, makeupDb: 1 };
  }),
  microphonePreset('mic-broadcast', 'Broadcast', (processors) => {
    mic(processors, 'noise-suppression').enabled = true;
    mic(processors, 'noise-suppression').parameters.amount = 20;
    mic(processors, 'equalizer').parameters.bands = bands('mic-broadcast', [
      [50, -5, 0.7, 'low-shelf'], [150, 2, 0.8, 'bell'], [300, 0, 1, 'bell'],
      [600, -0.75, 1, 'bell'], [1_000, 0, 1, 'bell'], [2_000, 0, 1, 'bell'],
      [3_000, 1, 0.9, 'bell'], [5_000, 0, 1, 'bell'],
      [7_000, -1, 1.2, 'bell'], [12_000, 0, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -21, ratio: 2.5, attackMs: 20, releaseMs: 280, makeupDb: 1 };
  }),
  microphonePreset('mic-crisp', 'Crisp', (processors) => {
    mic(processors, 'equalizer').parameters.bands = bands('mic-crisp', [
      [55, -3, 0.7, 'low-shelf'], [125, 0, 0.8, 'bell'], [250, 0, 1, 'bell'],
      [500, -0.5, 1, 'bell'], [1_000, 0, 1, 'bell'], [2_000, 0, 1, 'bell'],
      [3_500, 1.5, 0.8, 'bell'], [5_000, 0, 1, 'bell'],
      [7_500, -0.75, 1.5, 'bell'], [12_000, 1, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -17, ratio: 1.6, attackMs: 20, releaseMs: 240, makeupDb: 0 };
  }),
  microphonePreset('mic-streamer', 'Streamer', (processors) => {
    mic(processors, 'noise-suppression').enabled = true;
    mic(processors, 'noise-suppression').parameters.amount = 45;
    mic(processors, 'noise-gate').enabled = true;
    mic(processors, 'noise-gate').parameters = { thresholdDb: -56, attackMs: 2, releaseMs: 280 };
    mic(processors, 'equalizer').parameters.bands = bands('mic-streamer', [
      [60, -4, 0.7, 'low-shelf'], [150, 0.75, 0.8, 'bell'], [300, 0, 1, 'bell'],
      [600, -0.5, 1, 'bell'], [1_000, 0, 1, 'bell'], [2_000, 0, 1, 'bell'],
      [3_000, 1, 0.9, 'bell'], [5_000, 0, 1, 'bell'],
      [7_000, -0.75, 1.2, 'bell'], [12_000, 0, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -20, ratio: 2.2, attackMs: 20, releaseMs: 260, makeupDb: 1 };
  }),
  microphonePreset('mic-noisy-room', 'Noisy Room', (processors) => {
    mic(processors, 'noise-suppression').enabled = true;
    mic(processors, 'noise-suppression').parameters.amount = 65;
    mic(processors, 'noise-gate').enabled = true;
    mic(processors, 'noise-gate').parameters = { thresholdDb: -54, attackMs: 2, releaseMs: 260 };
    mic(processors, 'equalizer').parameters.bands = bands('mic-noisy', [
      [65, -5, 0.7, 'low-shelf'], [150, 0.5, 0.8, 'bell'], [300, 0, 1, 'bell'],
      [600, -0.5, 1, 'bell'], [1_000, 0, 1, 'bell'], [2_000, 0, 1, 'bell'],
      [3_000, 0.5, 0.9, 'bell'], [5_000, 0, 1, 'bell'],
      [7_000, -0.5, 1.2, 'bell'], [12_000, 0, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').parameters = { thresholdDb: -18, ratio: 1.8, attackMs: 25, releaseMs: 280, makeupDb: 0 };
  }),
  microphonePreset('mic-studio', 'Studio', (processors) => {
    // Clean recording reference: no learned masking, gating, EQ or leveling.
    // Keep the editable flat curve and the -1 dBFS emergency peak ceiling.
    mic(processors, 'equalizer').parameters.bands = bands('mic-studio', [
      [32, 0, 0.7, 'low-shelf'], [64, 0, 1, 'bell'], [125, 0, 1, 'bell'],
      [250, 0, 1, 'bell'], [500, 0, 1, 'bell'], [1_000, 0, 1, 'bell'],
      [2_000, 0, 1, 'bell'], [4_000, 0, 1, 'bell'],
      [8_000, 0, 1, 'bell'], [16_000, 0, 0.7, 'high-shelf'],
    ]);
    mic(processors, 'compressor').enabled = false;
  }),
];

export const audioPresetDescriptions: Record<string, string> = {
  'game-flat': 'Uncolored EQ with peak limiting.',
  'game-competitive-fps': 'Less bass masking, focused upper-mid detail and modest leveling. No positional enhancement.',
  'game-immersive': 'Fuller sub-bass, clearer mids and softened sharp highs. Original dynamics preserved.',
  'game-night': 'Reduced bass and treble with firmer compression and a lower peak ceiling.',
  'chat-natural': 'Uncolored voices with peak limiting.',
  'chat-clear-voice': 'Less low-mid buildup, speech presence and softer sharp highs, with restrained voice leveling.',
  'chat-reduced-bass': 'Reduces boomy voices and rumble with light treble smoothing. No compression or leveling.',
  'media-flat': 'Uncolored EQ with peak limiting.',
  'media-music': 'Gentle bass and air, cleaner low mids and softer sharp highs. Original dynamics preserved.',
  'media-movies': 'Low-end weight and dialogue presence with modest volume leveling.',
  'media-warm': 'Fuller body with softer upper mids and treble. No compression or leveling.',
  'media-dialogue': 'Less bass masking and clearer speech with gentle compression and softened sharp highs.',
  'mic-natural-voice': 'Near-neutral voice with gentle rumble reduction and light peak leveling. Noise cleanup off.',
  'mic-clear-speech': 'A little more word definition without scooping out voice body. Noise cleanup off.',
  'mic-deep-voice': 'Sonar-inspired warmth and a broad midrange dip, with light cleanup. Tone only; no pitch shift.',
  'mic-warm-smooth': 'Fuller low mids and softer upper frequencies for a bright or thin microphone. Noise cleanup off.',
  'mic-podcast': 'Mild warmth and relaxed compression for a quiet recording space. Gate and suppression off.',
  'mic-broadcast': 'Fuller voice with moderate leveling and light suppression. No added air boost.',
  'mic-crisp': 'Gentle presence and air for a dull microphone, with voice body preserved. Noise cleanup off.',
  'mic-streamer': 'Moderate cleanup and leveling with a gentle gate. Adjust the gate for your voice and room.',
  'mic-noisy-room': 'Stronger cleanup with restrained EQ and no makeup gain. May change voice texture; tune the gate.',
  'mic-studio': 'Flat recording reference. Gate, suppression and compression off; peak protection stays on.',
};

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
    // A voice preset is the processing chain. Monitoring (on/off, output, volume) is a listening
    // preference: it stays exactly as the user set it when presets change. The preset's stored
    // monitoring block is kept for file compatibility and ignored here.
    audio.micProcessors = clone(preset.processors);
    audio.activePresetIds.microphone = preset.id;
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
  // Band IDs identify editor nodes, not the sound. Imported/recreated nodes may
  // have different IDs while preserving all processor values and their order.
  // Monitoring is not part of a preset's sound, so it never affects matching.
  // Schema parsing and JSON imports can reorder object fields. Sort object keys
  // while preserving processor/band array order so persistence cannot turn an
  // unchanged sound into Custom. Processor IDs remain part of the comparison.
  const soundKey = (preset: AudioPathPreset) => JSON.stringify(preset, (key, value) => {
    if (key === 'monitoring') return undefined;
    if (key === 'bands' && Array.isArray(value)) return value.map(({ id: _id, ...band }) => band);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
  for (const preset of audio.pathPresets) {
    if (preset.kind !== kind) continue;
    const candidate = { ...preset, id: 'current', name: 'Current', builtIn: false };
    if (soundKey(candidate) === soundKey(current)) return preset.id;
  }
  return null;
}
