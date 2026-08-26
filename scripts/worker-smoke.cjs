'use strict';

const assert = require('node:assert/strict');
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

(async () => {
  await smokeAudio();
  console.log('Audio utility worker smoke test passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
