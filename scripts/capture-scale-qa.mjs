import { app, BrowserWindow } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const count = Number(process.argv[2]);
if (![0, 1, 20, 240].includes(count)) throw new Error('Clip count must be 0, 1, 20, or 240.');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'scale');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-capture-scale-'));
const sourceStatePath = join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json');
const state = JSON.parse(await readFile(sourceStatePath, 'utf8'));
const baseClip = state.clips[0];
if (count > 0 && !baseClip) throw new Error('A real clip is required to seed the scale review.');

await mkdir(outputDirectory, { recursive: true });
await mkdir(join(isolatedUserData, 'Clips'), { recursive: true });
await mkdir(join(isolatedUserData, 'cache', 'thumbnails'), { recursive: true });

const games = ['FiveM', 'War Thunder', 'Desktop', 'Battlefield 6'];
const now = Date.now();
state.clips = [];
for (let index = 0; index < count; index += 1) {
  const id = 'scale-qa-' + String(index).padStart(3, '0');
  const game = games[index % games.length];
  const thumbnailPath = join(isolatedUserData, 'cache', 'thumbnails', id + '.v2.jpg');
  await copyFile(baseClip.thumbnailPath, thumbnailPath);
  state.clips.push({
    ...baseClip,
    id,
    name: game + ' clip',
    game: game === 'Desktop' ? undefined : game,
    createdAt: now - index * 3_600_000,
    durationMs: 30_000 + index % 90 * 1_000,
    fileSize: baseClip.fileSize + index * 65_536,
    favorite: index % 7 === 0,
    titleEdited: false,
    thumbnailPath,
    audioChannels: index % 3 === 0 ? ['game', 'microphone'] : ['game'],
  });
}
state.capture.config.enabled = false;
state.capture.config.clipsDirectory = join(isolatedUserData, 'Clips');
state.capture.runtime = {
  ...state.capture.runtime,
  state: 'stopped',
  bufferedSeconds: 0,
  segmentCount: 0,
  replayCacheBytes: 0,
  observedBitrateBps: 0,
  activeSource: null,
  saveQueueDepth: 0,
  error: undefined,
  warning: undefined,
};
state.capture.storage.clipsDirectory = join(isolatedUserData, 'Clips');
state.capture.storage.cacheDirectory = join(isolatedUserData, 'cache', 'replay');
state.capture.storage.clipsBytes = state.clips.reduce((total, clip) => total + clip.fileSize, 0);
state.capture.storage.replayCacheBytes = 0;
await writeFile(join(isolatedUserData, 'switchboard-state.json'), JSON.stringify(state, null, 2));

app.setName('switchboard-capture-scale-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.stdout.write(`scale ${count}: importing main\n`);
await import('../out/main/index.js');
process.stdout.write(`scale ${count}: waiting for ready\n`);
await app.whenReady();
process.stdout.write(`scale ${count}: waiting for window\n`);

const window = await waitForWindow();
process.stdout.write(`scale ${count}: window found\n`);
if (window.webContents.isLoading()) {
  await new Promise((resolveLoad) => window.webContents.once('did-finish-load', resolveLoad));
}
window.setContentSize(1420, 900, false);
await window.webContents.executeJavaScript("location.hash = 'capture'");
await waitForLibrary(window, count);
await delay(250);

const metricsExpression = [
  '(() => {',
  "const grid = document.querySelector('.capture-clip-grid');",
  "const cards = [...document.querySelectorAll('.capture-clip-card')];",
  "const images = [...document.querySelectorAll('.capture-clip-card img')];",
  'return {',
  'requestedClips: ' + count + ',',
  'cards: cards.length,',
  "rows: document.querySelectorAll('tbody tr').length,",
  "columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,",
  "emptyState: document.body.textContent.includes('No clips yet'),",
  "dateGroups: [...document.querySelectorAll('h3')].map((node) => node.textContent.trim()).filter((text) => /^(Today|Yesterday|[A-Z][a-z]+ \\\\d{1,2})$/.test(text)),",
  "lazyImages: images.filter((image) => image.loading === 'lazy').length,",
  'decodedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,',
  'horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,',
  '};',
  '})()',
].join('\n');
const metrics = await window.webContents.executeJavaScript(metricsExpression);
const image = await window.webContents.capturePage();
const imagePath = join(outputDirectory, 'capture-' + count + '-clips.png');
await writeFile(imagePath, image.toPNG());
const report = { ...metrics, imagePath, imageSize: image.getSize() };
await writeFile(join(outputDirectory, 'capture-' + count + '-clips.json'), JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
app.quit();

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
    if (candidate) return candidate;
    await delay(50);
  }
  throw new Error('Switchboard main window was not created.');
}

async function waitForLibrary(target, expected) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await target.webContents.executeJavaScript(
      expected === 0
        ? "document.body.textContent.includes('No clips yet')"
        : "document.querySelectorAll('.capture-clip-card').length === " + expected,
    );
    if (ready) return;
    await delay(50);
  }
  throw new Error('Capture library did not render ' + expected + ' clips.');
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
