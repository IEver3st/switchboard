// Hidden native UI regression with a persisted fixture; never starts a recorder.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { parseAudioEndpoints } from '../src/main/services/audio-endpoint-discovery';
import { captureConfigSchema, ipcChannels, setCaptureConfigInputSchema, updateSettingsInputSchema } from '../src/shared/contracts';

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'switchboard-first-run-'));
app.setPath('userData', join(directory, 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
void app.whenReady().then(run).catch((error) => { console.error(error); app.exit(1); });
async function run() {
let store = new StateStore(join(directory, 'state.json'));
await store.load();
const window = new BrowserWindow({ show: false, frame: false, useContentSize: true, x: -30000, y: -30000, width: 1080, height: 720,
  webPreferences: { preload: resolve(root, 'out/preload/index.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false },
});
let rejectStart = false;
let requests = 0;
let starts = 0;
const physicalDevices = parseAudioEndpoints([
  { id: 'usb-speakers', name: 'USB Speakers', flow: 'render', isDefault: true, volume: 1, muted: false },
  { id: 'usb-headset', name: 'USB Headset', flow: 'render', isDefault: false, volume: 1, muted: false },
  { id: 'usb-mic', name: 'USB Microphone', flow: 'capture', isDefault: true, volume: 1, muted: false },
]);
store.update((draft) => { draft.audio.devices = physicalDevices; draft.settings.uiScalePercent = 100; });
const publish = () => window.webContents.send(ipcChannels.snapshotUpdated, store.get());
ipcMain.handle('montage-v2:list-drafts', () => []);
ipcMain.handle(ipcChannels.getSnapshot, () => store.get());
ipcMain.handle(ipcChannels.updateSettings, async (_event, input) => {
  const patch = updateSettingsInputSchema.parse(input);
  const result = store.update((draft) => { Object.assign(draft.settings, patch); });
  await store.flush();
  return result;
});
ipcMain.handle(ipcChannels.setCaptureConfig, async (_event, input) => {
  requests++;
  const patch = setCaptureConfigInputSchema.parse(input);
  const enabling = patch.enabled === true && !store.get().capture.config.enabled;
  if (enabling) starts++;
  await new Promise((resolve) => setTimeout(resolve, enabling ? 800 : 50));
  if (rejectStart) throw new Error('Fixture capture start failed');
  const result = store.update((draft) => {
    draft.capture.config = captureConfigSchema.parse({ ...draft.capture.config, ...patch });
    draft.capture.runtime.state = draft.capture.config.enabled ? 'waiting' : 'stopped';
    draft.capture.runtime.error = undefined;
    draft.capture.runtime.warning = undefined;
    draft.capture.capabilities.backend = 'windows-graphics-capture';
    draft.capture.capabilities.encoders = ['libx264'];
    draft.capture.capabilities.systemAudio = true;
    draft.capture.capabilities.microphoneAudio = true;
  });
  await store.flush();
  return result;
});
const evaluate = (code: string) => window.webContents.executeJavaScript(code);
async function wait(code: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await evaluate(code)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${code}`);
}
async function click(label: string) {
  await wait(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === ${JSON.stringify(label)})`);
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
}
async function choose(selector: string, label: string) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await wait(`Boolean(document.querySelector('[role="option"]'))`);
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(option => option.textContent.trim() === ${JSON.stringify(label)}).focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await wait(`!document.querySelector('[role="option"]')`);
}
async function capture(name: string) {
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setMinimumSize(1, 1);
    window.setContentSize(width!, height!);
    const [outerWidth, outerHeight] = window.getSize();
    const [contentWidth, contentHeight] = window.getContentSize();
    window.setSize(outerWidth + width! - contentWidth, outerHeight + height! - contentHeight);
    if (window.isVisible()) throw new Error('Review window became visible');
    await wait(`innerWidth === ${width} && innerHeight === ${height}`);
    if (name.startsWith('settings-')) await evaluate(`document.querySelector('.settings-capture-devices-block')?.scrollIntoView({ block: 'center' })`);
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (await evaluate('document.documentElement.scrollWidth > innerWidth')) throw new Error('Horizontal overflow');
    if (await evaluate(`(() => { const main = document.querySelector('.onboarding-main'); return main && main.scrollHeight > main.clientHeight + 1; })()`)) throw new Error('Onboarding controls require scrolling');
    const clipped = await evaluate(`[...document.querySelectorAll('.capture-command-header button, .capture-command-header input')].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > innerWidth + 1); }).map(node => node.getAttribute('aria-label') || node.textContent)`);
    if (clipped.length) throw new Error(`Clipped toolbar controls at ${width}: ${clipped.join(', ')}. ${await evaluate(`JSON.stringify([...document.querySelectorAll('.capture-command-header__row > *, .capture-library__tools > *')].map(node => { const r = node.getBoundingClientRect(); return { class: node.className, left: r.left, right: r.right, width: r.width }; }))`)}`);
    await writeFile(join(directory, `${name}-${width}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  }
}
try {
  await window.loadFile(resolve(root, 'out/renderer/index.html'));
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await click('Get started');
  await click('Continue');
  await wait(`document.querySelector('[aria-label="Capture engine"]')?.getAttribute('aria-checked') === 'true'`);
  await capture('onboarding');
  await choose('[aria-labelledby="onboarding-replay-length-label"]', '3 minutes');
  const captureSaveAt = Date.now();
  await click('Continue');
  await wait(`document.querySelector('[data-step-index="3"]')`);
  console.log(`Capture setup save: ${Date.now() - captureSaveAt} ms (800 ms fixture startup deferred)`);
  if (store.get().capture.config.enabled || starts !== 0) throw new Error('Setup started Replay before Finish');
  if (store.get().capture.config.replaySeconds !== 180) throw new Error('Replay length was not saved');
  await evaluate(`document.querySelector('[aria-label="Chat audio"]').click()`);
  await choose('[aria-label="Game audio device"]', 'USB Speakers · Default');
  await choose('[aria-label="Chat audio device"]', 'USB Headset');
  await choose('[aria-label="Microphone device"]', 'USB Microphone · Default');
  await capture('onboarding-physical-audio');
  await click('Continue');
  await wait(`document.querySelector('[data-step-index="4"]')`);
  if (starts !== 0) throw new Error('Audio setup started Replay before Finish');
  rejectStart = true;
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Open ')).click()`);
  await wait(`document.querySelector('.onboarding-stage')?.getAttribute('aria-busy') === 'true'`);
  await capture('onboarding-finishing');
  await wait(`document.querySelector('.onboarding-error')?.textContent.includes('Fixture capture start failed')`);
  if (store.get().settings.onboardingCompleted || store.get().capture.config.enabled) throw new Error('Failed finish marked setup complete');
  await capture('onboarding-start-error');
  rejectStart = false;
  starts = 0;
  // Finish through the actual settings IPC, then reload the persisted fixture.
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Open ')).click()`);
  await wait(`!document.querySelector('.onboarding-screen')`);
  if (!store.get().capture.config.enabled || starts !== 1) throw new Error('Finish must start Replay exactly once');
  const selected = store.get().capture.config;
  if (selected.systemAudioDeviceId !== 'usb-speakers' || selected.chatAudioDeviceId !== 'usb-headset' || selected.microphoneDeviceId !== 'usb-mic') throw new Error('Physical audio choices were not saved');
  store.update((draft) => { draft.capture.config.enabled = false; draft.capture.capabilities.backend = 'unavailable'; });
  await store.flush();
  store = new StateStore(join(directory, 'state.json'));
  await store.load();
  if (store.get().capture.config.microphoneDeviceId !== 'usb-mic' || store.get().capture.config.replaySeconds !== 180) throw new Error('Setup choices did not survive restart');
  store.update((draft) => { draft.audio.devices = physicalDevices; }, { persist: false });
  await window.loadFile(resolve(root, 'out/renderer/index.html'), { hash: 'capture' });
  await new Promise<void>((resolve) => { window.webContents.once('did-finish-load', () => resolve()); window.webContents.reload(); });
  await wait(`document.querySelector('#replay-status')?.textContent.includes('Capture off')`);
  if (await evaluate(`Boolean(document.querySelector('[aria-label="Instant Replay"]'))`)) throw new Error('Duplicate Replay toggle remains');
  await capture('capture-off');
  await evaluate(`sessionStorage.setItem('switchboard.settings.category', 'capture'); location.hash = 'settings'`);
  const toggle = `document.querySelector('[aria-label="Capture engine"]')`;
  await wait(`${toggle} && !${toggle}.disabled && ${toggle}.getAttribute('aria-checked') === 'false'`);
  rejectStart = true;
  await evaluate(`${toggle}.click()`);
  await wait(`${toggle}.disabled`);
  await wait(`!${toggle}.disabled && document.body.textContent.includes('Fixture capture start failed')`);
  if (store.get().capture.config.enabled) throw new Error('Failed start changed preference');
  rejectStart = false;
  const before = requests;
  await evaluate(`${toggle}.click()`);
  await wait(`${toggle}.getAttribute('aria-checked') === 'true' && !${toggle}.disabled`);
  if (requests !== before + 1) throw new Error('Duplicate start');
  await click('Audio');
  await wait(`Boolean(document.querySelector('[aria-label="Game audio device"]'))`);
  await choose('[aria-label="Game audio device"]', 'USB Headset');
  await wait(`document.querySelector('[aria-label="Game audio device"]')?.textContent.includes('USB Headset')`);
  await choose('[aria-label="Chat audio device"]', 'USB Speakers · Default');
  await wait(`document.querySelector('[aria-label="Chat audio device"]')?.textContent.includes('USB Speakers')`);
  store.update((draft) => { draft.audio.devices = physicalDevices.filter((device) => device.direction === 'output'); }, { persist: false });
  publish();
  await wait(`document.querySelector('[aria-label="Microphone device"]')?.textContent.includes('Unavailable device')`);
  await capture('settings-unavailable-microphone');
  await choose('[aria-label="Microphone device"]', 'Automatic (follow Audio settings)');
  await wait(`document.querySelector('[aria-label="Microphone device"]')?.textContent.includes('Automatic')`);
  if (store.get().capture.config.microphoneDeviceId !== null) throw new Error('Unavailable microphone could not be reset to Automatic');
  store.update((draft) => { draft.audio.devices = physicalDevices; }, { persist: false });
  publish();
  await choose('[aria-label="Microphone device"]', 'USB Microphone · Default');
  await wait(`document.querySelector('[aria-label="Microphone device"]')?.textContent.includes('USB Microphone')`);
  await capture('settings-capture-enabled');
  await store.flush();
  store = new StateStore(join(directory, 'state.json'));
  await store.load();
  // StateStore intentionally clears transient host state on load. Simulate the
  // enabled host's restored waiting snapshot without starting a recorder.
  store.update((draft) => { draft.capture.runtime.state = 'waiting'; }, { persist: false });
  await window.loadFile(resolve(root, 'out/renderer/index.html'), { hash: 'capture' });
  await new Promise<void>((resolve) => { window.webContents.once('did-finish-load', () => resolve()); window.webContents.reload(); });
  await wait(`document.querySelector('#replay-status')?.textContent.includes('Waiting')`);
  if (!store.get().capture.config.enabled) throw new Error('Engine preference was not restored');
  await capture('capture-waiting');
  // A failed host keeps the engine enabled. Retry must preserve that preference
  // and all recorder settings, including across a rejected retry.
  const savedConfig = JSON.stringify(store.get().capture.config);
  store.update((draft) => { draft.capture.runtime.state = 'error'; draft.capture.runtime.error = 'Fixture capture start failed'; }, { persist: false });
  await window.webContents.reload();
  const retry = `document.querySelector('[aria-label="Retry capture"]')`;
  await wait(`${retry} && !${retry}.disabled`);
  await capture('capture-error');
  await evaluate(`document.querySelector('#replay-status').click()`);
  await wait(`document.querySelector('[aria-label="Replay configuration"]')?.textContent.includes('retry automatically')`);
  await capture('capture-error-details');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await wait(`!document.querySelector('[aria-label="Replay configuration"]')`);
  rejectStart = true;
  await evaluate(`${retry}.focus(); ${retry}.click()`);
  await wait(`${retry}.disabled && ${retry}.getAttribute('aria-busy') === 'true'`);
  await wait(`!${retry}.disabled && document.body.textContent.includes('Fixture capture start failed')`);
  if (JSON.stringify(store.get().capture.config) !== savedConfig) throw new Error('Rejected retry changed capture preferences');
  rejectStart = false;
  const beforeRetry = requests;
  await evaluate(`${retry}.focus(); ${retry}.click()`);
  await wait(`!${retry} && document.querySelector('#replay-status')?.textContent.includes('Waiting')`);
  await wait(`document.activeElement?.getAttribute('aria-label')?.startsWith('Open replay settings')`);
  if (requests !== beforeRetry + 1) throw new Error('Duplicate retry');
  if (JSON.stringify(store.get().capture.config) !== savedConfig) throw new Error('Retry changed capture preferences');
  await evaluate(`location.hash = 'settings'`);
  await wait(`${toggle}?.getAttribute('aria-checked') === 'true'`);
  await evaluate(`${toggle}.click()`);
  await wait(`${toggle}.getAttribute('aria-checked') === 'false' && !${toggle}.disabled`);
  if (store.get().capture.config.enabled) throw new Error('Disable did not persist');
  await store.flush();
  store = new StateStore(join(directory, 'state.json'));
  await store.load();
  if (store.get().capture.config.enabled) throw new Error('Disabled Capture was not restored');
  await window.loadFile(resolve(root, 'out/renderer/index.html'), { hash: 'settings' });
  await click('Modules');
  await wait(`Boolean(document.querySelector('.module-manager__toolbar'))`);
  for (const [id, name] of [['device.razer-huntsman', 'Razer'], ['device.hyperx-quadcast', 'HyperX'], ['device.logitech-hidpp', 'Logitech']]) {
    const row = await evaluate(`(() => { const row = document.querySelector('[data-module-row="${id}"]'); return { name: row?.querySelector('strong')?.textContent, enabled: row?.querySelector('[role="switch"]')?.getAttribute('aria-checked') }; })()`);
    if (row.name !== name || row.enabled !== 'false') throw new Error(`${name} must use its brand name and start disabled`);
  }
  await capture('brand-modules');
  console.log(`Capture engine, automatic Replay, and Retry UI passed with persisted fixtures. Captures: ${directory}`);
  app.exit(0);
} catch (error) { console.error(error); console.error(await evaluate('document.body.innerText.slice(0, 2500)')); app.exit(1); }
}
