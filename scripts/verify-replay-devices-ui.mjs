// Hidden native Electron review of Settings > Capture > Replay audio devices. Real preload,
// controller and offline persistence; never starts capture or changes physical audio.
import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'design-qa', 'replay-devices-20260927');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-replay-devices-ui-'));
app.setName('switchboard-replay-devices-review'); app.setAppPath(root);
app.setPath('userData', profile); app.setPath('videos', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
app.on('browser-window-created', (_event, win) => {
  win.setPosition(-10000, -10000, false); win.setFocusable(false); win.setMinimumSize(1, 1);
  win.webContents.setBackgroundThrottling(false);
});
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
let window;
const evaluate = expression => window.webContents.executeJavaScript(expression).catch(error => { throw new Error(`${error.message} :: ${expression.slice(0, 90)}`); });
async function until(check, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(message);
}
async function run() {
  await until(() => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading(); }, 'No native window');
  await until(() => evaluate('!!window.switchboard'), 'No preload');
  const failure = await evaluate(`window.switchboard.updateSettings({ developerMode: true, onboardingCompleted: true, visibleWorkspaces: ['capture'], uiScalePercent: 100 }).then(() => null, e => String(e))`);
  if (failure) throw new Error(failure);
  await until(() => evaluate(`!document.querySelector('.onboarding, [class*=onboarding]')`), 'Onboarding still open');
  await evaluate(`location.hash='settings'; dispatchEvent(new HashChangeEvent('hashchange'))`);
  await until(() => evaluate(`!!document.querySelector('[data-settings-category]')`), 'Settings missing');
  await evaluate(`document.querySelector('[data-settings-category="capture"]').click()`);
  await until(() => evaluate(`!!document.getElementById('capture-tab-audio')`), 'Capture audio tab missing');
  await evaluate(`document.getElementById('capture-tab-audio').click()`);
  await until(() => evaluate(`!!document.getElementById('setting-capture.audioDevices')`), 'Replay devices row missing');
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
    await evaluate(`document.getElementById('setting-capture.audioDevices').closest('section')?.scrollIntoView({block:'start'})`); await delay(120);
    const layout = await evaluate(`(()=>{const row=document.getElementById('setting-capture.audioDevices');const triggers=[...row.querySelectorAll('button')];return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,rowWidth:Math.round(row.getBoundingClientRect().width),triggerWidths:triggers.map(t=>Math.round(t.getBoundingClientRect().width)),truncated:triggers.some(t=>{const s=t.querySelector('span');return s&&s.scrollWidth>s.clientWidth+1})}})()`);
    layouts.push(layout);
    await writeFile(join(output, `${width}x${height}.png`), (await window.webContents.capturePage()).toPNG());
  }
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ scope: 'Hidden native Electron, default offline profile', layouts }, null, 2));
  console.log(JSON.stringify({ passed: true, layouts })); app.quit();
}
void app.whenReady().then(run).catch(async error => {
  console.error(error); if (window && !window.isDestroyed()) await writeFile(join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG()).catch(() => {});
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1'; app.quit();
});
