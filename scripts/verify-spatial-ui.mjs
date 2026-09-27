// Hidden native Electron review. Real IPC/controller/persistence; fixture capabilities
// and tracker statuses. Native HRTF/UDP behavior is covered by SpatialAudioTests.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'design-qa', 'spatial-surround-20260927');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-spatial-ui-'));
app.setName('switchboard-spatial-ui-review'); app.setAppPath(root);
app.setPath('userData', profile); app.setPath('videos', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-prefers-reduced-motion');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
let available = true, rejectNext = false, trackingState = 'waiting', canonical, recenterCalls = 0, connectCalls = 0;
const evidence = { scope: 'Hidden native Electron; real offline persistence; fixture availability/tracker; no physical audio changes', profile, layouts: [], checks: [] };
const assert = (value, message) => { if (!value) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function fixture(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.audio) {
    canonical = structuredClone(value);
    assert(!value.audio.enabled, 'Review must never start the physical audio engine');
    return { ...value, engines: value.engines?.map(e => e.kind === 'audio' ? { ...e, state: 'running' } : e), audio: {
      ...value.audio, enabled: true, capabilities: { ...value.audio.capabilities, spatialAudio: available ? 'available' : 'unavailable' },
      host: { ...(value.audio.host ?? {
        running: true, capabilities: value.audio.capabilities, mixes: value.audio.mixes, applications: [], buses: [],
        driver: { state: 'not-installed', interfaceName: 'UI fixture', missingEndpoints: [], endpoints: [], message: 'UI fixture only' },
        noiseSuppression: { backend: 'Bypass', available: false, state: 'not-loaded', modelInitializationMs: 0,
          inputSampleRate: 48000, processingSampleRate: 48000, frameLength: 480, algorithmicLatencyMs: 0,
          attenuationLimitDb: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maximumMs: 0, captureCallbackP99Ms: 0,
          captureOverruns: 0, monitorUnderruns: 0, droppedOrBypassedFrames: 0, recoveryCount: 0 },
      }), spatial: { settings: value.audio.spatial, active: available && value.audio.spatial.enabled,
        trackingState: value.audio.spatial.trackingEnabled && value.audio.spatial.enabled ? trackingState : 'off', trackerName: trackingState === 'tracking' ? 'Headset sensor fixture' : null, error: trackingState === 'error' ? 'Windows sensor driver cannot start (Code 10).' : null } },
    } };
  }
  if (value.type === 'full') return { ...value, snapshot: fixture(value.snapshot) };
  if (value.type === 'patch' && value.changes?.audio) return { ...value, changes: fixture(value.changes) };
  return value;
}
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => handle(channel, async (...args) => {
  if (channel === 'audio:set-spatial') {
    await delay(220);
    if (rejectNext) { rejectNext = false; throw new Error('Injected spatial host rejection'); }
  }
  if (channel === 'audio:connect-headset-tracking') { connectCalls++; return fixture(canonical); }
  if (channel === 'audio:recenter-spatial') { recenterCalls++; return fixture(canonical); }
  return fixture(await handler(...args));
});
app.on('browser-window-created', (_event, win) => {
  win.setPosition(-10000, -10000, false); win.setFocusable(false); win.setMinimumSize(1, 1);
  win.webContents.setBackgroundThrottling(false);
  const send = win.webContents.send.bind(win.webContents);
  win.webContents.send = (channel, ...args) => send(channel, ...args.map(value => channel === 'system:snapshot-updated' ? fixture(value) : value));
});
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
let window;
const evaluate = expression => window.webContents.executeJavaScript(expression);
const api = (method, input) => evaluate(`window.switchboard[${JSON.stringify(method)}](${JSON.stringify(input) ?? ''})`);
async function until(check, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(message);
}
async function click(selector) {
  assert(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.matches(':disabled'))return false;e.click();return true})()`), `Unavailable: ${selector}`);
}
async function settled() { await until(() => evaluate(`document.querySelector('.spatial-hero')?.getAttribute('aria-busy')!=='true'`), 'Spatial controls stayed pending'); await delay(60); }
async function capture(name) {
  await delay(120); await window.webContents.capturePage(); await delay(100);
  await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
async function reload() {
  await evaluate('location.reload()');
  await until(() => evaluate(`!!document.querySelector('.spatial-page')`), 'Spatial page failed to reload');
  await settled();
}
async function run() {
  await until(() => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading(); }, 'No native window');
  await until(() => evaluate('!!window.switchboard'), 'No preload');
  await api('updateSettings', { developerMode: true, onboardingCompleted: true, visibleWorkspaces: ['audio'], uiScalePercent: 100 });
  await until(() => evaluate(`!![...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Audio')`), 'Audio navigation missing');
  await evaluate(`document.querySelector('nav button[aria-label="Audio"]')?.click(); [...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Audio')?.click()`);
  await until(() => evaluate(`!!document.querySelector('#audio-tab-spatial')`), 'Spatial tab missing');
  await delay(250);
  await click('#audio-tab-spatial');
  await evaluate(`location.hash='audio/spatial'`);
  await until(() => evaluate(`!!document.querySelector('.spatial-page')`), 'Spatial route missing');
  assert(!window.isVisible() && !window.isFocused(), 'Review must stay hidden');
  await api('getSnapshot'); assert(!canonical.audio.enabled, 'Physical audio enabled');
  await click('[aria-label="Enable spatial audio"]'); await settled();
  assert((await api('getSnapshot')).audio.spatial.enabled, 'Spatial setting did not persist');
  await click('[aria-label="Enable head tracking"]'); await settled();
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    if (window.isMaximized()) window.unmaximize();
    window.setMinimumSize(1, 1);
    window.setContentSize(width, height, false); await window.webContents.capturePage(); await delay(150);
    const actual = await evaluate('({width:innerWidth,height:innerHeight})');
    if (actual.width !== width || actual.height !== height) { const b = window.getBounds(); window.setSize(b.width + width - actual.width, b.height + height - actual.height, false); await window.webContents.capturePage(); }
    await delay(180);
    const layout = await evaluate(`({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth||[...document.querySelectorAll('[data-radix-scroll-area-viewport]')].some(e=>e.scrollWidth>e.clientWidth+1),trackingBottom:document.querySelector('.spatial-tracking__row').getBoundingClientRect().bottom,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches})`);
    assert(!layout.overflow && layout.trackingBottom < height, 'Critical spatial controls overflow');
    assert(layout.width === width && layout.height === height, `Wrong native size: ${JSON.stringify(layout)} requested ${width}x${height}`);
    evidence.layouts.push(layout); await capture(`${width}x${height}`);
  }
  async function textButton(text, scope = '.spatial-page') {
    await evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!b)throw new Error('Missing button');b.click()})()`); await settled();
  }
  assert(await evaluate(`document.querySelectorAll('.spatial-speaker').length===7`), 'Seven speaker controls missing');
  await textButton('Cinema');
  assert((await api('getSnapshot')).audio.spatial.immersion === .9, 'Room preset did not persist');
  for (const [label, key, field, expected] of [['Immersion', 'Right', 'immersion', .95], ['Effect amount', 'Left', 'amount', .95]]) {
    await evaluate(`document.querySelector('[role="slider"][aria-label="${label}"]').focus()`);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    await until(async () => (await api('getSnapshot')).audio.spatial[field] === expected, `${label} keyboard commit failed`); await settled();
  }
  await click('.spatial-speaker[aria-label^="Rear left,"]');
  await evaluate(`document.querySelector('.spatial-speaker[aria-label^="Rear left,"]').focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' });
  await settled();
  assert((await api('getSnapshot')).audio.spatial.speakers.find(s=>s.id==='rear-left').azimuth === -145, 'Speaker keyboard position did not persist');
  for (const [label, value, field] of [['Height', '35', 'elevation'], ['Level', '-4', 'gainDb'], ['Distance scale', '1.8', 'distance']]) {
    await evaluate(`(()=>{const e=document.querySelector('.spatial-speaker-card input[aria-label="${label}"]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'${value}');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
    await delay(40); await evaluate(`document.querySelector('.spatial-speaker-card input[aria-label="${label}"]').dispatchEvent(new FocusEvent('focusout', {bubbles:true}))`); await settled();
    assert((await api('getSnapshot')).audio.spatial.speakers.find(s=>s.id==='rear-left')[field] === Number(value), `${label} did not persist`);
  }
  await click('.spatial-speaker-card [role="switch"]'); await settled();
  assert(!(await api('getSnapshot')).audio.spatial.speakers.find(s=>s.id==='rear-left').enabled, 'Speaker mute did not persist');
  await textButton('Stereo');
  assert(await evaluate(`document.querySelectorAll('.spatial-speaker').length===2 && !document.querySelector('input[aria-label="Angle"]')`), 'Stereo map does not match renderer');
  await textButton('7 speakers'); await textButton('Cinema');
  assert((await api('getSnapshot')).audio.spatial.trackingSource === 'headset', 'Built-in sensor is not the default');
  trackingState = 'error'; await reload();
  await textButton('Connect headset sensor');
  assert(connectCalls === 1, 'Sensor setup did not reach narrow IPC'); await capture('headset-driver-error');
  trackingState = 'waiting'; await textButton('OpenTrack');
  await evaluate(`(()=>{const e=document.querySelector('#spatial-port');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'4243');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await delay(50); await click('.spatial-port button'); await settled();
  assert((await api('getSnapshot')).audio.spatial.trackerPort === 4243, 'Tracker port did not persist');
  await capture('tracker-setup');
  await reload();
  assert((await api('getSnapshot')).audio.spatial.trackingEnabled, 'Tracking preference lost on reload');
  trackingState = 'tracking'; await reload();
  await textButton('Center stage'); await settled();
  assert(recenterCalls === 1, 'Recenter did not reach narrow IPC'); await capture('tracking-centered');
  trackingState = 'stale'; await reload();
  assert(await evaluate(`[...document.querySelectorAll('.spatial-tracking__row button')].find(e=>e.textContent.includes('Center stage')).disabled`), 'Stale tracker allowed recenter'); await capture('tracking-stale');
  rejectNext = true;
  await evaluate(`[...document.querySelectorAll('.spatial-controls button')].find(e=>e.textContent==='Natural').click()`); await delay(30);
  assert(await evaluate(`document.querySelector('.spatial-hero').getAttribute('aria-busy')==='true'`), 'Pending state was not exposed');
  await settled();
  assert((await api('getSnapshot')).audio.spatial.immersion === .9, 'Rejected edit changed canonical state');
  assert(await evaluate(`document.querySelector('.spatial-error')?.textContent.includes('Injected')`), 'Rejected write error missing'); await capture('rejected-write');
  await click('[aria-label="Enable spatial audio"]'); await settled();
  assert(!(await api('getSnapshot')).audio.spatial.enabled, 'Bypass did not persist');
  assert(await evaluate(`document.querySelector('[aria-label="Enable head tracking"]').disabled`), 'Bypassed stage left tracker editable'); await capture('bypass');
  available = false; await reload();
  assert(await evaluate(`document.querySelector('[aria-label="Enable spatial audio"]').disabled`), 'Unavailable control still enabled'); await capture('unavailable');
  evidence.checks.push('Seven speakers, keyboard position, height/distance/level/mute, room presets, stereo layout, built-in sensor default/setup IPC, OpenTrack, reload, tracking/stale/error, recenter, pending/rejected writes, bypass/unavailable, reduced motion');
  evidence.canonicalEngineEnabled = canonical.audio.enabled;
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: true, output, evidence })); app.quit();
}
void app.whenReady().then(run).catch(async error => {
  console.error(error); if (window && !window.isDestroyed()) await capture('failure').catch(() => {});
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1'; app.quit();
});
