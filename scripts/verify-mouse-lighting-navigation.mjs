import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'design-qa', 'mouse-lighting-20260927');
const isolated = await mkdtemp(join(tmpdir(), 'switchboard-lighting-navigation-'));
const saved = JSON.parse(await readFile(join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json'), 'utf8'));
saved.audio.enabled = false;
saved.capture.config.enabled = false;
saved.setup.preferences.lighting.enabled = false;
saved.settings.launchAtStartup = false;
saved.settings.developerMode = false;
saved.settings.trayOnGameLaunch = false;
saved.settings.onboardingCompleted = true;
saved.settings.visibleWorkspaces = ['devices', 'audio', 'capture'];
saved.setup.preferences.quickControlsEnabled = false;
saved.setup.scenes = [];
for (const module of saved.modules) module.enabled = module.kind === 'device' && module.installed;
await writeFile(join(isolated, 'switchboard-state.json'), JSON.stringify(saved));
app.setName('switchboard-lighting-navigation-review');
app.setAppPath(root);
app.setPath('userData', isolated);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
const commands = [];
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, async (event, ...args) => {
  if (channel === 'devices:set-control') commands.push(args[0]);
  return listener(event, ...args);
});
await import('../out/main/index.js');
void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });
async function run() {
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = Date.now() + 30_000;
let window;
while (Date.now() < deadline) {
  window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed() && item.webContents.getURL().includes('index.html'));
  if (window && !window.webContents.isLoading()) break;
  await delay(50);
}
if (!window) throw new Error('Review window unavailable');
const evaluate = expression => window.webContents.executeJavaScript(expression, true);
async function wait(expression) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(40); }
  throw new Error(`Timed out: ${expression}`);
}
async function click(label) {
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(label)})`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
}
try {
  await wait('Boolean(window.switchboard)');
  await evaluate(`window.switchboard.updateSettings({visibleWorkspaces:['devices','audio','capture'],onboardingCompleted:true})`);
  const snapshot = await evaluate('window.switchboard.getSnapshot()');
  const mouse = snapshot.devices.find(device => device.kind === 'mouse');
  const results = [];
  for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
    window.setContentSize(width, height);
    await click('Devices');
    await wait(`Boolean(document.querySelector('button[aria-label*="G502 X Plus"]'))`);
    await evaluate(`document.querySelector('button[aria-label*="G502 X Plus"]').click()`);
    await wait(`Boolean(document.querySelector('[aria-label="Mouse lighting"], [aria-label="Turn mouse lighting off"]'))`);
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({deviceId:mouse.id,change:{type:'lighting-enabled',enabled:true}})})`);
    await wait(`document.querySelector('[aria-label="Mouse lighting"]')?.getAttribute('aria-checked')==='true'`);
    await evaluate(`document.querySelector('[aria-label="Mouse lighting"]').click()`);
    await wait(`document.querySelector('[aria-label="Mouse lighting"]')?.getAttribute('aria-checked')==='false'`);
    const start = commands.length;
    for (const route of ['Audio', 'Capture', 'Devices']) {
      await click(route);
      await delay(200);
      const current = await evaluate('window.switchboard.getSnapshot()');
      if (current.devices.find(device => device.id === mouse.id).capabilities.lighting.enabled) throw new Error(`${route} relit mouse`);
    }
    if (commands.length !== start) throw new Error(`Navigation sent device writes: ${JSON.stringify(commands.slice(start))}`);
    results.push({ width, height, routes:['Audio','Capture','Devices'], unsolicitedDeviceWrites:0, lightingEnabled:false });
  }
  await mkdir(output, {recursive:true});
  await writeFile(join(output,'navigation.json'), JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
  app.quit();
} catch(error) { console.error(error); app.exit(1); }
}
