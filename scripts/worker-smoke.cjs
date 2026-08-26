'use strict';

const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { Worker } = require('node:worker_threads');

const root = resolve(__dirname, '..');

function createHarness(filename) {
  const worker = new Worker(join(root, 'resources', 'engine-workers', filename));
  const messages = [];
  const waiters = new Set();

  worker.on('message', (message) => {
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timeout);
      waiters.delete(waiter);
      waiter.resolve(message);
    }
  });

  function waitFor(predicate, timeoutMs = 3_000) {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolvePromise, reject) => {
      const waiter = {
        predicate,
        resolve: resolvePromise,
        timeout: setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`Timed out waiting for ${filename} message.`));
        }, timeoutMs),
      };
      waiters.add(waiter);
    });
  }

  return { worker, waitFor };
}

async function smokeAudio() {
  const { worker, waitFor } = createHarness('audio-worker.cjs');
  await waitFor((message) => message?.type === 'status');
  worker.postMessage({ type: 'command', command: 'start' });
  const running = await waitFor((message) => message?.type === 'status' && message.status?.state === 'running');
  assert.equal(running.status.kind, 'audio');
  assert.ok(running.status.memoryMb > 0);
  const meterFrame = await waitFor((message) => message?.type === 'meters');
  assert.equal(meterFrame.frame.values.length, 4);
  assert.ok(meterFrame.frame.values.every((value) => value.level >= 0 && value.level <= 1));

  worker.postMessage({
    type: 'command',
    command: 'configure',
    payload: {
      chatMix: -0.25,
      buses: [{ id: 'game', gain: 0.8 }],
      micProcessors: [{ id: 'noise-suppression', enabled: false, parameters: { amount: 35 } }],
    },
  });
  const configured = await waitFor(
    (message) => message?.type === 'status' && message.status?.message?.includes('ChatMix -0.25'),
  );
  assert.equal(configured.status.state, 'running');

  worker.postMessage({ type: 'command', command: 'shutdown' });
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error('Audio worker did not exit.')), 3_000);
    worker.once('exit', (code) => {
      clearTimeout(timeout);
      assert.equal(code, 0);
      resolvePromise();
    });
  });
}

async function smokeCapture() {
  const directory = await mkdtemp(join(tmpdir(), 'switchboard-capture-'));
  const { worker, waitFor } = createHarness('capture-worker.cjs');

  try {
    await waitFor((message) => message?.type === 'status');
    worker.postMessage({
      type: 'command',
      command: 'configure',
      payload: { replaySeconds: 30, fps: 120, resolution: '1080p', codec: 'h264', encoder: 'nvenc' },
    });
    worker.postMessage({ type: 'command', command: 'start' });
    const running = await waitFor((message) => message?.type === 'status' && message.status?.state === 'running');
    assert.equal(running.status.kind, 'capture');

    const requestId = 'worker-smoke-replay';
    worker.postMessage({
      type: 'request',
      requestId,
      command: 'saveReplay',
      payload: { directory, replaySeconds: 30 },
    });
    const response = await waitFor((message) => message?.type === 'response' && message.requestId === requestId);
    assert.equal(response.error, undefined);
    assert.equal(response.result.prototype, true);
    assert.equal(response.result.durationSeconds, 30);
    assert.ok(existsSync(response.result.path));
    const metadata = JSON.parse(await readFile(response.result.path, 'utf8'));
    assert.equal(metadata.capture.fps, 120);
    assert.equal(metadata.capture.codec, 'h264');

    worker.postMessage({ type: 'command', command: 'shutdown' });
    await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => reject(new Error('Capture worker did not exit.')), 3_000);
      worker.once('exit', (code) => {
        clearTimeout(timeout);
        assert.equal(code, 0);
        resolvePromise();
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

(async () => {
  await smokeAudio();
  await smokeCapture();
  console.log('Utility worker smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
