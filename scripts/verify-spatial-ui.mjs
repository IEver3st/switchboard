// Hidden native Electron review of per-channel spatial audio on the Game, Chat and Media pages.
// Real IPC/controller/persistence; fixture capability and host echo only. Native HRTF, per-channel
// independence and tracker behavior are covered by SpatialAudioTests.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'design-qa', 'spatial-channels-20260927');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-spatial-ui-'));
app.setName('switchboard-spatial-ui-review'); app.setAppPath(root);
app.setPath('userData', profile); app.setPath('videos', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-prefers-reduced-motion');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
let canonical, lastAudio;
const assert = (value, message) => { if (!value) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const anyEnabled = spatial => ['game', 'chat', 'media'].some(id => spatial.channels[id].enabled);
function fixture(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.audio) {
    canonical = structuredClone(value); lastAudio = structuredClone(value.audio);
    assert(!value.audio.enabled, 'Review must never start the physical audio engine');
    return { ...value, audio: { ...value.audio, enabled: true,
      capabilities: { ...value.audio.capabilities, spatialAudio: 'available', channelDsp: 'available' },
      host: { ...(value.audio.host ?? { running: true, capabilities: value.audio.capabilities, mixes: value.audio.mixes, applications: [], buses: [],
        driver: { state: 'ready', interfaceName: 'UI fixture', missingEndpoints: [], endpoints: [], message: 'UI fixture only' },
        noiseSuppression: { backend: 'Bypass', available: false, state: 'not-loaded', modelInitializationMs: 0,
          inputSampleRate: 48000, processingSampleRate: 48000, frameLength: 480, algorithmicLatencyMs: 0,
          attenuationLimitDb: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maximumMs: 0, captureCallbackP99Ms: 0,
          captureOverruns: 0, monitorUnderruns: 0, droppedOrBypassedFrames: 0, recoveryCount: 0 } }),
        spatial: { settings: value.audio.spatial, active: anyEnabled(value.audio.spatial), trackingState: value.audio.spatial.trackingEnabled && anyEnabled(value.audio.spatial) ? 'waiting' : 'off', trackerName: null, error: null } } } };
  }
  if (value.type === 'full') return { ...value, snapshot: fixture(value.snapshot) };
  // Patches can carry part of the audio branch; merge onto the last full audio state first.
  if (value.type === 'patch' && value.changes?.audio) return { ...value, changes: fixture({ ...value.changes, audio: { ...lastAudio, ...value.changes.audio } }) };
  return value;
}
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => handle(channel, async (...args) => fixture(await handler(...args)));
app.on('browser-window-created', (_event, win) => {
  win.setPosition(-10000, -10000, false); win.setFocusable(false); win.setMinimumSize(1, 1);
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message', (event) => { if (event.level === 'error' || event.level === 'warning') console.log('RENDERER', event.level, String(event.message).slice(0, 400)); });
  const send = win.webContents.send.bind(win.webContents);
  win.webContents.send = (channel, ...args) => {
    try { return send(channel, ...args.map(value => channel === 'system:snapshot-updated' ? fixture(value) : value)); }
    catch (error) { console.error('FIXTURE', channel, error); throw error; }
  };
});
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
let window;
const evaluate = expression => window.webContents.executeJavaScript(expression);
const snapshot = () => evaluate('window.switchboard.getSnapshot()');
async function until(check, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(message);
}
async function openTab(tab) {
  await evaluate(`document.querySelector('#audio-tab-${tab}').click()`);
  await until(() => evaluate(`!!document.querySelector('#${tab}-spatial-section')`), `${tab} spatial module missing`);
  await delay(150);
}
async function run() {
  await until(() => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading(); }, 'No native window');
  await until(() => evaluate('!!window.switchboard'), 'No preload');
  await evaluate(`window.switchboard.updateSettings({ developerMode: true, onboardingCompleted: true, visibleWorkspaces: ['audio'], uiScalePercent: 100 })`);
  await until(() => evaluate(`!![...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Audio')`), 'Audio navigation missing');
  await evaluate(`[...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Audio').click()`);
  await until(() => evaluate(`!!document.querySelector('#audio-tab-game')`), 'Audio tabs missing');
  assert(!(await evaluate(`!!document.querySelector('#audio-tab-spatial')`)), 'The global Spatial tab still exists');
  await openTab('game');
  await evaluate(`document.querySelector('[aria-label="Turn on spatial audio for game"]').click()`);
  await until(async () => (await snapshot()).audio.spatial.channels.game.enabled, 'Game spatial did not persist');
  assert(!(await snapshot()).audio.spatial.channels.chat.enabled, 'Enabling Game changed Chat');
  await evaluate(`[...document.querySelectorAll('#game-spatial-section [role="radio"]')].find(e=>e.textContent==='Cinema').click()`);
  await until(async () => (await snapshot()).audio.spatial.channels.game.immersion === .9, 'Game room did not persist');
  assert((await snapshot()).audio.spatial.channels.media.immersion === .4, 'Game room leaked into Media');
  await evaluate(`document.querySelector('#game-spatial-section [aria-label="Enable head tracking"]').click()`);
  await until(async () => (await snapshot()).audio.spatial.trackingEnabled, 'Shared head tracking did not persist');
  await openTab('media');
  assert(await evaluate(`document.querySelector('#media-spatial-section [aria-label="Enable head tracking"]').getAttribute('data-state')==='checked'`), 'Head tracking is not shared across channels');
  assert(await evaluate(`!!document.querySelector('#media-spatial-section.is-disabled')`), 'Media spatial should still be off');
  await openTab('game');
  const layouts = [];
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    if (window.isMaximized()) window.unmaximize();
    window.setMinimumSize(1, 1);
    window.setContentSize(width, height, false); await window.webContents.capturePage(); await delay(200);
    const viewport = await evaluate('({width:innerWidth,height:innerHeight})');
    const bounds = window.getBounds();
    window.setSize(bounds.width + width - viewport.width, bounds.height + height - viewport.height, false);
    await window.webContents.capturePage();
    await until(() => evaluate(`innerWidth === ${width} && innerHeight === ${height}`), 'Native viewport mismatch');
    await evaluate(`document.querySelector('#game-spatial-section').scrollIntoView({block:'start'})`); await delay(100);
    const layout = await evaluate(`(()=>{const m=document.querySelector('#game-spatial-section').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth||[...document.querySelectorAll('[data-radix-scroll-area-viewport]')].some(e=>e.scrollWidth>e.clientWidth+1),moduleHeight:Math.round(m.height),page:(()=>{const v=document.querySelector('.audio-channel').closest('[data-radix-scroll-area-viewport]')||document.scrollingElement;return [v.scrollHeight,v.clientHeight]})(),parts:Object.fromEntries([['eq','.audio-panel--eq'],['spatial','#game-spatial-section'],['grid','.audio-panel-grid']].map(([k,q])=>[k,Math.round(document.querySelector(q).getBoundingClientRect().height)])),moduleOverflow:document.querySelector('#game-spatial-section').scrollWidth>m.width+1}})()`);
    assert(!layout.overflow && !layout.moduleOverflow, `Layout overflow: ${JSON.stringify(layout)}`);
    layouts.push(layout);
    await writeFile(join(output, `game-${width}x${height}.png`), (await window.webContents.capturePage()).toPNG());
  }
  await evaluate('location.reload()');
  await until(() => evaluate('!!window.switchboard'), 'Reload failed');
  const restored = (await snapshot()).audio.spatial;
  assert(restored.channels.game.enabled && restored.channels.game.immersion === .9 && !restored.channels.chat.enabled && restored.trackingEnabled, 'Per-channel settings lost on reload');
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ scope: 'Hidden native Electron; real persistence; fixture capability', layouts, canonicalEngineEnabled: canonical.audio.enabled }, null, 2));
  console.log(JSON.stringify({ passed: true, layouts })); app.quit();
}
void app.whenReady().then(run).catch(async error => {
  console.error(error); if (window && !window.isDestroyed()) await writeFile(join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG()).catch(() => {});
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1'; app.quit();
});
