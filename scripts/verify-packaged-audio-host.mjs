import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = join(root, 'dist', 'win-unpacked', 'switchboard.exe');
const packagedHost = join(root, 'dist', 'win-unpacked', 'resources', 'audio-host', 'Audio.Host.exe');
const stateSource = process.env.APPDATA ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json') : null;
if (!stateSource) throw new Error('APPDATA is unavailable.');
await readFile(executable);
await readFile(packagedHost);

const userData = await mkdtemp(join(tmpdir(), 'switchboard-packaged-audio-'));
await copyFile(stateSource, join(userData, 'switchboard-state.json'));
const port = await reservePort();
const environment = { ...process.env, SWITCHBOARD_NATIVE_REVIEW: '1', SWITCHBOARD_NATIVE_FIXTURES: '1' };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
  cwd: dirname(executable),
  env: environment,
  windowsHide: true,
  stdio: 'ignore',
});

let socket;
let packagedAudioPid;
try {
  const target = await waitForTarget(port);
  socket = await connect(target.webSocketDebuggerUrl);
  const ready = await waitForSnapshot(socket, (snapshot) => (
    snapshot.audio.enabled
    && snapshot.audio.host?.running
    && snapshot.audio.host.noiseSuppression.state === 'ready'
    && snapshot.engines.find((engine) => engine.kind === 'audio')?.state === 'running'
  ));
  packagedAudioPid = ready.engines.find((engine) => engine.kind === 'audio')?.pid;
  if (!packagedAudioPid) throw new Error('The packaged Audio.Host did not report a process ID.');

  const balanced = await evaluate(socket, `window.switchboard.setMicProcessor({ processorId: 'noise-suppression', enabled: true, parameters: { amount: 55 } })`);
  if (balanced.audio.host?.noiseSuppression.attenuationLimitDb !== 21) {
    throw new Error('The packaged native host did not apply the Balanced attenuation target.');
  }
  await evaluate(socket, `window.switchboard.setAudioEnabled(false)`);
  await waitForSnapshot(socket, (snapshot) => (
    snapshot.audio.host === null
    && snapshot.engines.find((engine) => engine.kind === 'audio')?.state === 'stopped'
  ));

  const report = {
    executable,
    packagedHost,
    audioHostPid: packagedAudioPid,
    backend: ready.audio.host.noiseSuppression.backend,
    nativeLibraryHash: ready.audio.host.noiseSuppression.nativeLibraryHash,
    frameLength: ready.audio.host.noiseSuppression.frameLength,
    processingSampleRate: ready.audio.host.noiseSuppression.processingSampleRate,
    balancedAttenuationLimitDb: balanced.audio.host.noiseSuppression.attenuationLimitDb,
    cleanAudioShutdown: true,
  };
  const evidenceDirectory = join(root, '.switchboard', 'evidence');
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(join(evidenceDirectory, 'packaged-audio-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  await evaluate(socket, `window.switchboard.updateSettings({ closeToTray: false })`);
  await evaluate(socket, `(() => { setTimeout(() => window.close(), 0); return true; })()`);
  const exitedCleanly = await waitForExit(child, 20_000);
  if (!exitedCleanly) throw new Error('The packaged app did not complete its graceful host shutdown.');
} finally {
  socket?.close();
  if (child.exitCode === null) await terminateProcessTree(child);
  await waitForExit(child, 5_000);
  await removeDirectoryWithRetry(userData, 10_000);
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!port) throw new Error('Could not reserve a debugging port.');
  return port;
}

async function waitForTarget(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const target = targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
      if (target) return target;
    } catch {
      // The packaged main process has not opened its DevTools endpoint yet.
    }
    await delay(100);
  }
  throw new Error('The packaged renderer did not expose a debugging target.');
}

function connect(url) {
  return new Promise((resolveSocket, rejectSocket) => {
    const client = new WebSocket(url);
    client.once('open', () => resolveSocket(createProtocolClient(client)));
    client.once('error', rejectSocket);
  });
}

function createProtocolClient(client) {
  let nextId = 0;
  const pending = new Map();
  client.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    call(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolveCall, rejectCall) => {
        pending.set(id, { resolve: resolveCall, reject: rejectCall });
        client.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { client.close(); },
  };
}

async function evaluate(client, expression) {
  const response = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? 'Packaged renderer evaluation failed.');
  return response.result.value;
}

async function waitForSnapshot(client, predicate) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const snapshot = await evaluate(client, `window.switchboard?.getSnapshot()`);
      if (snapshot && predicate(snapshot)) return snapshot;
    } catch {
      // Renderer startup and refresh can briefly make the preload API unavailable.
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the packaged Audio.Host state.');
}

function waitForExit(process, timeoutMs) {
  if (process.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolveExit) => {
    const timeout = setTimeout(() => resolveExit(false), timeoutMs);
    process.once('exit', () => {
      clearTimeout(timeout);
      resolveExit(true);
    });
  });
}

async function terminateProcessTree(process) {
  if (!process.pid || process.exitCode !== null) return;
  await new Promise((resolveTermination) => {
    const terminator = spawn('taskkill.exe', ['/pid', String(process.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    terminator.once('error', () => {
      process.kill();
      resolveTermination();
    });
    terminator.once('exit', resolveTermination);
  });
}

async function removeDirectoryWithRetry(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  do {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error;
      await delay(100);
    }
  } while (Date.now() < deadline);
  throw lastError;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
