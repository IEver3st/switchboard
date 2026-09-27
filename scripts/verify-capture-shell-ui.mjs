// Hidden native Electron acceptance for the capture-only shell.
// Does not start capture, write media, or change the user's application profile.
import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-capture-shell-'));
const output = join(root, '.switchboard', 'capture-shell-review', String(Date.now()));
await mkdir(output, { recursive: true });
const state = JSON.parse(await readFile(join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json'), 'utf8'));
const base = state.clips.find(clip => clip.thumbnailPath && existsSync(clip.thumbnailPath) && existsSync(clip.path));
if (!base) throw Error('A local clip with a real thumbnail is required for the library fixture.');
await mkdir(join(profile, 'cache', 'thumbnails'), { recursive: true });
state.clips = [];
for (let index = 0; index < 8; index++) {
  const id = `save-review-${index}`;
  const thumbnailPath = join(profile, 'cache', 'thumbnails', `${id}.v2.jpg`);
  await copyFile(base.thumbnailPath, thumbnailPath);
  state.clips.push({ ...base, id, thumbnailPath, name: `Capture shell fixture ${index + 1}`, createdAt: Date.now() - index * 1000 });
}
state.capture.config.enabled = false;
state.capture.config.replaySeconds = 60;
state.capture.config.clipsDirectory = join(profile, 'Clips');
state.audio.enabled = false;
state.modules.forEach(module => { module.enabled = false; });
Object.assign(state.settings, { onboardingCompleted: true, visibleWorkspaces: ['devices', 'capture'], uiScalePercent: 100, automaticUpdates: false, scanGamesAutomatically: false });
await mkdir(state.capture.config.clipsDirectory);
await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
app.setName('switchboard-capture-shell-review');
app.setAppPath(root);
app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = function () { throw Error('This review must remain hidden.'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => {
  window.setBounds({ x: -20000, y: -20000, width: 1420, height: 900 });
  window.webContents.setBackgroundThrottling(false);
  window.webContents.setAudioMuted(true);
});
const report = { scope: 'Hidden Electron capture-only shell with canonical snapshot fixtures. No live capture proof.', checks: [], screenshots: [], errors: [] };
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
let window, fixture;
const js = expression => window.webContents.executeJavaScript(expression);
function assert(value, label) { if (!value) throw Error(label); report.checks.push(label); }
async function wait(test, label) {
  const until = Date.now() + 15000;
  while (Date.now() < until) { if (await test()) return; await delay(50); }
  throw Error(`Timed out: ${label}`);
}
// Hidden windows may suspend rAF once reduced motion removes the last animation.
async function frames() {
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await delay(100);
}
async function capture(name) {
  // capturePage wakes painting in the hidden window; allow the updated frame to commit.
  for (let pass = 0; pass < 3; pass++) {
    await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await frames();
  }
  await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  report.screenshots.push(name);
}

const watchdog = setTimeout(() => app.exit(2), 90000);
await import('../out/main/index.js');
void app.whenReady().then(async () => { try {
  await wait(async () => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading() && await js('Boolean(window.switchboard)'); }, 'window');
  await wait(() => js('Boolean(document.querySelector(".capture-title-strip"))'), 'automatic capture-only shell');
  fixture = await js('window.switchboard.getSnapshot()');
  ipcMain.removeHandler('system:get-snapshot');
  ipcMain.handle('system:get-snapshot', () => fixture);
  const rawSend = window.webContents.send.bind(window.webContents);
  let revision = 100000;
  const send = (channel, ...args) => rawSend(channel, ...(channel === 'system:snapshot-updated' ? [{type:'full', revision: ++revision, snapshot: fixture}] : args));
  window.webContents.send = send;
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
    window.setMinimumSize(1,1); window.setContentSize(width,height);
    const [ow,oh] = window.getSize(), [cw,ch] = window.getContentSize();
    window.setSize(ow+width-cw, oh+height-ch);
    await frames();
    await wait(() => js('Boolean(document.querySelector("#replay-status"))'), 'capture');
    assert(await js('!document.querySelector(".switchboard-sidebar")'), 'sidebar absent '+width);
    assert(await js('document.documentElement.scrollWidth <= innerWidth'), 'no overflow '+width);
    assert(await js(`(() => { const b = document.querySelector('.capture-title-strip button'); const r=b.getBoundingClientRect(); return r.right < innerWidth-130 && getComputedStyle(b).webkitAppRegion === 'no-drag'; })()`), 'settings clear of native controls '+width);
    const cog = await js(`(() => { const b=document.querySelector('.capture-title-strip__settings'); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,label:b.getAttribute('aria-label'),text:b.textContent.trim()}; })()`);
    assert(cog.label === 'Settings' && cog.text === '', 'Icon-only settings has accessible name '+width);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type:'mouseMoved', x:cog.x, y:cog.y});
    await frames();
    assert(await js("getComputedStyle(document.querySelector('.capture-title-strip__settings svg')).animationName === 'none'"), 'Reduced motion disables cog spin '+width);
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {features:[]});
    await frames();
    assert(await js("getComputedStyle(document.querySelector('.capture-title-strip__settings svg')).animationName === 'capture-settings-spin'"), 'Hover spins cog '+width);
    const before = await js("getComputedStyle(document.querySelector('.capture-title-strip__settings svg')).transform");
    await frames();
    assert(await js("getComputedStyle(document.querySelector('.capture-title-strip__settings svg')).transform") !== before, 'Cog rotation advances '+width);
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {type:'mouseMoved', x:400, y:20});
    await frames();
    assert(await js("getComputedStyle(document.querySelector('.capture-title-strip__settings svg')).animationName === 'none'"), 'Cog stops after hover '+width);
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await capture(width+'x'+height+'-capture-only');
    await js("document.querySelector('.capture-title-strip button').focus()");
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type:'keyDown', key:'Enter', code:'Enter', windowsVirtualKeyCode:13, text:'\r' });
    await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type:'keyUp', key:'Enter', code:'Enter', windowsVirtualKeyCode:13 });
    await wait(() => js('Boolean(document.querySelector(".settings-page"))'), 'keyboard settings');
    await capture(width+'x'+height+'-settings');
    await js("window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))");
    await wait(() => js('Boolean(document.querySelector(".capture-title-strip"))'), 'return to capture');
  }
  fixture = structuredClone(fixture);
  fixture.modules.find(m => m.kind === 'device').enabled = true;
  send('system:snapshot-updated', fixture); await frames();
  await wait(() => js('Boolean(document.querySelector(".switchboard-sidebar"))'), 'module enable restores sidebar');
  await capture('module-enabled-sidebar');
  fixture.modules.forEach(m => m.enabled=false); fixture.clips=[];
  send('system:snapshot-updated', fixture); await frames();
  await wait(() => js('Boolean(document.querySelector(".capture-title-strip"))'), 'module disable restores focused shell');
  await capture('empty-capture-only');
  window.webContents.reload();
  await wait(() => js('Boolean(document.querySelector(".capture-title-strip"))'), 'reload from canonical snapshot');
  assert(!window.isVisible(), 'remained hidden');
  await writeFile(join(output, 'report.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,checks:report.checks.length,screenshots:report.screenshots.length}));
  clearTimeout(watchdog);app.exit(0);
} catch(error) { console.error(error);console.error(output);clearTimeout(watchdog);app.exit(1); }});
