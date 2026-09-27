// Isolated, hidden native UI review. History is an explicit visual fixture.
import { app, BrowserWindow, dialog } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-diagnostics-polish-'));
const output = join(root, '.switchboard', 'diagnostics-polish', String(Date.now()));
await mkdir(output, { recursive: true });
const state = JSON.parse(await readFile(join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json'), 'utf8'));
state.clips = []; state.audio.enabled = false; state.modules.forEach(module => { module.enabled = false; });
Object.assign(state.capture.config, { enabled: false, clipsDirectory: join(profile, 'Clips'), replayCacheDirectory: null });
Object.assign(state.settings, { onboardingCompleted: true, developerMode: true, detailedDiagnostics: false, automaticUpdates: false, scanGamesAutomatically: false, uiScalePercent: 100 });
await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
app.setName('switchboard-diagnostics-polish-review'); app.setAppPath(root); app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1'; process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1'; process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = function () { throw Error('Review must remain hidden'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => {
  window.setBounds({ x: -20000, y: -20000, width: 1420, height: 900 });
  window.webContents.setBackgroundThrottling(false); window.webContents.setAudioMuted(true);
});
const report = { checks: [], errors: [], screenshots: [], scope: 'Hidden native Electron. Synthetic resource history; no live performance claims.' };
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
let win, revision = 100000;
const js = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
const assert = (value, label) => { if (!value) throw Error(label); report.checks.push(label); };
async function until(code) { const limit = Date.now() + 15000; while (Date.now() < limit) { if (await js(`return ${code}`)) return; await delay(60); } throw Error(`Timed out: ${code}`); }
async function frames() { await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }); await delay(100); }
async function capture(name, width = 1080, height = 720) {
  const [currentWidth, currentHeight] = await js('return [innerWidth,innerHeight]');
  if (currentWidth !== width || currentHeight !== height) {
    win.setMinimumSize(1, 1); win.setContentSize(width, height);
    const [ow, oh] = win.getSize(), [cw, ch] = win.getContentSize(); win.setSize(ow + width - cw, oh + height - ch);
  }
  for (let pass = 0; pass < 3; pass++) await frames();
  assert(await js('return document.documentElement.scrollWidth <= innerWidth'), `${name}: no page overflow`);
  const file = `${name}-${width}x${height}.png`;
  await writeFile(join(output, file), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); report.screenshots.push(file);
}
async function key(keyCode) {
  const code = { ArrowDown: 40, Home: 36, End: 35, Enter: 13, Escape: 27 }[keyCode];
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: keyCode, code: keyCode, windowsVirtualKeyCode: code });
  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: keyCode, code: keyCode, windowsVirtualKeyCode: code });
  await frames();
}
async function send(snapshot) { win.webContents.send('system:snapshot-updated', { type: 'full', revision: ++revision, snapshot }); await frames(); }
async function click(text) { await js(`const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button');b.click()`); await frames(); }
const watchdog = setTimeout(() => app.exit(2), 120000);
await import('../out/main/index.js');
void app.whenReady().then(async () => { try {
  for (let i = 0; i < 200 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; await delay(50); }
  await until('Boolean(window.switchboard) && Boolean(document.querySelector("[aria-label=Settings]"))');
  win.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await js("sessionStorage.setItem('switchboard.settings.category','diagnostics');document.querySelector('[aria-label=Settings]').click()");
  await until('Boolean(document.querySelector(".resource-timeframe"))');
  assert(await js("return !document.querySelector('.settings-category-header p') && !document.querySelector('.settings-category-header button')"), 'marked subtitle and duplicate reset removed');
  assert(await js("return !document.querySelector('.resource-monitor__caption') && !document.querySelector('.resource-time-axis') && !document.querySelector('.diagnostics-local-only')"), 'marked captions removed');
  for (const [w, h] of [[1080,720],[1420,900],[1920,1080],[2048,1108]]) await capture('empty', w, h);
  const base = await js('return window.switchboard.getSnapshot()');
  const fixture = structuredClone(base);
  const previous = JSON.parse(await readFile(join(root, 'design-qa/diagnostics-upgrade-20260914/live-export.json'), 'utf8')).resources;
  fixture.performance.resources = structuredClone(previous);
  const resources = fixture.performance.resources, end = Date.now();
  resources.sampledAt = new Date(end).toISOString(); resources.startedAt = new Date(end - 3595000).toISOString(); resources.sampleCount = 720;
  resources.history = Array.from({ length: 720 }, (_, index) => ({ at: new Date(end - (719-index)*5000).toISOString(), cpuPercent: 1.2 + Math.abs(Math.sin(index*.09))*2.4, residentMb: 390 + Math.sin(index*.02)*18, privateMb: 470 + Math.sin(index*.023)*12, readBps: Math.abs(Math.sin(index*.043))*1200000, writeBps: Math.abs(Math.cos(index*.029))*600000, processes: resources.processes.length }));
  resources.processes.forEach(process => { process.sampledAt = resources.sampledAt; });
  await send(fixture);
  for (const [w, h] of [[1080,720],[1420,900],[1920,1080]]) await capture('history', w, h);
  await capture('selector-closed');
  await js("document.querySelector('.resource-timeframe').focus()"); await key('ArrowDown');
  await until('Boolean(document.querySelector("[role=listbox]"))');
  await capture('selector-open');
  await key('End'); await key('Enter');
  await until('!document.querySelector("[role=listbox]")');
  assert(await js("return document.querySelector('.resource-timeframe').textContent.includes('Last hour')"), 'keyboard selects hour');
  assert(await js("return document.querySelector('.resource-trace svg').getAttribute('aria-label').includes('720 samples')"), 'hour changes actual chart window');
  await js("document.querySelector('.resource-timeframe').focus()"); await key('ArrowDown'); await key('Home'); await key('ArrowDown'); await key('Enter');
  assert(await js("return document.querySelector('.resource-timeframe').textContent.includes('Last 15 minutes')"), 'keyboard selects 15 minutes');
  assert(await js("return document.querySelector('.resource-trace svg').getAttribute('aria-label').includes('181 samples')"), '15 minutes filters actual points');
  await js("document.querySelector('.resource-timeframe').focus()"); await key('ArrowDown'); await key('Escape');
  assert(await js("return Boolean(document.querySelector('.resource-monitor')) && !document.querySelector('[role=listbox]') && document.activeElement.classList.contains('resource-timeframe')"), 'Escape closes menu and restores focus without leaving Settings');
  await capture('selector-focus');
  const first = structuredClone(fixture); first.performance.resources.history = [resources.history.at(-1)]; await send(first); await capture('first-sample');
  const partial = structuredClone(fixture); partial.performance.resources.status = 'partial'; partial.performance.resources.inaccessible = 1;
  Object.assign(partial.performance.resources.history.at(-1), { cpuPercent: null, residentMb: null, privateMb: null, readBps: null, writeBps: null });
  await send(partial); await capture('partial');
  const collecting = structuredClone(base); collecting.diagnostics.status = 'running'; await send(collecting); await capture('collecting');
  await send(fixture);
  for (const text of ['Checks','Pipelines','Devices','Resources']) { await click(text); assert(await js(`return document.querySelector('.diagnostics-workspace').dataset.view===${JSON.stringify(text.toLowerCase())}`), `${text} navigation`); }
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(output, 'missing', 'export.json') });
  await click('Export JSON'); await until("document.body.textContent.includes('Could not save diagnostics.')"); await capture('export-error');
  assert(!win.isVisible(), 'hidden throughout'); assert(report.errors.length === 0, 'no renderer errors');
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, checks: report.checks.length, errors: report.errors })); clearTimeout(watchdog); app.quit();
} catch (error) { console.error(error, output); clearTimeout(watchdog); app.exit(1); } });
