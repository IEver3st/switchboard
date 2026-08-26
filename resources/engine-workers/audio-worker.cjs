'use strict';

const parentPort = process.parentPort ?? require('node:worker_threads').parentPort;
if (!parentPort) throw new Error('Audio worker must run as an Electron utility process.');

let startedAt = 0;
let running = false;
let chatMix = 0.15;
const busGains = { game: 1, chat: 0.76, media: 0.42, aux: 0.9 };
const processors = {
  gain: true,
  'noise-gate': true,
  'noise-suppression': true,
  equalizer: true,
  compressor: true,
  limiter: true,
};

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

  if (Array.isArray(payload.buses)) {
    for (const bus of payload.buses) {
      if (!isRecord(bus) || !Object.hasOwn(busGains, bus.id)) continue;
      busGains[bus.id] = clampNumber(bus.gain, 0, 1.5, busGains[bus.id]);
    }
  }

  if (Array.isArray(payload.micProcessors)) {
    for (const processor of payload.micProcessors) {
      if (!isRecord(processor) || !Object.hasOwn(processors, processor.id)) continue;
      if (typeof processor.enabled === 'boolean') processors[processor.id] = processor.enabled;
    }
  }
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

  if (message.command === 'setChatMix' && isRecord(message.payload)) {
    chatMix = clampNumber(message.payload.value, -1, 1, chatMix);
  }

  if (message.command === 'setMicProcessor' && isRecord(message.payload) && Object.hasOwn(processors, message.payload.processorId)) {
    if (typeof message.payload.enabled === 'boolean') processors[message.payload.processorId] = message.payload.enabled;
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
status();
