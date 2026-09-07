// Hidden native UI regression with a persisted fixture; never starts a recorder.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { captureConfigSchema, ipcChannels, setCaptureConfigInputSchema, updateSettingsInputSchema } from '../src/shared/contracts';

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'switchboard-first-run-'));
app.setPath('userData', join(directory, 'profile'));
void app.whenReady().then(run).catch((error) => { console.error(error); app.exit(1); });
async function run() {
let store = new StateStore(join(directory, 'state.json'));
await store.load();
const window = new BrowserWindow({ show: false, x: -30000, y: -30000, width: 1080, height: 720,
  webPreferences: { preload: resolve(root, 'out/preload/index.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false },
});
let rejectStart = false;
let requests = 0;
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
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (rejectStart) throw new Error('Fixture capture start failed');
  const result = store.update((draft) => {
    draft.capture.config = captureConfigSchema.parse({ ...draft.capture.config, ...patch });
    draft.capture.runtime.state = draft.capture.config.enabled ? 'waiting' : 'stopped';
    draft.capture.runtime.error = undefined;
    draft.capture.runtime.warning = undefined;
    draft.capture.capabilities.backend = 'windows-graphics-capture';
    draft.capture.capabilities.encoders = ['libx264'];
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
async function capture(name: string) {
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setContentSize(width!, height!);
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (await evaluate('document.documentElement.scrollWidth > innerWidth')) throw new Error('Horizontal overflow');
    const clipped = await evaluate(`[...document.querySelectorAll('.capture-command-header button, .capture-command-header input')].filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > innerWidth + 1); }).map(node => node.getAttribute('aria-label') || node.textContent)`);
    if (clipped.length) throw new Error(`Clipped toolbar controls at ${width}: ${clipped.join(', ')}. ${await evaluate(`JSON.stringify([...document.querySelectorAll('.capture-command-header__row > *, .capture-library__tools > *')].map(node => { const r = node.getBoundingClientRect(); return { class: node.className, left: r.left, right: r.right, width: r.width }; }))`)}`);
    await writeFile(join(directory, `${name}-${width}.png`), (await window.webContents.capturePage()).toPNG());
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
  await click('Continue');
  await wait(`document.querySelector('[data-step-index="3"]')`);
  if (!store.get().capture.config.enabled) throw new Error('Setup did not enable Replay');
  await click('Continue');
  await wait(`document.querySelector('[data-step-index="4"]')`);
  // Finish through the actual settings IPC, then reload the persisted fixture.
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Open ')).click()`);
  await wait(`!document.querySelector('.onboarding-screen')`);
  store.update((draft) => { draft.capture.config.enabled = false; draft.capture.capabilities.backend = 'unavailable'; });
  await store.flush();
  store = new StateStore(join(directory, 'state.json'));
  await store.load();
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
  await wait(`document.querySelector('[aria-label="Replay configuration"]')?.textContent.includes('use Retry')`);
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
  console.log(`Capture engine, automatic Replay, and Retry UI passed with persisted fixtures. Captures: ${directory}`);
  app.exit(0);
} catch (error) { console.error(error); console.error(await evaluate('document.body.innerText.slice(0, 2500)')); app.exit(1); }
}
