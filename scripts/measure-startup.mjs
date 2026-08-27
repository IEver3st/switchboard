import { app, BrowserWindow } from 'electron';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const startedAt = performance.now();
const projectRoot = resolve(import.meta.dirname, '..');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-startup-measure-'));
const maximumReadyMs = Number.parseInt(process.env.SWITCHBOARD_STARTUP_MAX_MS ?? '1500', 10);

app.setName('switchboard-startup-measure');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

const importStartedAt = performance.now();
await import('../out/main/index.js');
const importedAt = performance.now();

void app.whenReady().then(async () => {
  const appReadyAt = performance.now();
  const window = await waitForWindow();
  const windowCreatedAt = performance.now();
  await waitForRendererLoad(window);
  const rendererLoadedAt = performance.now();
  await waitForControlPlane(window);
  const controlPlaneReadyAt = performance.now();
  const result = {
    mode: 'isolated-native-fixtures',
    budgetMs: maximumReadyMs,
    importMs: round(importedAt - importStartedAt),
    appReadyMs: round(appReadyAt - startedAt),
    windowCreatedMs: round(windowCreatedAt - startedAt),
    rendererLoadedMs: round(rendererLoadedAt - startedAt),
    controlPlaneReadyMs: round(controlPlaneReadyAt - startedAt),
  };

  console.log(`SWITCHBOARD_STARTUP ${JSON.stringify(result)}`);
  if (Number.isFinite(maximumReadyMs) && result.controlPlaneReadyMs > maximumReadyMs) {
    console.error(`Startup exceeded ${maximumReadyMs} ms.`);
    app.exit(1);
    return;
  }
  app.exit(0);
}).catch((error) => {
  console.error('Startup measurement failed.', error);
  app.exit(1);
});

async function waitForWindow() {
  const deadline = performance.now() + 20_000;
  while (performance.now() < deadline) {
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
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector('main')) && !document.querySelector('.startup-screen')`,
    );
    if (ready) return;
    await delay(10);
  }
  throw new Error('Control plane did not become ready.');
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function round(value) {
  return Math.round(value * 10) / 10;
}
