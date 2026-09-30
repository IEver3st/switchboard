// Hidden Electron UI fixture. Real preload/controller/persistence, simulated
// processor availability only. Never starts audio or changes physical endpoints.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.switchboard', 'reviews', `microphone-presets-${Date.now()}`);
const profile = await mkdtemp(join(tmpdir(), 'switchboard-eq-ui-'));
app.setName('switchboard-microphone-presets-review');
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
let rejectNextProcessor = false;
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
  if (channel === 'audio:set-mic-processor') {
    await delay(180);
    if (rejectNextProcessor) { rejectNextProcessor = false; throw new Error('Injected noise removal rejection for UI verification'); }
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
  await route('microphone');
  await ready();
  assert(!window.isVisible() && !window.isFocused(), 'Review must remain hidden');
  const suppression = async () => (await snapshot()).audio.micProcessors.find(p => p.id === 'noise-suppression');
  const noiseSwitch = '#microphone-removal-section [role="switch"]';
  const noiseSlider = '#microphone-removal-section [role="slider"]';
  const key = async value => evaluate(`document.querySelector(${JSON.stringify(noiseSlider)}).dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(value)},bubbles:true}))`);
  await api('setMicProcessor', { processorId: 'noise-suppression', enabled: true, parameters: { amount: 0 } });
  await until(() => evaluate(`document.querySelector(${JSON.stringify(noiseSwitch)})?.getAttribute('aria-checked')==='false'`), 'Zero strength was shown as on');
  await click(noiseSwitch);
  await until(() => evaluate(`document.querySelector(${JSON.stringify(noiseSwitch)})?.disabled`), 'Noise enable did not show pending');
  await until(async () => (await suppression()).parameters.amount === 55, 'Enabling zero strength did not restore a working amount');
  await until(() => evaluate(`!!document.querySelector(${JSON.stringify(noiseSlider)}) && !document.querySelector(${JSON.stringify(noiseSwitch)}).disabled`), 'Noise strength did not become editable');
  await key('End');
  await until(async () => (await suppression()).parameters.amount === 100, 'Maximum strength keyboard edit did not reach canonical state');
  await until(() => evaluate(`!document.querySelector(${JSON.stringify(noiseSwitch)}).disabled`), 'Strength edit remained pending');
  await evaluate('location.reload()');
  await until(() => evaluate(`!!document.querySelector(${JSON.stringify(noiseSlider)})`), 'Noise control did not return after reload');
  assert((await suppression()).parameters.amount === 100, 'Reload lost confirmed noise strength');
  rejectNextProcessor = true;
  await key('Home');
  await until(() => evaluate(`!!document.querySelector('[aria-label="Dismiss error"]')`), 'Rejected strength did not report an error');
  assert((await suppression()).parameters.amount === 100, 'Rejected noise edit replaced the confirmed strength');
  await click('[aria-label="Dismiss error"]');
  await until(() => evaluate(`!document.querySelector(${JSON.stringify(noiseSwitch)}).disabled`), 'Rejected noise edit retained pending state');
  await key('Home');
  await until(async () => !(await suppression()).enabled && (await suppression()).parameters.amount === 0, 'Zero strength did not disable suppression');
  await until(() => evaluate(`!document.querySelector(${JSON.stringify(noiseSwitch)}).disabled`), 'Zero strength remained pending');
  await click(noiseSwitch);
  await until(async () => (await suppression()).enabled && (await suppression()).parameters.amount === 55, 'Noise removal did not recover after zero strength');
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    await resize(width, height);
    await evaluate(`document.querySelector('#microphone-removal-section').scrollIntoView({block:'center'})`);
    const noiseLayout = await evaluate(`({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches})`);
    assert(!noiseLayout.overflow && noiseLayout.reducedMotion, `Noise control layout failed: ${JSON.stringify(noiseLayout)}`);
    await capture(`${width}x${height}-noise-removal`);
  }
  evidence.checks.push('Noise zero/off, enable, keyboard strength, pending/rejection, confirmed reload, three sizes');
  const presets = (await snapshot()).audio.pathPresets.filter(p => p.kind === 'microphone');
  for (const preset of presets) {
    await openSelect('[aria-label="microphone preset"]');
    await chooseOption(preset.name);
    await until(async () => (await snapshot()).audio.activePresetIds.microphone === preset.id, `Preset not applied: ${preset.name}`);
    await ready();
    const actual = (await snapshot()).audio.micProcessors;
    assert(JSON.stringify(actual) === JSON.stringify(preset.processors), `Incomplete chain: ${preset.name}`);
    const count = actual.find(p => p.id === 'equalizer').parameters.bands.length;
    assert(count > 6, `Expanded curve missing: ${preset.name}`);
    await until(() => evaluate(`document.querySelectorAll('.parametric-eq__band').length===${count}`), 'Missing rendered bands');
    evidence.checks.push(`${preset.name}: ${count} bands, complete canonical chain`);
  }
  await api('applyAudioPreset', { presetId: 'mic-broadcast' });
  await ready();
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    await resize(width, height);
    await evaluate(`document.querySelector('.parametric-eq__controls').scrollIntoView({block:'end'})`);
    const layout = await evaluate(`({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth || [...document.querySelectorAll('[data-radix-scroll-area-viewport]')].some(e=>e.scrollWidth>e.clientWidth+1),bands:document.querySelectorAll('.parametric-eq__band').length,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches})`);
    assert(!layout.overflow && layout.bands === 10, `Expanded EQ layout: ${JSON.stringify(layout)}`);
    evidence.layouts.push(layout);
    await capture(`${width}x${height}-broadcast`);
  }
  // Edit a band beyond the old six-band preset size using its keyboard path.
  const micBands = async () => (await snapshot()).audio.micProcessors.find(p => p.id === 'equalizer').parameters.bands;
  const before = await micBands();
  await evaluate(`document.querySelector('[aria-label="EQ band 9"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`);
  await until(async () => (await micBands())[8].gainDb === before[8].gainDb + 0.5, 'Band 9 edit lost');
  await ready();
  assert((await snapshot()).audio.activePresetIds.microphone === null, 'Edited curve must be Custom');
  await api('createAudioPreset', { kind: 'microphone', name: 'Ten-band voice review' });
  const saved = (await snapshot()).audio;
  await evaluate('location.reload()');
  await until(() => evaluate(`document.querySelectorAll('.parametric-eq__band').length===10`), 'Reload lost expanded EQ');
  assert(JSON.stringify((await snapshot()).audio.micProcessors) === JSON.stringify(saved.micProcessors), 'Reload changed sound');
  assert((await snapshot()).audio.activePresetIds.microphone === saved.activePresetIds.microphone, 'Reload lost preset identity');
  evidence.checks.push('Band 9 keyboard edit, custom preset save, canonical renderer reload');

  rejectNext = true;
  await openSelect('[aria-label="microphone preset"]');
  await chooseOption('Natural Voice');
  await until(() => evaluate(`document.querySelector('[aria-label="microphone preset"]').disabled`), 'Preset pending state missing');
  await until(() => evaluate(`!document.querySelector('[aria-label="microphone preset"]').disabled`), 'Preset pending state stuck');
  assert(JSON.stringify((await snapshot()).audio.micProcessors) === JSON.stringify(saved.micProcessors), 'Rejected preset changed sound');
  await capture('rejected-preset');
  await click('[aria-label="Dismiss error"]');
  available = false;
  await evaluate('location.reload()');
  await until(() => evaluate(`document.querySelector('[aria-label="microphone preset"]')?.disabled`), 'Unavailable preset control enabled');
  await capture('unavailable');
  evidence.checks.push('Pending preset selection, rejected selection retains sound, unavailable controls');
  assert(!lastCanonical.audio.enabled, 'Review enabled audio engine');
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
