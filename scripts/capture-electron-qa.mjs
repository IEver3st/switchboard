import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import WebSocket from 'ws';

class EarlyCdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolvePromise, reject) => {
      this.socket.once('open', resolvePromise);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolvePromise) => {
      this.socket.once('close', resolvePromise);
      this.socket.close();
    });
  }
}

const port = Number(process.argv[2] ?? 9223);
const outputDirectory = resolve(process.argv[3] ?? 'design-qa');
const sizes = [
  [1080, 720],
  [1420, 900],
  [1920, 1080],
  [2560, 1440],
];

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find((candidate) => candidate.type === 'page' && candidate.title === 'Switchboard')
  ?? targets.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('Switchboard renderer target was not found.');

const client = new EarlyCdpClient(target.webSocketDebuggerUrl);
await client.connect();
await client.send('Page.enable');
await client.send('Runtime.enable');
await client.send('Runtime.evaluate', { expression: "location.hash = 'capture'" });
await delay(750);
await mkdir(outputDirectory, { recursive: true });

const evidence = [];
for (const [width, height] of sizes) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await delay(450);
  const metrics = await evaluate(client, `(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    main: (() => { const value = document.querySelector('main'); return value ? { scrollWidth: value.scrollWidth, clientWidth: value.clientWidth } : null; })(),
    cards: document.querySelectorAll('.capture-clip-card').length,
    columns: (() => { const value = document.querySelector('.capture-clip-grid'); return value ? getComputedStyle(value).gridTemplateColumns.split(' ').length : 0; })(),
    heading: document.querySelector('#clips-heading')?.textContent,
  }))()`);
  const capture = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const path = resolve(outputDirectory, `capture-library-${width}x${height}.png`);
  await writeFile(path, Buffer.from(capture.data, 'base64'));
  evidence.push({ requested: { width, height }, path, ...metrics });
}

await client.send('Emulation.clearDeviceMetricsOverride');
await client.close();
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Renderer evaluation failed.');
  return result.result?.value;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolvePromise, reject) => {
      this.socket.once('open', resolvePromise);
      this.socket.once('error', reject);
    });
    this.socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    await new Promise((resolvePromise) => {
      this.socket.once('close', resolvePromise);
      this.socket.close();
    });
  }
}
