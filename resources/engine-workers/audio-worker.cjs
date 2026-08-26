'use strict';

const parentPort = process.parentPort ?? require('node:worker_threads').parentPort;
if (!parentPort) throw new Error('Audio worker must run as an Electron utility process.');

let startedAt = 0;
let running = false;
let chatMix = 0.15;
let masterGain = 1;
let masterEnabled = true;
let meterSequence = 0;
let meterPhase = 0;
const busGains = { game: 1, chat: 0.76, media: 0.42, mic: 0.92 };
const busEnabled = { game: true, chat: true, media: true, mic: true };
const busDevices = {
  game: '',
  chat: '',
  media: '',
  mic: '',
};
const processors = {
  gain: true,
  'noise-gate': true,
  'noise-suppression': true,
  equalizer: true,
  compressor: true,
  limiter: true,
};
const processorParameters = {
  gain: { gainDb: 0 },
  'noise-gate': { thresholdDb: -48, attackMs: 10, releaseMs: 180 },
  'noise-suppression': { amount: 55 },
  equalizer: { bands: [] },
  compressor: { thresholdDb: -18, ratio: 4, attackMs: 12, releaseMs: 180, makeupDb: 2 },
  limiter: { thresholdDb: -1, releaseMs: 90 },
};
const channelProcessing = { game: {}, chat: {}, media: {} };
let monitoring = { enabled: false, level: 0.18, deviceId: '' };

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function activeProcessorCost() {
  return Object.entries(processors).reduce((cost, [id, enabled]) => {
    if (!enabled) return cost;
    return cost + (id === 'noise-suppression' ? 0.16 : 0.03);
  }, 0);
}

function applyConfiguration(payload) {
  if (!isRecord(payload)) return;
  chatMix = clampNumber(payload.chatMix, -1, 1, chatMix);
  if (isRecord(payload.master)) {
    masterGain = clampNumber(payload.master.gain, 0, 1.5, masterGain);
    if (typeof payload.master.enabled === 'boolean') masterEnabled = payload.master.enabled;
  }

  if (Array.isArray(payload.buses)) {
    for (const bus of payload.buses) {
      if (!isRecord(bus) || !Object.hasOwn(busGains, bus.id)) continue;
      busGains[bus.id] = clampNumber(bus.gain, 0, 1.5, busGains[bus.id]);
      if (typeof bus.enabled === 'boolean') busEnabled[bus.id] = bus.enabled;
      if (typeof bus.deviceId === 'string' && bus.deviceId.length > 0) busDevices[bus.id] = bus.deviceId;
    }
  }

  if (Array.isArray(payload.micProcessors)) {
    for (const processor of payload.micProcessors) {
      if (!isRecord(processor) || !Object.hasOwn(processors, processor.id)) continue;
      if (typeof processor.enabled === 'boolean') processors[processor.id] = processor.enabled;
      if (isRecord(processor.parameters)) {
        processorParameters[processor.id] = { ...processorParameters[processor.id], ...processor.parameters };
      }
    }
  }

  if (Array.isArray(payload.channelProcessing)) {
    for (const processing of payload.channelProcessing) {
      if (!isRecord(processing) || !Object.hasOwn(channelProcessing, processing.busId)) continue;
      channelProcessing[processing.busId] = structuredClone(processing);
    }
  }
  monitoring = {
    enabled: typeof payload.monitoringEnabled === 'boolean' ? payload.monitoringEnabled : monitoring.enabled,
    level: clampNumber(payload.monitoring, 0, 1, monitoring.level),
    deviceId: typeof payload.monitoringDeviceId === 'string' ? payload.monitoringDeviceId : monitoring.deviceId,
  };
}

function meters() {
  if (!running) return;
  meterPhase += 0.17;
  const baseLevels = { game: 0.78, chat: 0.52, media: 0.38, mic: 0.64 };
  const values = Object.keys(busGains).map((busId, index) => {
    const movement = 0.52 + Math.sin(meterPhase + index * 1.31) * 0.22 + Math.sin(meterPhase * 0.43 + index) * 0.12;
    const level = busEnabled[busId]
      ? Math.max(0, Math.min(1, baseLevels[busId] * movement * Math.min(1.25, busGains[busId] + 0.18)))
      : 0;
    const peak = Math.min(1, level + 0.055);
    return { busId, level, peak, clipping: peak >= 0.985 };
  });
  parentPort.postMessage({
    type: 'meters',
    frame: { sequence: meterSequence++, timestamp: new Date().toISOString(), values },
  });
}

function status() {
  const uptimeSeconds = running ? (Date.now() - startedAt) / 1000 : 0;
  const memoryMb = process.memoryUsage().rss / 1024 / 1024;
  parentPort.postMessage({
    type: 'status',
    status: {
      kind: 'audio',
      state: running ? 'running' : 'stopped',
      pid: running ? process.pid : undefined,
      cpuPercent: running ? Math.round((0.12 + activeProcessorCost() + Math.random() * 0.08) * 10) / 10 : 0,
      memoryMb: running ? Math.round(memoryMb * 10) / 10 : 0,
      uptimeSeconds: Math.round(uptimeSeconds * 10) / 10,
      message: running ? `48 kHz float32 graph simulation active · ChatMix ${chatMix.toFixed(2)}` : undefined,
      updatedAt: new Date().toISOString(),
    },
  });
}

parentPort.on('message', (event) => {
  const message = event && typeof event === 'object' && 'data' in event ? event.data : event;
  if (!isRecord(message) || message.type !== 'command' || typeof message.command !== 'string') return;

  if (message.command === 'start') {
    if (!running) startedAt = Date.now();
    running = true;
  }

  if (message.command === 'configure') applyConfiguration(message.payload);

  if (message.command === 'setBusGain' && isRecord(message.payload) && Object.hasOwn(busGains, message.payload.busId)) {
    busGains[message.payload.busId] = clampNumber(message.payload.gain, 0, 1.5, busGains[message.payload.busId]);
  }

  if (message.command === 'setMasterGain' && isRecord(message.payload)) {
    masterGain = clampNumber(message.payload.gain, 0, 1.5, masterGain);
  }

  if (message.command === 'setMasterEnabled' && isRecord(message.payload) && typeof message.payload.enabled === 'boolean') {
    masterEnabled = message.payload.enabled;
  }

  if (message.command === 'setBusEnabled' && isRecord(message.payload) && Object.hasOwn(busEnabled, message.payload.busId)) {
    if (typeof message.payload.enabled === 'boolean') busEnabled[message.payload.busId] = message.payload.enabled;
  }

  if (message.command === 'setBusDevice' && isRecord(message.payload) && Object.hasOwn(busDevices, message.payload.busId)) {
    if (typeof message.payload.deviceId === 'string' && message.payload.deviceId.length > 0) {
      busDevices[message.payload.busId] = message.payload.deviceId;
    }
  }

  if (message.command === 'setChatMix' && isRecord(message.payload)) {
    chatMix = clampNumber(message.payload.value, -1, 1, chatMix);
  }

  if (message.command === 'setMicProcessor' && isRecord(message.payload) && Object.hasOwn(processors, message.payload.processorId)) {
    if (typeof message.payload.enabled === 'boolean') processors[message.payload.processorId] = message.payload.enabled;
    if (isRecord(message.payload.parameters)) {
      processorParameters[message.payload.processorId] = {
        ...processorParameters[message.payload.processorId],
        ...message.payload.parameters,
      };
    }
  }

  if (message.command === 'setChannelProcessor' && isRecord(message.payload) && Object.hasOwn(channelProcessing, message.payload.busId)) {
    const current = channelProcessing[message.payload.busId];
    const processorId = message.payload.processorId;
    if (isRecord(current) && typeof processorId === 'string' && Object.hasOwn(current, processorId)) {
      current[processorId] = {
        ...current[processorId],
        ...(typeof message.payload.enabled === 'boolean' ? { enabled: message.payload.enabled } : {}),
        ...(isRecord(message.payload.parameters) ? message.payload.parameters : {}),
      };
    }
  }

  if (message.command === 'setMonitoring' && isRecord(message.payload)) {
    monitoring = {
      enabled: typeof message.payload.enabled === 'boolean' ? message.payload.enabled : monitoring.enabled,
      level: clampNumber(message.payload.level, 0, 1, monitoring.level),
      deviceId: typeof message.payload.deviceId === 'string' ? message.payload.deviceId : monitoring.deviceId,
    };
  }

  if (message.command === 'shutdown') {
    running = false;
    status();
    setTimeout(() => process.exit(0), 10);
    return;
  }

  status();
});

setInterval(status, 1000).unref();
setInterval(meters, 50).unref();
status();
