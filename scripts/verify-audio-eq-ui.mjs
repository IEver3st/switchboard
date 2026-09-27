// Hidden Electron UI fixture. Real preload/controller/persistence, simulated
// processor availability only. Never starts audio or changes physical endpoints.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'design-qa', 'audio-eq-20260927');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-eq-ui-'));
app.setName('switchboard-eq-ui-review');
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
    return { ...value, audio: { ...value.audio, enabled: true, capabilities: { ...value.audio.capabilities, channelDsp: available ? 'simulation' : 'unavailable', microphoneDsp: available ? 'available' : 'unavailable' } } };
  }
  if (value.type === 'full') return { ...value, snapshot: fixture(value.snapshot) };
  if (value.type === 'patch' && value.changes?.audio) return { ...value, changes: fixture(value.changes) };
  return value;
}
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => handle(channel, async (...args) => {
  if (channel === 'audio:set-channel-processor') {
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
const gameBands = async () => (await snapshot()).audio.channelProcessing.find(p => p.busId === 'game').equalizer.bands;
async function setBands(bands) { await api('setAudioChannelProcessor', { busId: 'game', processorId: 'equalizer', parameters: { bands } }); }

async function run() {
  await until(async () => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading(); }, 'No native review window');
  await until(() => evaluate('!!window.switchboard && document.body.innerText.length > 0'), 'Renderer unavailable');
  await api('updateSettings', { developerMode: true, onboardingCompleted: true, visibleWorkspaces: ['audio'], uiScalePercent: 100 });
  await route('game');
  await ready();
  assert(!window.isVisible() && !window.isFocused(), 'Review window must remain hidden');
  await snapshot();
  assert(!lastCanonical.audio.enabled, 'Audio engine unexpectedly enabled');
  await window.webContents.insertCSS('body::after { content: "UI fixture · audio engine off"; position: fixed; bottom: 4px; right: 12px; color: #aab3c2; font: 10px system-ui; pointer-events:none; }');
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    await resize(width, height);
    for (const tab of ['game', 'chat', 'media', 'microphone']) {
      await route(tab);
      const layout = await evaluate(`({ width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth || [...document.querySelectorAll('[data-radix-scroll-area-viewport]')].some(e=>e.scrollWidth>e.clientWidth+1),controlsBottom:document.querySelector('.parametric-eq__controls').getBoundingClientRect().bottom,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches })`);
      assert(!layout.overflow, `${tab} horizontal overflow`);
      if (tab !== 'microphone') assert(layout.controlsBottom < height, `${tab} EQ controls below viewport`);
      evidence.layouts.push({ tab, ...layout });
      await capture(`${width}x${height}-${tab}`);
      if (tab === 'microphone' && layout.controlsBottom >= height) {
        await evaluate(`document.querySelector('.parametric-eq__controls').scrollIntoView({block:'end'})`);
        await capture(`${width}x${height}-${tab}-eq`);
        await evaluate(`document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach(el=>el.scrollTo(0,0))`);
      }
    }
  }
  await route('game');
  await resize(1420, 900);
  const before = await gameBands();
  const point = await evaluate(`(()=>{
    const svg=document.querySelector('.parametric-eq__graph');
    const curve=svg.querySelector('path[stroke-width="2.5"]');
    const nodes=[...svg.querySelectorAll('[role="slider"]')];
    const matrix=svg.getScreenCTM();
    for(let fraction=0.2;fraction<0.9;fraction+=0.035){
      const point=curve.getPointAtLength(curve.getTotalLength()*fraction);
      if(nodes.some(node=>Math.hypot(Number(node.getAttribute('cx'))-point.x,Number(node.getAttribute('cy'))-point.y)<25)) continue;
      const screen=new DOMPoint(point.x,point.y).matrixTransform(matrix);
      return {x:Math.round(screen.x),y:Math.round(screen.y)};
    }
    throw new Error('No open curve point for hover-add review');
  })()`);
  window.webContents.sendInputEvent({ type: 'mouseMove', ...point });
  await until(() => evaluate(`!!document.querySelector('.parametric-eq__add-marker')`), 'Hover plus missing');
  await capture('hover-add');
  window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
  window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
  await until(async () => (await gameBands()).length === before.length + 1, 'Hover add did not reach canonical state');
  await ready();
  const added = (await gameBands()).at(-1);
  assert(added.gainDb === 0 && added.type === 'bell', 'New band must be neutral');
  const addedNumber = before.length + 1;
  assert(await evaluate(`document.querySelector('.parametric-eq__band.is-selected')?.textContent.trim()==='${addedNumber}'`), 'New band selection lost during pending write');
  await evaluate(`document.querySelector('[aria-label="EQ band ${addedNumber}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`);
  await until(async () => (await gameBands()).at(-1).gainDb === 0.5, 'Keyboard band edit failed');
  await ready();
  await openSelect('[aria-label="EQ band filter type"]');
  await chooseOption('High shelf');
  await until(async () => (await gameBands()).at(-1).type === 'high-shelf', 'Filter type did not reach canonical state');
  await ready();
  await click(`[aria-label="Remove EQ band ${addedNumber}"]`);
  await until(async () => (await gameBands()).length === before.length, 'Band removal failed');
  await ready();
  rejectNext = true;
  await click('[aria-label="Add EQ band"]');
  await delay(70);
  assert(await evaluate(`document.querySelector('[aria-label="Add EQ band"]').disabled`), 'Pending edit remained enabled');
  await ready();
  assert((await gameBands()).length === before.length, 'Rejected edit altered canonical bands');
  await until(() => evaluate(`document.querySelectorAll('.parametric-eq__band').length===${before.length}`), 'Rejected draft did not restore');
  await click('[aria-label="Dismiss error"]');
  evidence.checks.push('hover insertion, keyboard edit, remove, pending exclusion, rejected edit rollback');

  const many = Array.from({ length: 64 }, (_, i) => ({ ...before[0], id: `review-${i}`, type: 'bell', frequency: Math.round(20 * 1_000 ** (i / 63)), gainDb: 0 }));
  await setBands(many);
  await until(() => evaluate(`document.querySelectorAll('.parametric-eq__band').length===64`), '64 bands not shown');
  assert(await evaluate(`document.querySelector('[aria-label="Add EQ band"]').disabled`), 'Capacity limit not enforced');
  await resize(1080, 720);
  await capture('1080x720-64-bands');
  assert(await evaluate(`document.querySelector('.parametric-eq__controls').getBoundingClientRect().bottom<innerHeight && document.documentElement.scrollWidth<=innerWidth`), 'Large EQ obscures controls');
  await click('[aria-label="Save custom settings as preset"]');
  await evaluate(`(()=>{const el=document.querySelector('[aria-label="Preset name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'EQ review 64 bands');el.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await until(() => evaluate(`!document.querySelector('.preset-picker__editor button').disabled`), 'Preset name not accepted');
  await capture('1080x720-save-preset');
  await click('.preset-picker__editor button');
  await until(async () => (await snapshot()).audio.pathPresets.some(p => p.name === 'EQ review 64 bands'), 'Save preset control did not persist the preset');
  await evaluate('location.reload()');
  await until(() => evaluate(`document.querySelectorAll('.parametric-eq__band').length===64`), 'Renderer reload lost bands');
  assert((await gameBands()).length === 64, 'Canonical reload lost bands');
  await setBands([]);
  await ready();
  await capture('1080x720-empty');
  await click('[aria-label="Add EQ band"]');
  await until(async () => (await gameBands()).length === 1, 'Empty editor could not add a band');
  await ready();
  await api('setAudioChannelProcessor', { busId: 'game', processorId: 'equalizer', enabled: false });
  assert(await evaluate(`document.querySelector('[aria-label="Add EQ band"]').disabled`), 'Bypassed EQ accepts additions');
  await capture('1080x720-bypassed');
  await openSelect('[aria-label="game preset"]');
  await capture('1080x720-presets');
  await chooseOption('Night play');
  const nightBands = (await snapshot()).audio.pathPresets.find(p => p.id === 'game-night').processors.equalizer.bands.length;
  await until(() => evaluate(`document.querySelector('[aria-label="game preset"]').textContent==='Night play' && document.querySelectorAll('.parametric-eq__band').length===${nightBands}`), 'Preset UI did not update');
  await ready();
  assert((await gameBands()).length === nightBands, 'New preset did not apply');
  await capture('1080x720-night-play');
  available = false;
  await evaluate('location.reload()');
  await until(() => evaluate(`!!document.querySelector('[aria-label="Add EQ band"]') && document.querySelector('[aria-label="Add EQ band"]').disabled`), 'Unavailable state not disabled');
  await capture('1080x720-unavailable');
  evidence.checks.push('64-band overflow and limit, preset save control, renderer reload, empty recovery, bypass, new preset, unavailable state');
  evidence.canonicalEngineEnabled = lastCanonical.audio.enabled;
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
