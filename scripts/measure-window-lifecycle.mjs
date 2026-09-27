// Launch through Electron after building. Uses hidden native windows and injected
// visibility events, never physical hardware or the user's settings/media.
import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const baseline = process.argv.includes('--baseline');
if (baseline && !process.env.SWITCHBOARD_WINDOW_LIFECYCLE_BUNDLE) {
  throw new Error('--baseline requires SWITCHBOARD_WINDOW_LIFECYCLE_BUNDLE pointing to a saved pre-change main bundle.');
}
const output = join(root, '.switchboard', 'window-lifecycle', String(Date.now()));
const profile = await mkdtemp(join(tmpdir(), 'switchboard-window-lifecycle-'));
await mkdir(output, { recursive: true });
await mkdir(join(profile, 'videos'));
app.setName('switchboard-window-lifecycle');
app.setAppPath(root);
app.setPath('userData', profile);
app.setPath('videos', join(profile, 'videos'));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
BrowserWindow.prototype.show = function () { throw new Error('Visible UI prohibited'); };
BrowserWindow.prototype.showInactive = function () { throw new Error('Visible UI prohibited'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => window.webContents.setBackgroundThrottling(false));
const bundle = (await readFile(process.env.SWITCHBOARD_WINDOW_LIFECYCLE_BUNDLE ?? join(root, 'out/main/index.js'), 'utf8'))
  .replace('const __dirname = import.meta.dirname;', `const __dirname = ${JSON.stringify(join(root, 'out/main'))};`);
const reviewModule = join(output, 'review-main.mjs');
await writeFile(reviewModule, `${bundle}\nexport { controller, showWindow };\n`);
const main = await import(pathToFileURL(reviewModule).href);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = (window, code) => window.webContents.executeJavaScript(code);
async function until(predicate) {
  const deadline = performance.now() + 20_000;
  while (!(await predicate())) {
    if (performance.now() > deadline) throw new Error('Window lifecycle review timed out');
    await delay(10);
  }
}
async function windowReady() {
  let window;
  await until(async () => {
    window = BrowserWindow.getAllWindows()[0];
    return window && !window.webContents.isLoading()
      && await js(window, 'Boolean(document.querySelector(".app-shell main"))');
  });
  await js(window, `globalThis.lifecycleSnapshot = null;
    globalThis.lifecycleUnsubscribe = window.switchboard.subscribe(snapshot => { globalThis.lifecycleSnapshot = snapshot; }); true;`);
  await until(() => js(window, 'Boolean(globalThis.lifecycleSnapshot)'));
  return window;
}
const watchdog = setTimeout(() => app.exit(2), 60_000);
void app.whenReady().then(async () => {
try {
  let window = await windowReady();
  await main.controller.initialize();
  await js(window, 'window.switchboard.updateSettings({closeToTray:true,destroyRendererInTray:false,onboardingCompleted:true})');
  const frames = [];
  const send = window.webContents.send.bind(window.webContents);
  window.webContents.send = (channel, ...args) => {
    if (channel === 'system:snapshot-updated') frames.push(args[0]);
    return send(channel, ...args);
  };
  const publish = () => {
    for (let i = 1; i <= 100; i++) main.controller.store.updateBranches(['capture'], draft => {
      draft.capture.runtime.bufferedSeconds = i;
    }, { persist: false });
  };
  const result = { mode: 'hidden-native-fixtures-with-injected-visibility-events', baseline };
  window.close();
  assert.equal(window.isDestroyed(), false);
  // Native hide on an already hidden review window emits no hide event.
  window.emit('hide');
  assert.equal(main.controller.rendererActive, false);
  frames.length = 0;
  publish();
  result.retainedTrayFrames = frames.length;
  main.showWindow(); window.emit('show');
  result.resumeFrames = frames.length - result.retainedTrayFrames;
  await until(() => js(window, 'globalThis.lifecycleSnapshot.capture.runtime.bufferedSeconds === 100'));
  result.canonicalStateRestored = true;
  frames.length = 0;
  window.emit('minimize');
  result.minimizedControllerActive = main.controller.rendererActive;
  publish();
  result.minimizedFrames = frames.length;
  window.emit('restore');
  assert.equal(main.controller.rendererActive, true);
  const get = main.controller.store.get.bind(main.controller.store);
  let clones = 0;
  main.controller.store.get = () => { clones++; return get(); };
  for (let i = 0; i < 100; i++) main.controller.setRendererActive(true);
  result.redundantActivationCopies = clones;
  main.controller.store.get = get;
  if (!baseline) {
    assert.equal(result.retainedTrayFrames, 0);
    assert.equal(result.resumeFrames, 1);
    assert.equal(result.minimizedControllerActive, false);
    assert.equal(result.minimizedFrames, 0);
    assert.equal(result.redundantActivationCopies, 0);
  }
  await js(window, 'window.switchboard.updateSettings({destroyRendererInTray:true})');
  const reopenMs = [];
  for (let i = 0; i < 3; i++) {
    const closed = window;
    const listeners = Object.fromEntries(['hide', 'show', 'minimize', 'restore'].map(event => [event, closed.listenerCount(event)]));
    closed.close();
    assert.equal(closed.isDestroyed(), true);
    assert.equal(main.controller.rendererActive, false);
    // webContents destruction completes asynchronously after BrowserWindow closes.
    if (!baseline) await until(() => Object.keys(listeners).every(event => closed.listenerCount(event) < listeners[event]));
    const start = performance.now();
    main.showWindow(); window = await windowReady();
    reopenMs.push(Math.round((performance.now() - start) * 10) / 10);
    assert.equal(await js(window, 'globalThis.lifecycleSnapshot.settings.destroyRendererInTray'), true);
    assert.equal(main.controller.rendererActive, true);
  }
  result.destroyedRendererReopenMs = reopenMs;
  await main.controller.store.flush();
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(`SWITCHBOARD_WINDOW_LIFECYCLE ${JSON.stringify({ ...result, output })}`);
} catch (error) {
  console.error(error);
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1';
} finally {
  clearTimeout(watchdog);
  app.quit();
}
});
