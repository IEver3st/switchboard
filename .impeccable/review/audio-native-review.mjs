import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'audio');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-audio-review-'));
app.setName('switchboard-audio-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';

const viewports = [
  { name: '1080x720', width: 1080, height: 720 },
  { name: '1420x900', width: 1420, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];

const screens = [
  { name: 'audio-mixer', tab: 'mixer' },
  { name: 'audio-game', tab: 'game' },
  { name: 'audio-microphone', tab: 'microphone' },
];

await mkdir(outputDirectory, { recursive: true });
await import('../../out/main/index.js');
let window;
void app.whenReady().then(runReview).catch((error) => {
  console.error('Audio review failed.', error);
  app.exit(1);
});

async function runReview() {
  window = await waitForWindow();
  await waitForLoad(window);
  await window.webContents.insertCSS(`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    html { scroll-behavior: auto !important; }
  `);

  const report = [];
  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height, false);
    await delay(300);
    for (const screen of screens) {
      await openAudioTab(screen.tab);
      await delay(250);
      const metrics = await getLayoutMetrics(window);
      const image = await window.webContents.capturePage();
      const filename = `${viewport.name}-${screen.name}.png`;
      await writeFile(join(outputDirectory, filename), image.toPNG());
      report.push({ viewport: viewport.name, screen: screen.name, metrics, filename });
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
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer did not finish loading.')), 20_000);
    target.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
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
  await window.webContents.executeJavaScript(`
    (() => {
      document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach((element) => element.scrollTo(0, 0));
      return true;
    })()
  `);
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
        channelStrips: document.querySelectorAll('.mixer-channel').length,
        page: location.hash,
      };
    })()
  `);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
