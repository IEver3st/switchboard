// Hidden Electron UI fixture. Real preload/controller/persistence, simulated
// processor availability only. Never starts audio or changes physical endpoints.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'design-qa', 'channel-presets-20260927');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-eq-ui-'));
app.setName('switchboard-channel-presets-review');
app.setAppPath(root);
app.setPath('userData', profile);
app.setPath('videos', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-prefers-reduced-motion');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
let available = true;
let rejectNext = false;
let lastCanonical;
const evidence = { profile, scope: 'Hidden native UI; simulated availability; real offline IPC and persistence; no audio playback', layouts: [], checks: [] };
function fixture(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.audio) {
    lastCanonical = structuredClone(value);
    if (value.audio.enabled) throw new Error('Review must keep the audio engine off');
    return { ...value, audio: { ...value.audio, enabled: true, capabilities: { ...value.audio.capabilities, channelDsp: available ? 'simulation' : 'unavailable', microphoneDsp: available ? 'available' : 'unavailable', noiseSuppression: available ? 'available' : 'unavailable' } } };
  }
  if (value.type === 'full') return { ...value, snapshot: fixture(value.snapshot) };
  if (value.type === 'patch' && value.changes?.audio) return { ...value, changes: fixture(value.changes) };
  return value;
}
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => handle(channel, async (...args) => {
  if (channel === 'audio:apply-preset') {
    await delay(180);
    if (rejectNext) { rejectNext = false; throw new Error('Injected EQ rejection for UI verification'); }
  }
  return fixture(await handler(...args));
});
app.on('browser-window-created', (_event, window) => {
  window.setPosition(-10_000, -10_000, false);
  window.setFocusable(false);
  window.setMinimumSize(1, 1);
  window.webContents.setBackgroundThrottling(false);
  const send = window.webContents.send.bind(window.webContents);
  window.webContents.send = (channel, ...args) => send(channel, ...args.map(value => channel === 'system:snapshot-updated' ? fixture(value) : value));
});
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
let window;
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const evaluate = expression => window.webContents.executeJavaScript(expression);
const api = (method, input) => evaluate(`window.switchboard[${JSON.stringify(method)}](${JSON.stringify(input) ?? ''})`);
const snapshot = () => api('getSnapshot');
const assert = (value, message) => { if (!value) throw new Error(message); };
async function until(check, message) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  throw new Error(message);
}
async function click(selector) {
  assert(await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el || el.disabled)return false;el.click();return true})()`), `Unavailable control: ${selector}`);
  await delay(40);
}
async function route(tab) {
  await evaluate(`(()=>{const button=[...document.querySelectorAll('nav button')].find(el=>el.textContent.trim()==='Audio');button?.click()})()`);
  await until(() => evaluate(`!!document.querySelector('#audio-tab-game')`), 'Audio navigation unavailable');
  await evaluate(`location.hash='audio/${tab}'`);
  await until(() => evaluate(`!!document.querySelector('#audio-panel-${tab} .parametric-eq')`), `Route ${tab} unavailable`);
}
async function ready() {
  await until(() => evaluate(`!!document.querySelector('[aria-label="Add EQ band"]') && !document.querySelector('[aria-label="Add EQ band"]').disabled`), 'EQ did not become editable');
}
async function openSelect(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`);
  await until(() => evaluate(`!!document.querySelector('[role="listbox"]')`), 'Select menu did not open');
}
async function chooseOption(name) {
  assert(await evaluate(`(()=>{const el=[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.startsWith(${JSON.stringify(name)}));if(!el)return false;el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return true})()`), `Option missing: ${name}`);
  await until(() => evaluate(`!document.querySelector('[role="listbox"]')`), 'Select menu did not close');
}
async function capture(name) {
  await delay(100);
  // Hidden windows may return the preceding compositor frame on the first capture.
  await window.webContents.capturePage();
  await delay(100);
  await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
async function resize(width, height) {
  if (window.isMaximized()) window.unmaximize();
  window.setMinimumSize(1, 1);
  window.setContentSize(width, height, false);
  await window.webContents.capturePage();
  await delay(150);
  const actual = await evaluate('({width:innerWidth,height:innerHeight})');
  if (actual.width !== width || actual.height !== height) {
    const bounds = window.getBounds();
    window.setSize(bounds.width + width - actual.width, bounds.height + height - actual.height, false);
    await window.webContents.capturePage();
  }
  await until(() => evaluate(`innerWidth===${width} && innerHeight===${height}`), `Wrong native viewport: ${JSON.stringify({ requested:[width,height],actual:await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'),bounds:window.getBounds(),content:window.getContentBounds() })}`);
}

async function run() {
  await until(() => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading(); }, 'No native window');
  await until(() => evaluate('!!window.switchboard'), 'No preload');
  await api('updateSettings', { developerMode: true, onboardingCompleted: true, visibleWorkspaces: ['audio'], uiScalePercent: 100 });
  assert(!window.isVisible() && !window.isFocused(), 'Review must remain hidden');
  const allPresets = (await snapshot()).audio.pathPresets;
  const featured = { game: 'game-competitive-fps', chat: 'chat-clear-voice', media: 'media-music' };
  for (const busId of ['game', 'chat', 'media']) {
    await route(busId);
    await ready();
    const processing = async () => (await snapshot()).audio.channelProcessing.find(p => p.busId === busId);
    for (const preset of allPresets.filter(p => p.kind === busId)) {
      const before = (await snapshot()).audio;
      await openSelect(`[aria-label="${busId} preset"]`);
      await chooseOption(preset.name);
      await until(async () => (await snapshot()).audio.activePresetIds[busId] === preset.id, `Preset not applied: ${preset.id}`);
      await ready();
      const { busId: _busId, ...actual } = await processing();
      assert(JSON.stringify(actual) === JSON.stringify(preset.processors), `Incomplete processing chain: ${preset.id}`);
      const audio = (await snapshot()).audio;
      assert(JSON.stringify(audio.channelProcessing.filter(p => p.busId !== busId)) === JSON.stringify(before.channelProcessing.filter(p => p.busId !== busId)), 'Another output channel changed');
      assert(JSON.stringify(audio.micProcessors) === JSON.stringify(before.micProcessors), 'Microphone changed');
      const count = actual.equalizer.bands.length;
      assert(count > 6, `Expanded curve missing: ${preset.id}`);
      await until(() => evaluate(`document.querySelectorAll('.parametric-eq__band').length===${count}`), 'Missing rendered bands');
      evidence.checks.push(`${preset.id}: ${count} bands, complete isolated processing chain`);
    }
    await api('applyAudioPreset', { presetId: featured[busId] });
    await ready();
    for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
      await resize(width, height);
      const layout = await evaluate(`({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth || [...document.querySelectorAll('[data-radix-scroll-area-viewport]')].some(e=>e.scrollWidth>e.clientWidth+1),controlsBottom:document.querySelector('.parametric-eq__controls').getBoundingClientRect().bottom,bands:document.querySelectorAll('.parametric-eq__band').length,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches})`);
      assert(!layout.overflow && layout.controlsBottom <= height, `Expanded EQ layout: ${busId} ${JSON.stringify(layout)}`);
      evidence.layouts.push({ busId, ...layout });
      await capture(`${width}x${height}-${busId}`);
    }
    const before = await processing();
    await evaluate(`document.querySelector('[aria-label="EQ band 8"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`);
    await until(async () => (await processing()).equalizer.bands[7].gainDb === before.equalizer.bands[7].gainDb + 0.5, 'Band 8 edit lost');
    await ready();
    assert((await snapshot()).audio.activePresetIds[busId] === null, 'Edited curve must be Custom');
    await api('createAudioPreset', { kind: busId, name: `Expanded ${busId} review` });
    const saved = (await snapshot()).audio;
    await evaluate('location.reload()');
    await until(() => evaluate(`!!document.querySelector('#audio-panel-${busId} .parametric-eq')`), 'Channel did not reload');
    await ready();
    assert(JSON.stringify(await processing()) === JSON.stringify(saved.channelProcessing.find(p => p.busId === busId)), 'Reload changed sound');
    assert((await snapshot()).audio.activePresetIds[busId] === saved.activePresetIds[busId], 'Reload lost preset identity');

    rejectNext = true;
    await openSelect(`[aria-label="${busId} preset"]`);
    await chooseOption(allPresets.find(p => p.id === featured[busId]).name);
    await until(() => evaluate(`document.querySelector('[aria-label="${busId} preset"]').disabled`), 'Preset pending state missing');
    await until(() => evaluate(`!document.querySelector('[aria-label="${busId} preset"]').disabled`), 'Preset pending state stuck');
    assert(JSON.stringify(await processing()) === JSON.stringify(saved.channelProcessing.find(p => p.busId === busId)), 'Rejected preset changed sound');
    await click('[aria-label="Dismiss error"]');
    evidence.checks.push(`${busId}: band 8 keyboard edit, save, canonical reload, pending state, rejected preset rollback`);
  }
  available = false;
  await evaluate('location.reload()');
  await until(() => evaluate(`document.querySelector('[aria-label="Add EQ band"]')?.disabled`), 'Unavailable EQ remains editable');
  await capture('unavailable');
  assert(!lastCanonical.audio.enabled, 'Review enabled audio engine');
  evidence.checks.push('Unavailable processing state; audio engine remained off throughout');
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: true, output, checks: evidence.checks }));
  app.quit();
}
void app.whenReady().then(run).catch(async error => {
  console.error(error);
  if (window && !window.isDestroyed()) await capture('failure').catch(() => {});
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1';
  app.quit();
});

