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
    draft.capture.capabilities.backend = 'windows-graphics-capture';
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
    await writeFile(join(directory, `${name}-${width}.png`), (await window.webContents.capturePage()).toPNG());
  }
}
try {
  await window.loadFile(resolve(root, 'out/renderer/index.html'));
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await click('Get started');
  await click('Continue');
  await wait(`document.querySelector('[aria-label="Replay capture"]')?.getAttribute('aria-checked') === 'true'`);
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
  const toggle = `document.querySelector('[aria-label="Instant Replay"]')`;
  await wait(`${toggle} && !${toggle}.disabled && ${toggle}.getAttribute('aria-checked') === 'false'`);
  await capture('capture-off');
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
  await capture('capture-enabled');
  await store.flush();
  store = new StateStore(join(directory, 'state.json'));
  await store.load();
  await window.loadFile(resolve(root, 'out/renderer/index.html'), { hash: 'capture' });
  await new Promise<void>((resolve) => { window.webContents.once('did-finish-load', () => resolve()); window.webContents.reload(); });
  await wait(`${toggle}?.getAttribute('aria-checked') === 'true'`);
  await evaluate(`${toggle}.click()`);
  await wait(`${toggle}.getAttribute('aria-checked') === 'false' && !${toggle}.disabled`);
  if (store.get().capture.config.enabled) throw new Error('Disable did not persist');
  console.log(`First-run and Replay UI passed with persisted fixtures. Captures: ${directory}`);
  app.exit(0);
} catch (error) { console.error(error); console.error(await evaluate('document.body.innerText.slice(0, 2500)')); app.exit(1); }
}
