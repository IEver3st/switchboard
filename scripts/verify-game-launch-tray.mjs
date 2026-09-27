// Run after bun run build: launch this script with Electron, without ELECTRON_RUN_AS_NODE.
// Hidden native windows only. Game events are fixtures; this does not launch a real game.
import { app, BrowserWindow, dialog } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
dialog.showErrorBox = (title, content) => { console.error(title, content); app.exit(1); };
const output = join(root, '.switchboard', 'game-launch-review', String(Date.now()));
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'switchboard-game-launch-'));
app.setName('switchboard-game-launch-review');
app.setAppPath(root);
app.setPath('userData', profile);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
app.commandLine.appendSwitch('force-device-scale-factor', '1');
BrowserWindow.prototype.show = function () { throw new Error('Visible UI prohibited'); };
BrowserWindow.prototype.showInactive = function () { throw new Error('Visible UI prohibited'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => window.webContents.setBackgroundThrottling(false));

// Expose private main bindings only in a separate review copy of the built bundle.
const bundle = (await readFile(join(root, 'out/main/index.js'), 'utf8'))
  .replace('const __dirname = import.meta.dirname;', `const __dirname = ${JSON.stringify(join(root, 'out/main'))};`);
const reviewModule = join(output, 'review-main.mjs');
await writeFile(reviewModule, `${bundle}\nexport { controller, showWindow, desktopEventSchema };\n`);
const main = await import(pathToFileURL(reviewModule).href).catch(error => { console.error(error); app.exit(1); });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (!(await predicate())) { if (Date.now() > deadline) throw new Error('Review timed out'); await delay(40); }
}
const watchdog = setTimeout(() => app.exit(2), 60000);
const state = window => window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
const js = (window, code) => window.webContents.executeJavaScript(code);
async function windowReady() {
  let window;
  await until(async () => {
    window = BrowserWindow.getAllWindows()[0];
    return window && !window.webContents.isLoading() && await js(window, 'Boolean(window.switchboard && document.querySelector("main") && !document.querySelector(".startup-screen"))');
  });
  return window;
}
async function settings(window) {
  await js(window, `sessionStorage.setItem('switchboard.settings.category','general'); location.hash='settings'`);
  await until(() => js(window, `Boolean(document.querySelector('[data-setting-id="general.trayOnGameLaunch"]'))`));
}
function game(processId) {
  const event = main.desktopEventSchema.parse({ type: 'game', processId });
  main.controller.desktopControls.io.game(event.processId);
}

void app.whenReady().then(async () => { try {
  let window = await windowReady();
  await main.controller.initialize();
  await js(window, 'window.switchboard.updateSettings({onboardingCompleted:true,uiScalePercent:100,closeToTray:false})');
  await settings(window);
  assert.equal((await state(window)).settings.trayOnGameLaunch, false);
  game(101);
  assert.equal(window.isDestroyed(), false, 'Disabled policy closed the window');
  const selector = '[aria-label="Move to tray when a game starts"]';
  await js(window, `document.querySelector(${JSON.stringify(selector)}).focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await until(async () => (await state(window)).settings.trayOnGameLaunch);
  assert.equal(main.controller.desktopControls.signature.includes('"watchGames":true'), true);
  const images = [];
  for (const [width, height] of [[1080,720], [1420,900], [1920,1080]]) {
    window.setMinimumSize(1,1);
    window.setContentSize(width,height);
    await delay(120);
    await js(window, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
    await delay(250);
    assert.equal(await js(window, `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight})()`), true, 'Changed control must be inside the screenshot');
    const overflow = await js(window, `document.documentElement.scrollWidth > innerWidth || (()=>{const e=document.querySelector('[data-settings-content-scroll]');return e && e.scrollWidth > e.clientWidth})()`);
    assert.equal(overflow, false);
    window.webContents.invalidate();
    await js(window, 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const path = join(output, `${width}x${height}.png`);
    await writeFile(path, (await window.webContents.capturePage()).toPNG()); images.push(path);
  }
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await js(window, `matchMedia('(prefers-reduced-motion: reduce)').matches`), true);
  window.webContents.debugger.detach();
  window.reload(); await delay(100); window = await windowReady(); await settings(window);
  assert.equal((await state(window)).settings.trayOnGameLaunch, true);
  const before = await state(window);
  game(101);
  assert.equal(window.isDestroyed(), true, 'Game did not release the native renderer');
  assert.equal(main.controller.rendererActive, false);
  main.showWindow(); window = await windowReady();
  game(101);
  assert.equal(window.isDestroyed(), false, 'Same game closed a manually reopened window');
  assert.deepEqual((await state(window)).capture.config, before.capture.config);
  assert.equal((await state(window)).audio.enabled, before.audio.enabled);
  await js(window, 'window.switchboard.updateSettings({destroyRendererInTray:false})');
  let hidden = false;
  window.once('hide', () => { hidden = true; });
  // Hidden review windows do not emit hide; observe the actual native method call.
  const originalHide = window.hide.bind(window);
  window.hide = () => { hidden = true; originalHide(); };
  game(null); game(102);
  assert.equal(hidden, true); assert.equal(window.isDestroyed(), false);
  main.showWindow();
  await js(window, 'window.switchboard.updateSettings({trayOnGameLaunch:false})');
  game(103); assert.equal(main.controller.rendererActive, true);
  await js(window, 'window.switchboard.updateSettings({trayOnGameLaunch:true})');
  main.controller.desktopControls.io.status('error', 'Game watcher fixture unavailable.');
  await settings(window);
  await until(() => js(window, `document.querySelector('[data-setting-id="general.trayOnGameLaunch"]').textContent.includes('Game watcher fixture unavailable.')`));
  await js(window, 'window.switchboard.resetSettings("general")');
  assert.equal((await state(window)).settings.trayOnGameLaunch, false);
  await main.controller.store.flush();
  const saved = JSON.parse(await readFile(join(profile, 'switchboard-state.json'), 'utf8'));
  assert.equal(saved.settings.trayOnGameLaunch, false);
  console.log(JSON.stringify({ passed: true, output, images, proof: 'hidden native UI with injected game events', checks: ['keyboard toggle', 'canonical reload', 'three sizes', 'reduced motion', 'disabled', 'renderer destruction with manual close-to-tray off', 'manual reopen', 'hide-only', 'new game session', 'host error', 'reset persistence'] }));
  clearTimeout(watchdog); app.quit();
} catch (error) { console.error(error); clearTimeout(watchdog); process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1'; app.quit(); } });
