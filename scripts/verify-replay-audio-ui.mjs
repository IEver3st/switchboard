// Hidden native Electron review. Availability is a fixture; configuration uses
// the production controller, preload and isolated persisted profile. No engines.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-replay-audio-ui-'));
const output = join(root, '.switchboard', 'replay-audio-review', String(Date.now()));
await mkdir(output, { recursive: true });
app.setName('switchboard-replay-audio-review');
app.setAppPath(root);
app.setPath('userData', profile);
app.setPath('videos', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-prefers-reduced-motion');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
delete process.env.ELECTRON_RENDERER_URL;
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = function () { throw Error('Review must stay hidden'); };
BrowserWindow.prototype.focus = function () {};
let available = true, audioEnabled = true, rejectNext = false;
let canonical, window;
const evidence = { scope: 'Hidden Electron with simulated capabilities; real offline IPC and persistence; no live audio', checks: [], screenshots: [] };
const diagnostics = {
  backend: 'fixture', available: false, state: 'not-loaded', modelInitializationMs: 0,
  inputSampleRate: 48000, processingSampleRate: 48000, frameLength: 480, algorithmicLatencyMs: 0,
  attenuationLimitDb: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maximumMs: 0, captureCallbackP99Ms: 0,
  captureOverruns: 0, monitorUnderruns: 0, droppedOrBypassedFrames: 0, recoveryCount: 0,
};
function fixture(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'full') return { ...value, snapshot: fixture(value.snapshot) };
  if (value.type === 'patch') return { ...value, changes: fixture(value.changes) };
  if (value.audio || value.capture) {
    if (value.settings) canonical = structuredClone(value);
    const next = structuredClone(value);
    if (next.audio) {
      if (next.audio.enabled) throw Error('Real audio must stay off');
      next.audio.enabled = audioEnabled;
      Object.assign(next.audio.capabilities, { clipTracks: available ? 'available' : 'unavailable', processedMicrophoneCapture: available ? 'available' : 'unavailable' });
      next.audio.host = { running: available, capabilities: next.audio.capabilities, noiseSuppression: diagnostics,
        driver: { state: 'not-installed', interfaceName: 'Fixture', missingEndpoints: [], endpoints: [], message: 'Fixture only' },
        applications: [], buses: [], mixes: next.audio.mixes };
    }
    if (next.capture) {
      if (next.capture.config.enabled) throw Error('Real replay must stay off');
      Object.assign(next.capture.capabilities, { systemAudio: true, microphoneAudio: true });
    }
    return next;
  }
  return value;
}
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => handle(channel, async (...args) => {
  if (channel === 'capture:set-config') {
    await new Promise(done => setTimeout(done, 180));
    if (rejectNext) { rejectNext = false; throw Error('Fixture rejected audio change'); }
  }
  return fixture(await handler(...args));
});
app.on('browser-window-created', (_event, win) => {
  win.setPosition(-20000, -20000, false);
  win.setMinimumSize(1, 1);
  win.webContents.setBackgroundThrottling(false);
  win.webContents.setAudioMuted(true);
  const send = win.webContents.send.bind(win.webContents);
  win.webContents.send = (channel, ...args) => send(channel, ...args.map(value => channel === 'system:snapshot-updated' ? fixture(value) : value));
});
const delay = ms => new Promise(done => setTimeout(done, ms));
const js = async expression => { try { return await window.webContents.executeJavaScript(expression); } catch (error) { throw new Error(`${expression}: ${error}`); } };
const api = (method, value) => js(`window.switchboard[${JSON.stringify(method)}](${JSON.stringify(value) ?? ''})`);
const assert = (value, message) => { if (!value) throw Error(message); evidence.checks.push(message); };
async function wait(test, label) {
  const end = Date.now() + 12000;
  while (Date.now() < end) { if (await test()) return; await delay(60); }
  throw Error(`Timed out: ${label}`);
}
async function refresh() { await api('getSnapshot'); window.webContents.send('system:snapshot-updated', canonical); await delay(250); }
async function capture(name) {
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await delay(150);
  await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  evidence.screenshots.push(name);
}
async function openInputs() {
  await js("location.hash = 'capture'");
  await wait(() => js('!!document.querySelector("#replay-status")'), 'capture route');
  if (!await js('!!document.querySelector("[aria-label=\\\"Replay configuration\\\"]")')) await js('document.querySelector("#replay-status").click()');
  await wait(() => js("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Advanced settings'))"), 'advanced settings');
  await js("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Advanced settings') && b.getAttribute('aria-expanded') === 'false')?.click()");
  await wait(() => js('!!document.querySelector("[aria-label=\\\"Replay audio inputs\\\"]")'), 'audio inputs');
  await js('document.querySelector("[aria-label=\\\"Replay audio inputs\\\"]").scrollIntoView({block:"center"})');
  await delay(250);
}
const watchdog = setTimeout(() => { console.error('Review timeout', output); app.exit(2); }, 120000);
await import('../out/main/index.js');
void app.whenReady().then(async () => { try {
  await wait(async () => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading() && await js('!!window.switchboard'); }, 'native window');
  await api('updateSettings', { onboardingCompleted: true, developerMode: true, visibleWorkspaces: ['capture', 'audio'], automaticUpdates: false, scanGamesAutomatically: false, uiScalePercent: 100 });
  await api('setCaptureConfig', { enabled: false, includeSystemAudio: true, includeChatAudio: true, includeMic: true, systemAudioMode: 'system' });
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setMinimumSize(1, 1);
    window.setContentSize(width, height);
    await delay(150);
    const [outerWidth, outerHeight] = window.getSize();
    const [contentWidth, contentHeight] = window.getContentSize();
    window.setSize(outerWidth + width - contentWidth, outerHeight + height - contentHeight);
    await wait(() => js(`innerWidth === ${width} && innerHeight === ${height}`), 'viewport');
    await openInputs();
    assert(await js('document.querySelector("[aria-label=\\\"Chat audio device\\\"]").textContent.includes("Switchboard chat")'), `Chat route label ${width}`);
    assert(await js('document.querySelector("[aria-label=\\\"Microphone device\\\"]").textContent.includes("processed microphone")'), `Processed mic label ${width}`);
    assert(await js('document.documentElement.scrollWidth <= innerWidth'), `No page overflow ${width}`);
    await capture(`${width}x${height}-integrated`);
  }
  for (const [label, field] of [['Game audio', 'includeSystemAudio'], ['Chat audio', 'includeChatAudio'], ['Microphone', 'includeMic']]) {
    await js(`document.querySelector('[role="switch"][aria-label="${label}"]').click()`);
    await wait(async () => !(await api('getSnapshot')).capture.config[field], `${label} disabled`);
    assert(canonical.capture.config[field] === false, `${label} writes canonical config`);
    await api('setCaptureConfig', { [field]: true });
  }
  rejectNext = true;
  await js('document.querySelector("[role=switch][aria-label=\\\"Chat audio\\\"]").click()');
  await delay(350);
  assert((await api('getSnapshot')).capture.config.includeChatAudio, 'Rejected toggle preserves confirmed setting');
  await api('setCaptureConfig', { chatAudioDeviceId: 'disconnected-chat' });
  await capture('disconnected-device');
  assert(await js('document.querySelector("[aria-label=\\\"Chat audio device\\\"]").textContent.includes("Unavailable")'), 'Missing explicit endpoint remains selected');
  await api('setCaptureConfig', { chatAudioDeviceId: null });
  available = false; await refresh(); await capture('unavailable');
  assert(await js('document.querySelector("[aria-label=\\\"Chat audio device\\\"]").textContent.includes("communications")'), 'Unavailable chat uses communications label');
  audioEnabled = false; await refresh(); await capture('audio-off');
  assert(await js('!document.body.innerText.includes("Switchboard system, chat, processed microphone capture is unavailable")'), 'Disabled audio does not show failure warning');
  available = true; audioEnabled = true; await refresh();
  await api('setCaptureConfig', { systemAudioMode: 'game' });
  assert(await js('document.querySelector("[aria-label=\\\"Game audio device\\\"]").disabled'), 'Game-only capture disables endpoint picker');
  await api('setCaptureConfig', { systemAudioMode: 'system', chatAudioDeviceId: 'persisted-chat' });
  window.webContents.reload();
  await wait(() => js('!!window.switchboard && document.body.innerText.length > 0'), 'reload');
  await openInputs();
  assert((await api('getSnapshot')).capture.config.chatAudioDeviceId === 'persisted-chat', 'Device selection survives renderer reload');
  const saved = JSON.parse(await readFile(join(profile, 'switchboard-state.json'), 'utf8'));
  assert(saved.capture.config.chatAudioDeviceId === 'persisted-chat', 'Device selection persisted by main');
  await api('setCaptureConfig', { chatAudioDeviceId: null });
  await js("sessionStorage.setItem('switchboard.settings.category', 'capture'); location.hash='settings'");
  await wait(() => js("[...document.querySelectorAll('[role=tab]')].some(b => b.textContent.includes('Audio'))"), 'capture audio tab');
  await js("[...document.querySelectorAll('[role=tab]')].find(b => b.textContent.includes('Audio')).click()");
  await wait(() => js('!!document.getElementById("setting-capture.audioDevices.chat")'), 'capture settings');
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setContentSize(width, height);
    await delay(100);
    const [ow, oh] = window.getSize(), [cw, ch] = window.getContentSize();
    window.setSize(ow + width - cw, oh + height - ch);
    await wait(() => js(`innerWidth === ${width} && innerHeight === ${height}`), 'settings viewport');
    await js('document.getElementById("setting-capture.audioDevices.chat").scrollIntoView({block:"center"})');
    assert(await js('document.getElementById("setting-capture.audioDevices.chat").getBoundingClientRect().width > 220'), `Recording selector width ${width}`);
    await capture(`${width}x${height}-settings`);
    assert(await js('document.documentElement.scrollWidth <= innerWidth'), `Settings overflow ${width}`);
  }
  await api('updateSettings', { onboardingCompleted: false });
  await wait(() => js('!!document.querySelector(".onboarding-screen")'), 'onboarding');
  for (const [step, label] of [[1, 'Get started'], [2, 'Continue'], [3, 'Continue']]) {
    await js(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
    await wait(() => js(`!!document.querySelector('[data-step-index="${step}"]')`), `onboarding step ${step}`);
  }
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setContentSize(width, height);
    await delay(100);
    const [ow, oh] = window.getSize(), [cw, ch] = window.getContentSize();
    window.setSize(ow + width - cw, oh + height - ch);
    await wait(() => js(`innerWidth === ${width} && innerHeight === ${height}`), 'onboarding viewport');
    assert(await js('!document.body.innerText.includes("Game and chat use the same output")'), `No false automatic-route warning ${width}`);
    await capture(`${width}x${height}-onboarding`);
    assert(await js('document.documentElement.scrollWidth <= innerWidth'), `Onboarding overflow ${width}`);
  }
  assert(!window.isVisible(), 'Native review stayed hidden');
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ output, checks: evidence.checks.length }));
  clearTimeout(watchdog); app.exit(0);
} catch (error) {
  console.error(error); evidence.failure = String(error);
  if (window) { evidence.dom = await js('document.body.innerText'); await capture('failure'); }
  await writeFile(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.error(output); clearTimeout(watchdog); app.exit(1);
}});
