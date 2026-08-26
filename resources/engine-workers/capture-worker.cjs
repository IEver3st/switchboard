'use strict';

const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');

const parentPort = process.parentPort ?? require('node:worker_threads').parentPort;
if (!parentPort) throw new Error('Capture worker must run as an Electron utility process.');

let startedAt = 0;
let running = false;
let config = {
  replaySeconds: 60,
  fps: 60,
  resolution: '1440p',
  codec: 'av1',
  encoder: 'auto',
};

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function applyConfiguration(payload) {
  if (!isRecord(payload)) return;
  config = {
    ...config,
    replaySeconds: Math.round(clampNumber(payload.replaySeconds, 15, 300, config.replaySeconds)),
    fps: [30, 60, 120].includes(Number(payload.fps)) ? Number(payload.fps) : config.fps,
    resolution: ['1080p', '1440p', 'native'].includes(payload.resolution) ? payload.resolution : config.resolution,
    codec: ['h264', 'hevc', 'av1'].includes(payload.codec) ? payload.codec : config.codec,
    encoder: ['auto', 'nvenc', 'amf', 'qsv', 'software'].includes(payload.encoder) ? payload.encoder : config.encoder,
  };
}

function status() {
  const uptimeSeconds = running ? (Date.now() - startedAt) / 1000 : 0;
  const memoryMb = process.memoryUsage().rss / 1024 / 1024;
  parentPort.postMessage({
    type: 'status',
    status: {
      kind: 'capture',
      state: running ? 'running' : 'stopped',
      pid: running ? process.pid : undefined,
      cpuPercent: running ? Math.round((0.6 + Math.random() * 0.5) * 10) / 10 : 0,
      memoryMb: running ? Math.round(memoryMb * 10) / 10 : 0,
      uptimeSeconds: Math.round(uptimeSeconds * 10) / 10,
      message: running ? `${config.resolution} ${config.fps} FPS disk-backed replay simulation active` : undefined,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function saveReplay(payload) {
  const directory = isRecord(payload) && typeof payload.directory === 'string'
    ? payload.directory
    : join(process.cwd(), '.switchboard', 'clips');
  const replaySeconds = Math.round(
    clampNumber(isRecord(payload) ? payload.replaySeconds : undefined, 15, 300, config.replaySeconds),
  );
  await mkdir(directory, { recursive: true });

  const createdAt = new Date();
  const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
  const name = `Prototype replay · ${replaySeconds}s`;
  const path = join(directory, `Switchboard_${stamp}.prototype.json`);
  const sizeMb = Math.round(replaySeconds * 3.75 * 10) / 10;

  await writeFile(
    path,
    JSON.stringify(
      {
        prototype: true,
        note: 'This control-plane prototype records metadata only. Replace this utility worker with engines/capture-host for real FFmpeg capture.',
        capture: config,
        durationSeconds: replaySeconds,
        estimatedEncodedSizeMb: sizeMb,
        createdAt: createdAt.toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );

  return {
    name,
    path,
    durationSeconds: replaySeconds,
    sizeMb,
    createdAt: createdAt.toISOString(),
    prototype: true,
  };
}

parentPort.on('message', async (event) => {
  const message = event && typeof event === 'object' && 'data' in event ? event.data : event;
  if (!isRecord(message) || typeof message.type !== 'string') return;

  if (message.type === 'command') {
    if (message.command === 'start') {
      if (!running) startedAt = Date.now();
      running = true;
    }
    if (message.command === 'configure') applyConfiguration(message.payload);
    if (message.command === 'shutdown') {
      running = false;
      status();
      setTimeout(() => process.exit(0), 10);
      return;
    }
    status();
    return;
  }

  if (message.type === 'request' && typeof message.requestId === 'string') {
    try {
      let result;
      if (message.command === 'saveReplay') result = await saveReplay(message.payload);
      else throw new Error(`Unknown capture request: ${String(message.command)}`);
      parentPort.postMessage({ type: 'response', requestId: message.requestId, result });
    } catch (error) {
      parentPort.postMessage({
        type: 'response',
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

setInterval(status, 1000).unref();
status();
