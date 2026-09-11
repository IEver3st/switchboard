// Hidden native Electron acceptance for the combined replay status and duration control.
// Does not start capture, write media, or change the user's application profile.
import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-capture-status-'));
const output = join(root, '.switchboard', 'capture-status-review', String(Date.now()));
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
  state.clips.push({ ...base, id, thumbnailPath, name: `Status transition fixture ${index + 1}`, createdAt: Date.now() - index * 1000 });
}
state.capture.config.enabled = false;
state.capture.config.replaySeconds = 60;
state.capture.config.clipsDirectory = join(profile, 'Clips');
state.audio.enabled = false;
state.modules.forEach(module => { module.enabled = false; });
Object.assign(state.settings, { onboardingCompleted: true, uiScalePercent: 100, automaticUpdates: false, scanGamesAutomatically: false });
await mkdir(state.capture.config.clipsDirectory);
await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
app.setName('switchboard-capture-status-review');
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
const report = { scope: 'Hidden Electron status transitions with production preload snapshots. No live hardware recovery proof.', checks: [], screenshots: [], errors: [] };
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
let window, fixture;
let configWrites = 0;
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

const watchdog = setTimeout(() => { console.error('Status review timed out', output); app.exit(2); }, 90000);
await import('../out/main/index.js');
void app.whenReady().then(async () => { try {
  await wait(async () => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading() && await js('Boolean(window.switchboard)'); }, 'window');
  await wait(() => js("[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Capture')"), 'navigation');
  fixture = await js('window.switchboard.getSnapshot()');
  fixture.capture.config.enabled = true;
  fixture.capture.capabilities.backend = 'windows-graphics-capture';
  fixture.capture.capabilities.encoders = ['libx264'];
  ipcMain.removeHandler('system:get-snapshot');
  ipcMain.handle('system:get-snapshot', () => fixture);
  ipcMain.removeHandler('capture:set-config');
  ipcMain.handle('capture:set-config', (_event, patch) => { configWrites++; Object.assign(fixture.capture.config, patch); return fixture; });
  const send = window.webContents.send.bind(window.webContents);
  window.webContents.send = (channel, ...args) => send(channel, ...(channel === 'system:snapshot-updated' ? [fixture] : args));
  await js("location.hash = 'capture'");
  await wait(() => js('Boolean(document.querySelector("#replay-status"))'), 'Capture route');
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  window.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
  async function status(state, options = {}) {
    fixture = structuredClone(fixture);
    fixture.capture.config.enabled = options.enabled ?? true;
    fixture.capture.capabilities.backend = options.unavailable ? 'unavailable' : 'windows-graphics-capture';
    Object.assign(fixture.capture.runtime, { state, error: undefined, warning: undefined, saveQueueDepth: state === 'saving' ? 1 : 0 }, options.runtime);
    send('system:snapshot-updated', fixture);
    for (let pass = 0; pass < 4; pass++) await frames();
  }
  const cases = [
    ['buffering', 'Ready', {}], ['saving', 'Saving', {}],
    ['error', 'Replay failed', { runtime: { error: 'Source not ready' } }],
    ['recovering', 'Recovering', {}], ['waiting', 'Waiting', {}],
    ['stopped', 'Stopped', {}], ['stopped', 'Capture off', { enabled: false }],
    ['error', 'Replay failed', { unavailable: true, runtime: { error: 'Encoder unavailable' } }],
  ];
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setMinimumSize(1, 1);
    window.setContentSize(width, height);
    const [ow, oh] = window.getSize(), [cw, ch] = window.getContentSize();
    window.setSize(ow + width - cw, oh + height - ch);
    await wait(() => js(`innerWidth === ${width} && innerHeight === ${height}`), 'viewport');
    let referenceSourceX;
    for (const [state, label, options] of cases) {
      await status(state, options);
      const result = await js(`(() => {
        const status = document.querySelector('#replay-status');
        const rect = status.getBoundingClientRect();
        const source = document.querySelector('.capture-recorder-source').getBoundingClientRect();
        return { label: status.querySelector('.capture-status-transition').textContent.trim(), overflow: document.documentElement.scrollWidth > innerWidth,
          sourceX: source.x, width: rect.width,
          clipped: [...document.querySelectorAll('.capture-command-header button, .capture-command-header input')].some(n => { const r = n.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > innerWidth + 1); }) };
      })()`);
      assert(result.label === label, `${width} ${state}: confirmed label ${label} (received ${result.label})`);
      assert(!result.overflow && !result.clipped, `${width} ${state}: toolbar fits`);
      referenceSourceX ??= result.sourceX;
      assert(Math.abs(referenceSourceX - result.sourceX) < 1, `${width} ${state}: source stays in place`);
      if (['buffering', 'saving', 'error', 'recovering'].includes(state)) await capture(`${width}x${height}-${state}${options.unavailable ? '-unavailable' : ''}`);
    }
    console.log(`Status review: ${width}x${height} passed`);
  }
  await status('buffering');
  await js("document.querySelector('#replay-status').focus()");
  await status('error', { runtime: { error: 'Source not ready' } });
  assert(await js("document.activeElement.id === 'replay-status'"), 'Status changes retain keyboard focus');
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await frames();
  await wait(() => js('Boolean(document.querySelector(".capture-replay-popover"))'), 'status opens settings');
  await capture('focused-replay-settings');
  assert(await js("document.querySelectorAll('.capture-command-header .capture-recorder-settings-trigger').length === 1"), 'Status and duration share one settings control');
  await js("document.querySelector('[aria-label=\"Replay length\"]').click()");
  await wait(() => js("Boolean(document.querySelector('[role=\"option\"]'))"), 'replay lengths');
  await js("[...document.querySelectorAll('[role=\"option\"]')].find(option => option.textContent.trim() === '3 min').focus()");
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await wait(() => js("document.querySelector('#replay-status .capture-recorder-length').textContent === '3 min'"), 'combined duration after change');
  assert(fixture.capture.config.replaySeconds === 180 && configWrites === 1, 'Replay length change reaches the canonical IPC boundary exactly once');
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await frames();
  assert(await js("document.activeElement.id === 'replay-status'"), 'Popover returns focus to the status control');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await status('saving');
  assert(await js(`(() => { const s = document.querySelector('#replay-status .capture-status-transition__state'); return s.textContent === 'Saving' && getComputedStyle(s).opacity === '1' && (getComputedStyle(s).transform === 'none' || getComputedStyle(s).transform === 'matrix(1, 0, 0, 1, 0, 0)'); })()`), 'Reduced motion changes status without movement');
  await capture('reduced-motion-saving');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
  // Observe real rendered motion between two canonical states in the hidden window.
  await status('buffering');
  await js(`window.statusMotionSamples = []; window.statusMotionDone = false; (() => {
    const collect = () => {
      const nodes = [...document.querySelectorAll('#replay-status .capture-status-transition__state')];
      window.statusMotionSamples.push(nodes.map(n => ({ label: n.textContent, opacity: Number(getComputedStyle(n).opacity), transform: getComputedStyle(n).transform })));
      if (window.statusMotionSamples.length < 25) requestAnimationFrame(collect); else window.statusMotionDone = true;
    }; requestAnimationFrame(collect);
  })()`);
  fixture.capture.runtime.state = 'saving';
  send('system:snapshot-updated', structuredClone(fixture));
  for (let i = 0; i < 12; i++) await frames();
  const samples = await js('window.statusMotionSamples');
  report.motionSamples = samples;
  assert(samples.some(frame => frame.some(s => s.opacity > 0 && s.opacity < 1)), 'Rendered status swap includes intermediate opacity');
  assert(await js("document.querySelectorAll('#replay-status .capture-status-transition__state').length === 1"), 'Completed motion removes outgoing state');
  for (const state of ['error', 'saving', 'waiting', 'buffering']) {
    fixture.capture.runtime.state = state;
    fixture.capture.runtime.error = state === 'error' ? 'Fixture error' : undefined;
    send('system:snapshot-updated', structuredClone(fixture));
    await delay(25);
  }
  await capture('rapid-transition-ready');
  assert(await js("document.querySelector('#replay-status .capture-status-transition').textContent.trim() === 'Ready'"), 'Rapid changes settle on the latest state');
  window.webContents.reload();
  await wait(() => js("document.querySelector('#replay-status .capture-status-transition')?.textContent.trim() === 'Ready'"), 'snapshot after reload');
  assert(await js("document.querySelector('#replay-status .capture-recorder-length').textContent === '3 min'"), 'Combined duration reloads from the canonical snapshot');
  assert(!window.isVisible(), 'Review remained hidden');
  assert(report.errors.length === 0, `No renderer errors: ${report.errors.join('; ')}`);
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors }));
  clearTimeout(watchdog); app.exit(0);
} catch (error) {
  console.error(error); report.failure = String(error);
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.error(output); clearTimeout(watchdog); app.exit(1);
}});
