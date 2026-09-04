import { app, BrowserWindow } from 'electron';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
app.setName('switchboard-capture-source-background-review');
app.setAppPath(projectRoot);
app.setPath('userData', await mkdtemp(join(tmpdir(), 'switchboard-capture-source-background-')));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';

await import('../out/main/index.js');

void app.whenReady().then(async () => {
  const window = await waitForWindow();
  if (window.webContents.isLoading()) {
    await new Promise((resolveLoad) => window.webContents.once('did-finish-load', resolveLoad));
  }
  const result = await window.webContents.executeJavaScript(`
    window.switchboard.refreshCaptureSources().then((snapshot) => ({
      displays: snapshot.capture.sources.filter((source) => source.type === 'display').length,
      windows: snapshot.capture.sources.filter((source) => source.type === 'window').length,
    }))
  `);
  if (result.displays === 0 || result.windows === 0) {
    throw new Error(`Capture source enumeration returned an incomplete result: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify(result));
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error('Timed out waiting for the Switchboard window.');
}
