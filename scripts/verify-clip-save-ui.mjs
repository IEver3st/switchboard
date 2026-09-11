// Hidden native Electron acceptance for host-reported save queue snapshots.
// Does not start capture, write media, or change the user's application profile.
import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-clip-save-'));
const output = join(root, '.switchboard', 'clip-save-review', String(Date.now()));
await mkdir(output, { recursive: true });
const state = JSON.parse(await readFile(join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json'), 'utf8'));
const base = state.clips.find(clip => clip.thumbnailPath && existsSync(clip.thumbnailPath) && existsSync(clip.path));
if (!base) throw Error('A local clip with a real thumbnail is required for the library fixture.');
await mkdir(join(profile, 'cache', 'thumbnails'), { recursive: true });
state.clips = [];
for (let index = 0; index < 8; index++) {
  const id = `save-review-${index}`;
  const thumbnailPath = join(profile, 'cache', 'thumbnails', `${id}.v2.jpg`);
  await copyFile(base.thumbnailPath, thumbnailPath);
  state.clips.push({ ...base, id, thumbnailPath, name: `Save feedback fixture ${index + 1}`, createdAt: Date.now() - index * 1000 });
}
state.capture.config.enabled = false;
state.capture.config.clipsDirectory = join(profile, 'Clips');
state.audio.enabled = false;
state.modules.forEach(module => { module.enabled = false; });
Object.assign(state.settings, { onboardingCompleted: true, uiScalePercent: 100, automaticUpdates: false, scanGamesAutomatically: false });
await mkdir(state.capture.config.clipsDirectory);
await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
app.setName('switchboard-clip-save-review');
app.setAppPath(root);
app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = function () { throw Error('This review must remain hidden.'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => {
  window.setBounds({ x: -20000, y: -20000, width: 1420, height: 900 });
  window.webContents.setBackgroundThrottling(false);
  window.webContents.setAudioMuted(true);
});
const report = { scope: 'Hidden Electron with fixture snapshots over the production preload subscription. No live save or global shortcut proof.', checks: [], screenshots: [], errors: [] };
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
let window, fixture;
const js = expression => window.webContents.executeJavaScript(expression);
function assert(value, label) { if (!value) throw Error(label); report.checks.push(label); }
async function wait(test, label) {
  const until = Date.now() + 15000;
  while (Date.now() < until) { if (await test()) return; await delay(50); }
  throw Error(`Timed out: ${label}`);
}
// Hidden windows may suspend rAF once reduced motion removes the last animation.
async function frames() {
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await delay(100);
}
async function publish(count, clips, runtime = 'buffering') {
  fixture = structuredClone(fixture);
  fixture.clips = clips;
  Object.assign(fixture.capture.runtime, { saveQueueDepth: count, state: count ? 'saving' : runtime });
  window.webContents.send('system:snapshot-updated', fixture);
  await frames();
}
async function capture(name) {
  // capturePage wakes painting in the hidden window; allow the updated frame to commit.
  for (let pass = 0; pass < 3; pass++) {
    await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await frames();
  }
  await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  report.screenshots.push(name);
}
const pendingCount = () => js('document.querySelectorAll("[data-pending-clip-save]").length');
const watchdog = setTimeout(() => { console.error('Save review timed out', output); app.exit(2); }, 90000);
await import('../out/main/index.js');
void app.whenReady().then(async () => { try {
  await wait(async () => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading() && await js('Boolean(window.switchboard)'); }, 'window');
  await wait(() => js("[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Capture')"), 'navigation');
  fixture = await js('window.switchboard.getSnapshot()');
  fixture.capture.config.enabled = true;
  // Keep the controlled main-side snapshot authoritative during reload and telemetry.
  ipcMain.removeHandler('system:get-snapshot');
  ipcMain.handle('system:get-snapshot', () => fixture);
  const send = window.webContents.send.bind(window.webContents);
  window.webContents.send = (channel, ...args) => send(channel, ...(channel === 'system:snapshot-updated' ? [fixture] : args));
  await js("location.hash = 'capture'");
  await wait(() => js('Boolean(document.querySelector(".capture-library"))'), 'Capture route');
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  window.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
  const clips = fixture.clips;
  assert(clips.length === 8, 'Fixture library has eight indexed clips');
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setMinimumSize(1, 1);
    window.setContentSize(width, height);
    const [ow, oh] = window.getSize(), [cw, ch] = window.getContentSize();
    window.setSize(ow + width - cw, oh + height - ch);
    await wait(() => js(`innerWidth === ${width} && innerHeight === ${height}`), 'viewport');
    for (const layout of ['grid', 'list']) {
      const label = `${width}x${height}-${layout}`;
      console.log(`Save review: ${label}`);
      await js(`document.querySelector('[aria-label="${layout === 'grid' ? 'Grid' : 'List'} view"]').click()`);
      await publish(1, []);
      assert(await pendingCount() === 1, `${label}: first save replaces empty state`);
      assert(!await js('document.querySelector(".capture-library").textContent.includes("No clips yet")'), `${label}: no empty-state contradiction`);
      await capture(`${label}-empty-saving`);
      await publish(2, clips);
      assert(await pendingCount() === 2, `${label}: overlapping saves occupy two slots`);
      const geometry = await js(`(() => {
        const nodes = [...document.querySelectorAll('[data-pending-clip-save], [data-library-clip-id]')];
        const rects = nodes.map(node => node.getBoundingClientRect());
        const overlap = rects.some((a, i) => rects.slice(i + 1).some(b => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1));
        const slot = document.querySelector('[data-pending-clip-save]');
        return { overlap, overflow: document.documentElement.scrollWidth > innerWidth, controls: slot.querySelectorAll('button, input, [tabindex]').length, spinner: getComputedStyle(slot.querySelector('svg')).animationName };
      })()`);
      assert(!geometry.overlap && !geometry.overflow && !geometry.controls && geometry.spinner !== 'none', `${label}: slots fit without overlap, overflow, or premature actions`);
      await capture(`${label}-saving`);
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      assert(await js('getComputedStyle(document.querySelector(".capture-clip-save__spinner")).animationName === "none"'), `${label}: reduced motion keeps static saving feedback`);
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
      await publish(1, clips);
      assert(await pendingCount() === 1, `${label}: completed queue item removes one placeholder`);
      await publish(0, clips);
      assert(await pendingCount() === 0, `${label}: completion removes saving feedback`);
      await publish(1, []);
      await publish(0, [], 'error');
      assert(await pendingCount() === 0, `${label}: failed save leaves no phantom clip`);
    }
  }
  await publish(1, clips);
  await js(`(() => { const input = document.querySelector('[aria-label="Search clips"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'no-match-fixture'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await frames();
  assert(await pendingCount() === 1 && await js('document.querySelectorAll("[data-library-clip-id]").length') === 0, 'Save feedback remains visible with nonmatching filters');
  await publish(0, clips);
  assert(await js('document.querySelector(".capture-library").textContent.includes("No clips match")'), 'Filtered empty state returns after save');
  await js(`document.querySelector('[aria-label="Clear search"]').click()`);
  await publish(1, clips);
  await js(`(() => { const buttons = document.querySelector('[data-library-clip-id="save-review-0"]').querySelectorAll('button'); buttons[buttons.length - 1].focus(); })()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await frames();
  assert(await js(`document.activeElement.closest('[data-library-clip-id]')?.dataset.libraryClipId === 'save-review-1'`), 'Keyboard navigation skips pending slots and reaches the next saved clip');
  const largeLibrary = Array.from({ length: 1200 }, (_, index) => ({ ...clips[0], id: `large-${index}`, thumbnailPath: undefined, createdAt: Date.now() - index * 1000 }));
  for (const layout of ['Grid', 'List']) {
    await js(`document.querySelector('[aria-label="${layout} view"]').click()`);
    await publish(2, largeLibrary);
    for (const fraction of [0.5, 1, 0]) {
      await js(`(() => { const viewport = document.querySelector('.capture-library').closest('[data-radix-scroll-area-viewport]'); viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * ${fraction}; })()`);
      await frames();
      const scroll = await js(`(() => {
        const viewport = document.querySelector('.capture-library').closest('[data-radix-scroll-area-viewport]').getBoundingClientRect();
        const top = document.querySelector('.capture-command-header').getBoundingClientRect().bottom;
        const items = [...document.querySelectorAll('[data-library-clip-id]')];
        return { count: items.length, visible: items.some(item => { const rect = item.getBoundingClientRect(); return rect.top < viewport.bottom && rect.bottom > top; }) };
      })()`);
      assert(scroll.count < 100 && scroll.visible, `${layout}: pending slots preserve bounded, populated scroll position ${fraction} (${JSON.stringify(scroll)})`);
    }
  }
  await publish(1, clips);
  const reloaded = new Promise(resolveLoad => window.webContents.once('did-finish-load', resolveLoad));
  window.webContents.reload();
  await reloaded;
  await wait(() => js('document.querySelectorAll("[data-pending-clip-save]").length === 1'), 'pending save after reload');
  assert((await js('window.switchboard.getSnapshot()')).capture.runtime.saveQueueDepth === 1, 'Reload restores pending feedback from canonical snapshot');
  await publish(0, [{ ...clips[0], id: 'completed-save', name: 'Completed save fixture', thumbnailPath: undefined, createdAt: Date.now() }, ...clips]);
  assert(await pendingCount() === 0 && await js(`Boolean(document.querySelector('[data-library-clip-id="completed-save"]'))`), 'Saved clip replaces pending slot through snapshot update');
  await capture('completed-save');
  assert(report.errors.length === 0, 'No renderer console errors');
  report.passed = true;
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, checks: report.checks.length, output }));
  clearTimeout(watchdog);
  app.exit(0);
} catch (error) {
  report.failure = String(error.stack ?? error);
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.error(report.failure, output);
  clearTimeout(watchdog);
  app.exit(1);
} });
