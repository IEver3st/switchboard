import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import WebSocket from 'ws';

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
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolvePromise) => {
      this.socket.once('close', resolvePromise);
      this.socket.close();
    });
  }
}

const port = Number(process.argv[2] ?? 9224);
const outputDirectory = resolve(process.argv[3] ?? '.impeccable/review/audio');
const sizes = [
  [1080, 720],
  [1420, 900],
  [1920, 1080],
];
const routes = ['audio/mixer', 'audio/game', 'audio/microphone'];

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find((candidate) => candidate.type === 'page' && candidate.title === 'Switchboard')
  ?? targets.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('Switchboard renderer target was not found.');

const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
await client.send('Page.enable');
await client.send('Runtime.enable');
await mkdir(outputDirectory, { recursive: true });

const evidence = [];
for (const route of routes) {
  await evaluate(client, `location.hash = '${route}'`);
  await delay(600);
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
      main: (() => { const value = document.querySelector('main'); return value ? { scrollWidth: value.scrollWidth, clientWidth: value.clientWidth, scrollHeight: value.scrollHeight, clientHeight: value.clientHeight } : null; })(),
      strips: document.querySelectorAll('.mixer-channel').length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }))()`);
    const capture = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    const name = `${route.replace('/', '-')}-${width}x${height}.png`;
    await writeFile(resolve(outputDirectory, name), Buffer.from(capture.data, 'base64'));
    evidence.push({ route, requested: { width, height }, path: name, ...metrics });
  }
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
