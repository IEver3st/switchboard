// Hidden native fixture with its own Vite server, settings, and media directory.
import { app, BrowserWindow } from 'electron';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const output = join(root, '.switchboard', 'dev-feedback-review', String(Date.now()));
const profile = await mkdtemp(join(tmpdir(), 'switchboard-dev-feedback-review-'));
await mkdir(output, { recursive: true });
await mkdir(join(profile, 'videos'));
app.setName('switchboard-dev-feedback-review');
app.setAppPath(root);
app.setPath('userData', profile);
app.setPath('videos', join(profile, 'videos'));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_DEV_FEEDBACK = '1';
process.env.SWITCHBOARD_DEV_FEEDBACK_DIRECTORY = output;
BrowserWindow.prototype.show = function () { throw new Error('Visible UI prohibited'); };
BrowserWindow.prototype.showInactive = function () { throw new Error('Visible UI prohibited'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => window.webContents.setBackgroundThrottling(false));
const server = await createServer({ configFile: false, root: join(root, 'src/renderer'),
  plugins: [react(), tailwindcss()], resolve: { alias: { '@': join(root, 'src/renderer/src'), '@shared': join(root, 'src/shared') } },
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error', clearScreen: false });
await server.listen();
process.env.ELECTRON_RENDERER_URL = server.resolvedUrls.local[0];
const bundle = (await readFile(join(root, 'out/main/index.js'), 'utf8'))
  .replace('const __dirname = import.meta.dirname;', `const __dirname = ${JSON.stringify(join(root, 'out/main'))};`);
const reviewModule = join(output, 'review-main.mjs');
await writeFile(reviewModule, `${bundle}\nexport { controller, developmentFeedback, debugDiagnostics, showWindow };\n`);
const main = await import(pathToFileURL(reviewModule).href);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, limit = 20_000) {
  const deadline = Date.now() + limit;
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error('Development feedback review timed out.');
    await delay(25);
  }
}
const status = async () => JSON.parse(await readFile(join(main.developmentFeedback.directory, 'status.json'), 'utf8'));
async function cli(...args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn('bun', ['scripts/diagnose-dev.ts', `--directory=${output}`, ...args], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolveRun(stdout) : reject(new Error(stderr || stdout)));
  });
}
const watchdog = setTimeout(() => app.exit(2), 70_000);
void app.whenReady().then(async () => {
  try {
    await until(async () => {
      const window = BrowserWindow.getAllWindows()[0];
      return window && !window.webContents.isLoading()
        && await window.webContents.executeJavaScript('Boolean(document.querySelector(".app-shell main"))');
    });
    await main.controller.initialize();
    const window = BrowserWindow.getAllWindows()[0];
    await until(async () => (await status()).profiles.length > 0);
    const startup = (await status()).profiles[0];
    assert.equal(startup.reason, 'startup');
    assert.equal(startup.recordings.length, 2);
    for (const recording of startup.recordings) {
      assert.equal(recording.error, undefined);
      assert.ok(recording.samples > 0);
      assert.ok(JSON.parse(await readFile(join(main.developmentFeedback.directory, recording.file), 'utf8')).nodes.length > 0);
    }
    assert.equal(window.webContents.debugger.isAttached(), false);
    await window.webContents.executeJavaScript(`console.error('development-feedback-fixture token=redact-me'); true;`);
    await window.webContents.executeJavaScript(`setTimeout(() => { throw new Error('development-feedback-uncaught-fixture'); }, 0); true;`);
    await until(async () => (await status()).issues.some(issue => issue.data.message?.includes('development-feedback-uncaught-fixture')));
    main.debugDiagnostics.measure('review.known-operation', () => { let sum = 0; for (let i = 0; i < 100_000; i++) sum += Math.sqrt(i); return sum; });
    await main.controller.performance.refresh();
    await main.developmentFeedback.flush();
    const live = JSON.parse(await cli('--json'));
    assert.equal(live.live, true);
    assert.ok(live.issues.some(issue => issue.event === 'console.error' && issue.source === 'renderer'));
    assert.ok(!JSON.stringify(live.issues).includes('redact-me'));
    assert.ok(live.sample.debug.operations.some(operation => operation.name === 'review.known-operation'));
    const requested = JSON.parse(await cli('--profile', '--seconds=1', '--json'));
    assert.equal(requested.profiles.at(-1).reason, 'requested');
    for (const recording of requested.profiles.at(-1).recordings) assert.ok(recording.samples > 0, recording.error);
    assert.equal(window.webContents.debugger.isAttached(), false);
    // Reload retains the main session and reattaches console collection without duplicate listeners.
    const listeners = window.webContents.listenerCount('console-message');
    window.webContents.reload();
    await until(() => !window.webContents.isLoading());
    assert.equal(window.webContents.listenerCount('console-message'), listeners);
    window.webContents.debugger.attach('1.3');
    const debuggerBusy = await main.developmentFeedback.profile({ id: crypto.randomUUID(), sessionId: main.developmentFeedback.sessionId, target: 'both', durationMs: 1_000 });
    assert.ok(debuggerBusy.recordings.find(recording => recording.target === 'renderer').error.includes('already in use'));
    assert.ok(debuggerBusy.recordings.find(recording => recording.target === 'main').samples > 0);
    assert.equal(window.webContents.debugger.isAttached(), true);
    window.webContents.debugger.detach();
    const active = main.developmentFeedback.profile({ id: crypto.randomUUID(), sessionId: main.developmentFeedback.sessionId, target: 'both', durationMs: 10_000 });
    await delay(150);
    window.destroy();
    await main.developmentFeedback.dispose();
    await active;
    assert.equal((await status()).state, 'stopped');
    const stopped = JSON.parse(await cli('--json'));
    assert.equal(stopped.live, false);
    const result = { passed: true, mode: 'hidden-native-electron-with-isolated-vite-server', directory: main.developmentFeedback.directory,
      startup: startup.recordings.map(({ target, samples, durationMs }) => ({ target, samples, durationMs })),
      requested: requested.profiles.at(-1).recordings.map(({ target, samples, durationMs }) => ({ target, samples, durationMs })),
      consoleErrorCapturedAndRedacted: true, operationTimingCaptured: true, debuggerReleased: true, reloadPreservedSession: true,
      rendererDestructionAndShutdownCancelledProfile: true, uncaughtRendererErrorCaptured: true, externalDebuggerPreserved: true };
    await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error);
    process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1';
  } finally {
    clearTimeout(watchdog);
    await server.close();
    app.quit();
  }
});
