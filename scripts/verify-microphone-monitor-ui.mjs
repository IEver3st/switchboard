// Hidden native Electron review of Audio > Microphone header: monitoring cluster and compact test
// button. Preset/monitoring independence is covered by tests/audio-presets.test.ts. Real IPC/controller/persistence; fixture capabilities only. Never starts
// the physical audio engine.
import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'design-qa', 'microphone-monitor-20260927');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-mic-monitor-ui-'));
app.setName('switchboard-mic-monitor-review'); app.setAppPath(root);
app.setPath('userData', profile); app.setPath('videos', profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
const assert = (value, message) => { if (!value) throw new Error(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const headphones = { id: 'fixture-headphones', name: 'Headphones (WH-1000XM6)', direction: 'output', isDefault: true, available: true, formFactor: 'headphones', isVirtual: false, isSwitchboard: false };
function fixture(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.audio) {
    const audio = value.audio;
    return { ...value, audio: { ...audio, enabled: true,
      devices: audio.devices.some(d => d.id === headphones.id) ? audio.devices : [...audio.devices, headphones],
      monitoringDeviceId: audio.monitoringDeviceId || headphones.id, monitoringEnabled: true,
      capabilities: { ...audio.capabilities, microphoneDsp: 'available', monitoring: 'available', microphoneTest: 'available', realtimeMetering: 'available', noiseSuppression: 'available' } } };
  }
  if (value.type === 'full') return { ...value, snapshot: fixture(value.snapshot) };
  if (value.type === 'patch' && value.changes?.audio) return { ...value, changes: fixture(value.changes) };
  return value;
}
app.on('browser-window-created', (_event, win) => {
  win.setPosition(-10000, -10000, false); win.setFocusable(false); win.setMinimumSize(1, 1);
  win.webContents.setBackgroundThrottling(false);
  const send = win.webContents.send.bind(win.webContents);
  win.webContents.send = (channel, ...args) => send(channel, ...args.map(value => channel === 'system:snapshot-updated' ? fixture(value) : value));
});
const { ipcMain } = await import('electron');
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => handle(channel, async (...args) => fixture(await handler(...args)));
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
let window;
const evaluate = expression => window.webContents.executeJavaScript(expression);
async function until(check, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error(message);
}
async function run() {
  await until(() => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading(); }, 'No native window');
  await until(() => evaluate('!!window.switchboard'), 'No preload');
  await evaluate(`window.switchboard.updateSettings({ developerMode: true, onboardingCompleted: true, visibleWorkspaces: ['audio'], uiScalePercent: 100 })`);
  await until(() => evaluate(`!![...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Audio')`), 'Audio navigation missing');
  await evaluate(`[...document.querySelectorAll('nav button')].find(e=>e.textContent.trim()==='Audio').click()`);
  await until(() => evaluate(`!!document.querySelector('#audio-tab-microphone')`), 'Microphone tab missing');
  await evaluate(`document.querySelector('#audio-tab-microphone').click()`);
  await until(() => evaluate(`!!document.querySelector('.mic-monitor')`), 'Monitoring control missing');
  assert(await evaluate(`!!document.querySelector('.audio-channel-head .mic-monitor')`), 'Monitoring is not in the channel header');
  const order = await evaluate(`[...document.querySelectorAll('.mic-page .mic-stage h4')].map(e=>e.textContent)`);
  assert(JSON.stringify(order) === JSON.stringify(['Equalizer', 'Noise removal', 'Noise gate', 'Voice consistency', 'Output safety']), `Unexpected stage order: ${order}`);
  assert(await evaluate(`[...document.querySelectorAll('.mic-section__title')].map(e=>e.textContent).join()==='Processing'`), 'Clean up and dynamics are not merged');
  const layouts = [];
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    if (window.isMaximized()) window.unmaximize();
    window.setMinimumSize(1, 1);
    window.setContentSize(width, height, false); await window.webContents.capturePage(); await delay(220);
    const viewport = await evaluate('({width:innerWidth,height:innerHeight})');
    const bounds = window.getBounds();
    window.setSize(bounds.width + width - viewport.width, bounds.height + height - viewport.height, false);
    await window.webContents.capturePage();
    await until(() => evaluate(`innerWidth === ${width} && innerHeight === ${height}`), 'Native viewport mismatch');
    const layout = await evaluate(`(()=>{const m=document.querySelector('.mic-monitor').getBoundingClientRect();const t=[...document.querySelectorAll('.microphone-test button')][0]?.getBoundingClientRect();const h=document.querySelector('.audio-channel-head').getBoundingClientRect();return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,monitorHeight:Math.round(m.height),scroll:(()=>{const v=document.querySelector('.mic-page').closest('[data-radix-scroll-area-viewport]')||document.scrollingElement;return {scrollHeight:v.scrollHeight,clientHeight:v.clientHeight}})(),parts:Object.fromEntries([['head','.audio-channel-head'],['source','.mic-source'],['eqGraph','.parametric-eq'],['tone','.mic-tone'],['processing','.mic-section--processing'],['page','.mic-page']].map(([k,q])=>[k,Math.round(document.querySelector(q)?.getBoundingClientRect().height??-1)])),pageTop:Math.round(document.querySelector('.mic-page').getBoundingClientRect().top),headerHeight:Math.round(h.height),headerOverflow:document.querySelector('.audio-channel-head').scrollWidth>h.width+1,monitorBottom:Math.round(m.bottom),testButton:t?[Math.round(t.width),Math.round(t.height)]:null,banner:[...document.querySelectorAll('.mic-page')].some(e=>e.textContent.includes('Processed microphone output connected'))}})()`);
    assert(!layout.overflow && !layout.headerOverflow && layout.monitorBottom < height && !layout.banner, `Layout failed: ${JSON.stringify(layout)}`);
    layouts.push(layout);
    await writeFile(join(output, `${width}x${height}.png`), (await window.webContents.capturePage()).toPNG());
  }
  await writeFile(join(output, 'evidence.json'), JSON.stringify({ scope: 'Hidden native Electron; fixture capabilities; real persistence', layouts }, null, 2));
  console.log(JSON.stringify({ passed: true, layouts })); app.quit();
}
void app.whenReady().then(run).catch(async error => {
  console.error(error); if (window && !window.isDestroyed()) await writeFile(join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG()).catch(() => {});
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1'; app.quit();
});
