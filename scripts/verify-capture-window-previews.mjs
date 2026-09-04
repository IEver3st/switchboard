import { app, BrowserWindow, desktopCapturer } from 'electron';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedUserData = process.env.SWITCHBOARD_CAPTURE_WINDOW_PREVIEW_USER_DATA
  ?? await mkdtemp(join(tmpdir(), 'switchboard-window-previews-'));

app.setName('switchboard-window-preview-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';

await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error(error);
  app.exit(1);
});

async function run() {
  const nativeWindowSources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: process.platform === 'win32'
      ? { width: 0, height: 0 }
      : { width: 320, height: 180 },
  });
  const window = await waitForWindow();
  await waitForLoad(window);
  await waitFor(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Capture')`, 20_000);
  await clickByText(window, 'Capture');
  await waitFor(window, 'document.querySelector(\'button[aria-label^="Capture source:"]\')');
  await openPicker(window);
  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('.capture-source-popover button')]
      .find((button) => button.textContent?.trim() === 'Refresh')?.click()
  `);
  await waitFor(window, `
    ![...document.querySelectorAll('.capture-source-popover button')]
      .some((button) => button.textContent?.includes('Refreshing'))
  `, 30_000);
  await waitFor(window, `
    [...document.querySelectorAll('.capture-source-option')]
      .some((option) => option.querySelector('.capture-source-option__type')?.textContent?.startsWith('Window'))
  `, 10_000);
  await waitFor(window, `
    [...document.querySelectorAll('.capture-source-option img')]
      .every((image) => image.complete)
  `);

  const snapshotWindowSources = await window.webContents.executeJavaScript(`
    window.switchboard.getSnapshot().then((snapshot) => snapshot.capture.sources.filter((source) => source.type === 'window'))
  `);
  const metrics = await window.webContents.executeJavaScript(`
    (() => {
      const windowOptions = [...document.querySelectorAll('.capture-source-option')]
        .filter((option) => option.querySelector('.capture-source-option__type')?.textContent?.startsWith('Window'));
      return {
        windowOptionCount: windowOptions.length,
        windowPreviewCount: windowOptions.filter((option) => option.querySelector('img')).length,
        loadedWindowPreviewCount: windowOptions.filter((option) => {
          const image = option.querySelector('img');
          return image?.complete && image.naturalWidth > 0;
        }).length,
        unavailableWindowPreviewCount: windowOptions.filter((option) =>
          option.querySelector('.capture-source-option__fallback')?.textContent?.includes('Preview unavailable')
        ).length,
      };
    })()
  `);
  const previewableWindowHandles = new Set(nativeWindowSources
    .filter((source) => !source.thumbnail.isEmpty())
    .map((source) => source.id.match(/^window:([^:]+):/)?.[1])
    .filter(Boolean));
  metrics.expectedPreviewableWindowCount = snapshotWindowSources
    .filter((source) => previewableWindowHandles.has(source.windowHandle)).length;
  console.log(JSON.stringify(metrics, null, 2));
  if (
    metrics.windowOptionCount === 0
    || (process.platform !== 'win32' && metrics.expectedPreviewableWindowCount === 0)
    || metrics.windowPreviewCount !== metrics.expectedPreviewableWindowCount
    || metrics.loadedWindowPreviewCount !== metrics.expectedPreviewableWindowCount
    || metrics.unavailableWindowPreviewCount !== metrics.windowOptionCount - metrics.expectedPreviewableWindowCount
  ) {
    throw new Error(`Window capture previews failed: ${JSON.stringify(metrics)}`);
  }
  app.quit();
}

async function openPicker(window) {
  await window.webContents.executeJavaScript('document.querySelector(\'button[aria-label^="Capture source:"]\')?.click()');
  await waitFor(window, "document.querySelector('.capture-source-popover')");
}

async function clickByText(window, label) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const target = [...document.querySelectorAll('button')]
        .find((button) => button.textContent?.trim() === ${JSON.stringify(label)});
      target?.click();
      return Boolean(target);
    })()
  `);
  if (!clicked) throw new Error(`Could not click ${label}.`);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await delay(50);
  }
  throw new Error('Timed out waiting for the Switchboard window.');
}

async function waitForLoad(window) {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad) => window.webContents.once('did-finish-load', resolveLoad));
}

async function waitFor(window, expression, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${expression}.`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
