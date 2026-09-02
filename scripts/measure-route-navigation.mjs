import { app, BrowserWindow } from 'electron';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const isolatedUserData = process.env.SWITCHBOARD_ROUTE_MEASURE_USER_DATA;
const maximumCommitMs = Number.parseInt(process.env.SWITCHBOARD_ROUTE_MAX_MS ?? '100', 10);
if (!isolatedUserData) throw new Error('SWITCHBOARD_ROUTE_MEASURE_USER_DATA is required.');

app.setName('switchboard-route-measure');
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
  await waitForShell(window);
  await delay(2_000);

  const audio = await measureNavigation(window, 'Audio', '[data-testid="audio-console"]');
  await navigate(window, 'Devices', 'h1');
  const capture = await measureNavigation(window, 'Capture', '[data-testid="capture-library"]');
  const report = { mode: 'isolated-native-fixtures-preloaded', budgetMs: maximumCommitMs, audio, capture };
  console.log(`SWITCHBOARD_ROUTE_NAVIGATION ${JSON.stringify(report)}`);
  if ([audio, capture].some((measurement) => !measurement.visible || measurement.elapsedMs > maximumCommitMs)) {
    throw new Error(`A preloaded workspace exceeded the ${maximumCommitMs} ms click-to-DOM-commit budget.`);
  }
  cleanup(0);
}

function measureNavigation(window, label, selector) {
  return window.webContents.executeJavaScript(`measureRoute(${JSON.stringify(label)}, ${JSON.stringify(selector)})`);
}

async function navigate(window, label, selector) {
  const result = await measureNavigation(window, label, selector);
  if (!result.visible) throw new Error(`${label} did not become visible.`);
}

async function waitForShell(window) {
  await window.webContents.executeJavaScript(`
    new Promise((resolveReady, rejectReady) => {
      const deadline = performance.now() + 20_000;
      const poll = () => {
        if (document.querySelector('.app-shell main')) {
          window.measureRoute = async (label, selector) => {
            const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label);
            if (!(button instanceof HTMLButtonElement)) throw new Error('Could not find the ' + label + ' navigation button.');
            let resolveCommit;
            const committed = new Promise((resolve) => { resolveCommit = resolve; });
            const observer = new MutationObserver(() => { if (document.querySelector(selector)) resolveCommit(); });
            observer.observe(document.body, { childList: true, subtree: true });
            const startedAt = performance.now();
            button.click();
            if (!document.querySelector(selector)) await Promise.race([
              committed,
              new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' DOM commit timed out.')), 5_000)),
            ]);
            const target = document.querySelector(selector);
            const elapsedMs = performance.now() - startedAt;
            observer.disconnect();
            return {
              elapsedMs: Math.round(elapsedMs * 10) / 10,
              visible: target instanceof HTMLElement && target.getClientRects().length > 0,
            };
          };
          resolveReady();
          return;
        }
        if (performance.now() >= deadline) { rejectReady(new Error('Control plane shell did not become ready.')); return; }
        setTimeout(poll, 10);
      };
      poll();
    })
  `);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await delay(10);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForRendererLoad(window) {
  if (!window.webContents.isLoadingMainFrame()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer load timed out.')), 20_000);
    window.webContents.once('did-finish-load', () => { clearTimeout(timeout); resolveLoad(); });
  });
}

function cleanup(code) {
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = String(code);
  app.quit();
}

function fail(error) {
  console.error(error);
  cleanup(1);
}

function delay(milliseconds) { return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)); }
