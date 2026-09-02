import { app, BrowserWindow } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const isolatedUserData = process.env.SWITCHBOARD_SETTINGS_MEASURE_USER_DATA;
const maximumOpenMs = Number.parseInt(process.env.SWITCHBOARD_SETTINGS_MAX_MS ?? '100', 10);
const reviewOutput = process.env.SWITCHBOARD_SETTINGS_REVIEW_OUTPUT
  ? resolve(projectRoot, process.env.SWITCHBOARD_SETTINGS_REVIEW_OUTPUT)
  : null;

if (!isolatedUserData) throw new Error('SWITCHBOARD_SETTINGS_MEASURE_USER_DATA is required.');

app.setName('switchboard-settings-measure');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await import('../out/main/index.js');

void app.whenReady().then(run).catch(fail);

async function run() {
  const window = await waitForWindow();
  window.webContents.setBackgroundThrottling(false);
  await waitForRendererLoad(window);
  await waitForControlPlane(window);

  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const button = document.querySelector('button[aria-label="Settings"]');
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('Could not find the Settings button.');
      }

      let loadingStateObserved = /loading settings/i.test(document.body.innerText);
      let resolveSettings;
      const settingsCommitted = new Promise((resolveCommit) => { resolveSettings = resolveCommit; });
      const observer = new MutationObserver(() => {
        loadingStateObserved ||= /loading settings/i.test(document.body.innerText);
        if (document.querySelector('.settings-page')) resolveSettings();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });

      const startedAt = performance.now();
      button.click();
      if (!document.querySelector('.settings-page')) {
        await Promise.race([
          settingsCommitted,
          new Promise((_, rejectCommit) => setTimeout(() => rejectCommit(new Error('Settings DOM commit timed out.')), 5_000)),
        ]);
      }
      const settings = document.querySelector('.settings-page');
      const elapsedMs = performance.now() - startedAt;
      observer.disconnect();

      return {
        elapsedMs: Math.round(elapsedMs * 10) / 10,
        loadingStateObserved,
        settingsVisible: settings instanceof HTMLElement && settings.getClientRects().length > 0,
      };
    })()
  `);

  const report = {
    mode: 'isolated-native-fixtures',
    budgetMs: maximumOpenMs,
    ...result,
  };
  console.log(`SWITCHBOARD_SETTINGS_NAVIGATION ${JSON.stringify(report)}`);

  if (!result.settingsVisible) {
    throw new Error('Settings did not commit a visible layout after the click.');
  }
  if (result.loadingStateObserved) {
    throw new Error('A Settings loading state was shown.');
  }
  if (Number.isFinite(maximumOpenMs) && result.elapsedMs > maximumOpenMs) {
    throw new Error(`Settings exceeded ${maximumOpenMs} ms click-to-DOM-commit budget.`);
  }

  if (reviewOutput) {
    const viewports = await reviewSettingsViewports(window);
    console.log(`SWITCHBOARD_SETTINGS_VIEWPORTS ${JSON.stringify(viewports)}`);
  }

  await cleanup(0);
}

async function reviewSettingsViewports(window) {
  await mkdir(reviewOutput, { recursive: true });
  const viewports = [
    { name: '1080x720', width: 1080, height: 720 },
    { name: '1420x900', width: 1420, height: 900 },
    { name: '1920x1080', width: 1920, height: 1080 },
  ];
  const results = [];

  for (const viewport of viewports) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(viewport.width, viewport.height, false);
    await delay(120);
    window.webContents.invalidate();
    await window.webContents.executeJavaScript(
      `new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))`,
    );
    const metrics = await window.webContents.executeJavaScript(`
      (() => {
        const settings = document.querySelector('.settings-page');
        const content = document.querySelector('[data-settings-content-scroll]');
        return {
          innerWidth,
          innerHeight,
          settingsVisible: settings instanceof HTMLElement && settings.getClientRects().length > 0,
          documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          contentOverflowX: content ? content.scrollWidth > content.clientWidth : false,
          activeCategory: document.querySelector('[data-settings-category][aria-current="page"]')?.textContent?.trim() ?? null,
        };
      })()
    `);
    if (!metrics.settingsVisible || metrics.documentOverflowX || metrics.contentOverflowX) {
      throw new Error(`${viewport.name} Settings viewport validation failed: ${JSON.stringify(metrics)}`);
    }
    const image = await window.webContents.capturePage();
    await writeFile(resolve(reviewOutput, `${viewport.name}-settings.png`), image.toPNG());
    results.push({ viewport, metrics, imageSize: image.getSize() });
  }

  return results;
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
    if (candidate) return candidate;
    await delay(10);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForRendererLoad(window) {
  if (!window.webContents.isLoadingMainFrame()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer load timed out.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForControlPlane(window) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('main')) && !document.querySelector('.startup-screen')`,
    );
    if (ready) return;
    await delay(10);
  }
  throw new Error('Control plane did not become ready.');
}

async function fail(error) {
  console.error('Settings navigation measurement failed.', error);
  await cleanup(1);
}

async function cleanup(exitCode) {
  app.exit(exitCode);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
