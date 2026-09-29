// Native renderer fixtures only. No Audio.Host, playback, device writes or
// changes to the user's profile. Live routing is checked by --live-cable-tree.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { ipcChannels, systemSnapshotSchema } from '../src/shared/contracts';
import { snapshotStreamChannel } from '../src/shared/snapshot-stream';

const root = process.cwd();
const output = join(root, '.switchboard', 'audio-routing-notice-review');
const userData = mkdtempSync(join(tmpdir(), 'switchboard-audio-notice-'));
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
process.on('unhandledRejection', error => { console.error(error); app.exit(1); });
app.setPath('userData', userData);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-prefers-reduced-motion');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
let state = createDefaultSnapshot();
state.settings.onboardingCompleted = true;
state.settings.visibleWorkspaces = ['devices', 'audio', 'capture'];
state.settings.uiScalePercent = 100;
state.modules.find(module => module.kind === 'device')!.enabled = true;
state.audio.enabled = true;
state.audio.devices = [{ id: 'fixture-headphones', name: 'Test headphones', direction: 'output', available: true, isDefault: true, isVirtual: false, isSwitchboard: false, volume: 1, muted: false }];
for (const bus of state.audio.buses) bus.deviceId = 'fixture-headphones';
state.audio.capabilities.applicationRouting = 'available';
state.audio.capabilities.channelDsp = 'available';
state.audio.capabilities.routingBackend = 'vb-cable';
state.audio.capabilities.streamOutput = 'unavailable';
state.engines.find(engine => engine.kind === 'audio')!.state = 'running';
state.capture.config.enabled = false;
const healthy = structuredClone(state);
let window: BrowserWindow;
let revision = 0;
let pendingRelease: (() => void) | undefined;
let rejectRestart = false;
const calls: string[] = [];
function publish() {
  state = systemSnapshotSchema.parse(state);
  window.webContents.send(ipcChannels.snapshotUpdated, { type: 'full', revision: ++revision, snapshot: state });
}
ipcMain.handle(ipcChannels.getSnapshot, () => state);
ipcMain.handle('montage-v2:list-drafts', () => []);
ipcMain.handle(ipcChannels.audioDependencySetup, () => state);
ipcMain.on(snapshotStreamChannel, () => publish());
ipcMain.on(ipcChannels.setAudioMeterSubscription, () => {});
ipcMain.handle(ipcChannels.setAudioMasterEnabled, async (_event, input) => {
  calls.push('unmute'); state.audio.mixes.find(mix => mix.id === input.mixId)!.master.enabled = input.enabled;
  await writeFile(join(userData, 'confirmed-audio.json'), JSON.stringify(state.audio)); publish(); return state;
});
ipcMain.handle(ipcChannels.setAudioMasterGain, (_event, input) => {
  calls.push('volume'); state.audio.mixes.find(mix => mix.id === input.mixId)!.master.gain = input.gain; publish(); return state;
});
ipcMain.handle(ipcChannels.setAudioEnabled, () => { calls.push('enable'); state = structuredClone(healthy); publish(); return state; });
ipcMain.handle(ipcChannels.restartAudio, async () => {
  calls.push('restart'); await new Promise<void>(resolve => { pendingRelease = resolve; });
  if (rejectRestart) throw new Error('Fixture: audio output could not reopen.');
  state = structuredClone(healthy); publish(); return state;
});
ipcMain.handle(ipcChannels.openWindowsSound, () => { calls.push('windows'); return state; });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const evaluate = (source: string) => window.webContents.executeJavaScript(source);
async function until(source: string, message: string) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await evaluate(source)) return; await delay(40); }
  throw new Error(message);
}
async function clickAction() { await until('!!document.querySelector(".audio-routing-notice__action")', 'Recovery button is missing'); await evaluate('document.querySelector(".audio-routing-notice__action").click()'); }
async function scenario(change: (snapshot: typeof state) => void) {
  state = structuredClone(healthy); change(state); publish(); await delay(120);
}

void app.whenReady().then(async () => {
await mkdir(output, { recursive: true });
window = new BrowserWindow({ x: -10000, y: -10000, width: 1080, height: 720, show: false, focusable: false,
  webPreferences: { preload: join(root, 'out/preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
await window.loadFile(join(root, 'out/renderer/index.html'), { hash: 'audio/mixer' });
try {
  await until('!!document.querySelector(".audio-page")', 'Audio route did not load');
  const layouts = [];
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setContentSize(width, height);
    await scenario(snapshot => { snapshot.audio.capabilities.channelDsp = 'unavailable'; });
    await window.webContents.capturePage();
    const actual = await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
    if (actual.width !== width || actual.height !== height) {
      const bounds = window.getBounds();
      window.setSize(bounds.width + Math.round((width - actual.width) * actual.dpr), bounds.height + Math.round((height - actual.height) * actual.dpr));
      await window.webContents.capturePage();
    }
    await until(`innerWidth === ${width} && innerHeight === ${height}`, `Viewport size did not match: requested ${width}x${height}, actual ${JSON.stringify(await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'))}, bounds ${JSON.stringify(window.getBounds())}`);
    const metrics = await evaluate(`(() => {
      const notice = document.querySelector('.audio-routing-notice'); const box = notice.getBoundingClientRect();
      const chat = document.querySelector('.audio-chatmix').getBoundingClientRect();
      return { width:innerWidth,height:innerHeight,horizontal:document.documentElement.scrollWidth>innerWidth,
        noticeVisible:box.top>=0 && box.bottom<innerHeight,chatVisible:chat.bottom<=innerHeight,text:notice.textContent };
    })()`);
    assert(metrics.noticeVisible && !metrics.horizontal && metrics.chatVisible, `Layout failed: ${JSON.stringify(metrics)}`);
    layouts.push(metrics);
    await writeFile(join(output, `${width}x${height}.png`), (await window.webContents.capturePage()).toPNG());
  }
  await evaluate('document.querySelector(".audio-routing-notice__action").focus()');
  // Hidden Windows reviews cannot activate native keyboard focus. Force the
  // same CSS state through Electron's debugger to inspect the visible outline.
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('DOM.enable');
  await window.webContents.debugger.sendCommand('CSS.enable');
  const { root: dom } = await window.webContents.debugger.sendCommand('DOM.getDocument');
  const { nodeId } = await window.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: dom.nodeId, selector: '.audio-routing-notice__action' });
  await window.webContents.debugger.sendCommand('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['focus-visible'] });
  assert(await evaluate('document.activeElement.matches(".audio-routing-notice__action") && getComputedStyle(document.activeElement).outlineStyle !== "none"'), 'Recovery focus is missing');
  await writeFile(join(output, 'focus.png'), (await window.webContents.capturePage()).toPNG());
  window.webContents.debugger.detach();
  await clickAction();
  await until('document.querySelector(".audio-routing-notice__action")?.disabled', 'Restart action did not show pending');
  rejectRestart = true; pendingRelease!();
  await until('document.querySelector("[role=alert]")?.textContent.includes("Fixture:")', 'Rejected restart did not show error');
  assert(state.audio.capabilities.channelDsp === 'unavailable', 'Rejected restart changed confirmed state');
  rejectRestart = false;
  await clickAction(); await until('document.querySelector(".audio-routing-notice__action")?.disabled', 'Second restart did not show pending');
  pendingRelease!(); await until('!document.querySelector(".audio-routing-notice")', 'Successful restart left the warning visible');
  await scenario(snapshot => { snapshot.audio.mixes.find(mix => mix.id === 'personal')!.master.enabled = false; });
  await clickAction(); await until('!document.querySelector(".audio-routing-notice")', 'Unmute did not clear warning');
  const persisted = JSON.parse(await readFile(join(userData, 'confirmed-audio.json'), 'utf8'));
  assert(persisted.mixes.find((mix: { id: string }) => mix.id === 'personal').master.enabled, 'Unmute was not confirmed in main');
  const reloaded = new Promise<void>(resolve => window.webContents.once('did-finish-load', () => resolve()));
  window.webContents.reload(); await reloaded; await until('!!document.querySelector(".audio-page")', 'Audio route did not return after reload');
  assert(!await evaluate('!!document.querySelector(".audio-routing-notice")'), 'Confirmed unmute did not survive renderer reload');
  await scenario(snapshot => { snapshot.audio.mixes.find(mix => mix.id === 'personal')!.master.gain = 0; });
  await clickAction(); await until('!document.querySelector(".audio-routing-notice")', 'Restore volume failed');
  await scenario(snapshot => { snapshot.audio.devices[0]!.muted = true; }); await clickAction();
  assert(calls.includes('windows'), 'Windows sound action did not reach main');
  await scenario(snapshot => { snapshot.audio.enabled = false; }); await clickAction();
  await until('!document.querySelector(".audio-routing-notice")', 'Enable did not clear off warning');
  await scenario(snapshot => { snapshot.audio.buses[0]!.deviceId = 'missing'; }); await clickAction();
  await until('!!document.querySelector(".settings-page") || location.hash.startsWith("#settings")', 'Output recovery did not open Settings');
  assert(!window.isVisible() && !window.isFocused(), 'Native review window became visible');
  await writeFile(join(output, 'report.json'), JSON.stringify({ fixtures: true, layouts, calls, pending: true, rejected: true, reload: true, reducedMotion: true }, null, 2));
  console.log(`Audio warning native fixture review passed at all three sizes. Evidence: ${output}`);
  app.exit(0);
} catch (error) { console.error(error); console.error(await evaluate('({hash:location.hash,body:document.body.innerText.slice(0,1200)})')); app.exit(1); }
});
