import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = process.env.SWITCHBOARD_STARTUP_REVIEW_DIR
  ? resolve(process.env.SWITCHBOARD_STARTUP_REVIEW_DIR)
  : join(projectRoot, '.impeccable', 'review', 'startup');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-startup-review-'));
const viewports = [
  { name: '1080x720', width: 1080, height: 720 },
  { name: '1420x900', width: 1420, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
const requestedViewport = process.argv[2];
const reducedMotionReview = process.argv[3] === 'reduced';
const reviewViewports = requestedViewport
  ? viewports.filter((viewport) => viewport.name === requestedViewport)
  : viewports;
if (reviewViewports.length === 0) throw new Error(`Unknown startup viewport: ${requestedViewport}`);

app.setName('switchboard-startup-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

void app.whenReady().then(runReview).catch((error) => {
  console.error('Startup review failed.', error);
  app.exit(1);
});

async function runReview() {
  const window = await waitForWindow();
  const report = [];

  if (reducedMotionReview) {
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  }

  for (const viewport of reviewViewports) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(window, viewport);
    const reloadStartedAt = Date.now();
    await reload(window);
    if (reducedMotionReview) {
      await waitForSelector(window, '.startup-screen');
      const motionState = await window.webContents.executeJavaScript(`
        (() => ({
          markLayerCount: document.querySelectorAll('.startup-mark__layer').length,
          markAnimations: [...document.querySelectorAll('.startup-mark__layer')]
            .map((layer) => getComputedStyle(layer).animationName),
        }))()
      `);
      const image = await window.webContents.capturePage();
      const filename = `${viewport.name}-startup-reduced.png`;
      await writeFile(join(outputDirectory, filename), image.toPNG());
      await waitForSelector(window, 'main', 40_000);
      const readyAfterMs = Date.now() - reloadStartedAt;
      const startupVisible = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.startup-screen'))`);
      if (startupVisible) {
        throw new Error('Reduced-motion startup did not leave immediately after initialization.');
      }
      report.push({ viewport, reducedMotion: true, readyAfterMs, startupVisible, motionState, filename });
      continue;
    }
    await waitForSelector(window, '.startup-screen');
    await window.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);

    const metrics = await window.webContents.executeJavaScript(`
      (() => {
        const startup = document.querySelector('.startup-screen');
        const sequence = document.querySelector('.startup-sequence');
        const mark = document.querySelector('.startup-mark');
        const bounds = (element) => element ? element.getBoundingClientRect().toJSON() : null;
        return {
          viewport: { width: innerWidth, height: innerHeight },
          startup: bounds(startup),
          sequence: bounds(sequence),
          mark: bounds(mark),
          markLayerCount: document.querySelectorAll('.startup-mark__layer').length,
          status: startup?.textContent?.replace(/\\s+/g, ' ').trim(),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          verticalOverflow: document.documentElement.scrollHeight > innerHeight,
        };
      })()
    `);
    const image = await window.webContents.capturePage();
    const filename = `${viewport.name}-startup.png`;
    await writeFile(join(outputDirectory, filename), image.toPNG());
    await waitForSelectorGone(window, '.startup-screen');
    metrics.controlPlaneVisible = await window.webContents.executeJavaScript(`Boolean(document.querySelector('main'))`);
    report.push({ viewport, metrics, imageSize: image.getSize(), filename });
  }

  const reportSuffix = reducedMotionReview ? '-reduced' : '';
  const reportName = requestedViewport ? `report-${requestedViewport}${reportSuffix}.json` : `report${reportSuffix}.json`;
  await writeFile(join(outputDirectory, reportName), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, captures: report.length, report }, null, 2));
  if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
  app.exit(0);
}

async function reload(window) {
  const loaded = new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer reload timed out.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
  window.webContents.reloadIgnoringCache();
  await loaded;
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
    if (candidate) return candidate;
    await delay(40);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForViewport(window, viewport) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const size = await window.webContents.executeJavaScript(`({ width: innerWidth, height: innerHeight })`);
    if (size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2) return;
    await delay(40);
  }
  throw new Error(`Native window did not reach ${viewport.name}.`);
}

async function waitForSelector(window, selector, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${selector}.`);
}

async function waitForSelectorGone(window, selector) {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    if (!await window.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${selector} to exit.`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
