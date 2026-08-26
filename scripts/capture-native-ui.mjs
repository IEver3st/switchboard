import { app, BrowserWindow } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'native');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-native-review-'));
const currentStatePath = process.env.APPDATA ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json') : null;
if (currentStatePath) {
  try {
    const reviewStatePath = join(isolatedUserData, 'switchboard-state.json');
    await copyFile(currentStatePath, reviewStatePath);
    const reviewState = JSON.parse(await readFile(reviewStatePath, 'utf8'));
    if (reviewState.clips?.[0]) {
      reviewState.clips[0].audioChannels = ['game', 'chat', 'media', 'microphone'];
      await writeFile(reviewStatePath, `${JSON.stringify(reviewState, null, 2)}\n`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
app.setName('switchboard-native-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';

const viewports = [
  { name: '1080x720', width: 1080, height: 720 },
  { name: '1420x900', width: 1420, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
];

const screens = [
  { name: 'devices', prepare: () => openDeviceGallery() },
  { name: 'g502-x-plus', prepare: () => openDevice('G502 X Plus') },
  { name: 'quadcast-2', prepare: () => openDevice('QuadCast 2') },
  { name: 'audio-mixer', prepare: () => openAudioTab('mixer') },
  { name: 'audio-game', prepare: () => openAudioTab('game') },
  { name: 'audio-chat', prepare: () => openAudioTab('chat') },
  { name: 'audio-media', prepare: () => openAudioTab('media') },
  { name: 'audio-microphone', prepare: () => openAudioTab('microphone') },
  { name: 'capture', prepare: () => openPage('Capture', '.capture-config-grid') },
  { name: 'clip-editor', prepare: () => openClipEditor() },
  { name: 'modules', prepare: () => openPage('Modules', 'h2') },
  { name: 'settings', prepare: () => openSettings() },
];

await mkdir(outputDirectory, { recursive: true });
console.log('Native review: starting Switchboard main process.');
await import('../out/main/index.js');
console.log('Native review: waiting for Electron readiness.');
let window;
void app.whenReady().then(runReview).catch((error) => {
  console.error('Native review failed.', error);
  app.exit(1);
});

async function runReview() {
  console.log('Native review: waiting for the main window.');
  window = await waitForWindow();
  console.log('Native review: waiting for the renderer.');
  await waitForLoad(window);
  console.log('Native review: renderer ready.');
  await installReviewStyles(window);

  const report = [];
  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height, false);
    await delay(250);

    for (const screen of screens) {
      console.log(`Native review: ${viewport.name} ${screen.name}.`);
      await screen.prepare();
      await delay(200);
      const metrics = await getLayoutMetrics(window);
      const image = await window.webContents.capturePage();
      const imageSize = image.getSize();
      const filename = `${viewport.name}-${screen.name}.png`;
      await writeFile(join(outputDirectory, filename), image.toPNG());
      report.push({ viewport, screen: screen.name, metrics, imageSize, filename });
    }
  }

  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, captures: report.length, report }, null, 2));
  app.quit();
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
    if (candidate) return candidate;
    await delay(50);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForLoad(target) {
  if (!target.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Switchboard renderer did not finish loading.')), 20_000);
    target.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function installReviewStyles(target) {
  await target.webContents.insertCSS(`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    html { scroll-behavior: auto !important; }
  `);
}

async function openDeviceGallery() {
  await clickButton('Devices');
  await window.webContents.executeJavaScript(`
    (() => {
      const back = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'All devices');
      back?.click();
      return true;
    })()
  `);
  await waitForSelector('.device-gallery');
  await scrollMainToTop();
}

async function openDevice(name) {
  await openDeviceGallery();
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const name = ${JSON.stringify(name)};
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label')?.includes(name));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) throw new Error(`Could not open ${name}.`);
  await waitForSelector('.device-workbench__controls, .mouse-config');
  await scrollMainToTop();
}

async function openAudioTab(tab) {
  await clickButton('Audio');
  await window.webContents.executeJavaScript(`
    (() => {
      window.location.hash = ${JSON.stringify(`audio/${tab}`)};
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return true;
    })()
  `);
  await waitForSelector(`#audio-panel-${tab}`);
  await scrollMainToTop();
}

async function openPage(label, selector) {
  await clickButton(label);
  await waitForSelector(selector);
  await scrollMainToTop();
}

async function openClipEditor() {
  await openPage('Capture', '.capture-config-grid');
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.capture-clip-card button, table tbody button');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) throw new Error('Could not open a clip for editor review.');
  await waitForSelector('#clip-editor-title');
}

async function openSettings() {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="Settings"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error('Could not find the Settings button.');
  await waitForSelector('.settings-page');
  await scrollMainToTop();
}

async function clickButton(label) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label);
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Could not find the ${label} button.`);
}

async function waitForSelector(selector) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = await window.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (found) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${selector}.`);
}

async function scrollMainToTop() {
  await window.webContents.executeJavaScript(`
    (() => {
      document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach((element) => element.scrollTo(0, 0));
      return true;
    })()
  `);
}

async function getLayoutMetrics(target) {
  return target.webContents.executeJavaScript(`
    (() => {
      const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
      return {
        innerWidth,
        innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: viewport?.clientWidth ?? null,
        viewportScrollWidth: viewport?.scrollWidth ?? null,
        viewportHeight: viewport?.clientHeight ?? null,
        viewportScrollHeight: viewport?.scrollHeight ?? null,
        page: location.hash,
      };
    })()
  `);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
