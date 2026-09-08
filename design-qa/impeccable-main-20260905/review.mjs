import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { auditDOM } from './dom-audit.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = import.meta.dirname;
const userData = await mkdtemp(join(tmpdir(), 'switchboard-impeccable-audit-'));
app.setName('switchboard-impeccable-audit');
app.setAppPath(root);
app.setPath('userData', userData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-prefers-reduced-motion');
app.on('browser-window-created', (_event, created) => {
  created.setPosition(-10000, -10000, false);
  created.setMinimumSize(1, 1);
  created.webContents.setBackgroundThrottling(false);
});
let window;
let phase = 'before';
const delay = (ms) => new Promise(done => setTimeout(done, ms));
const evaluate = (code) => window.webContents.executeJavaScript(code);
async function wait(code) {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(code)) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${code}`);
}
async function click(selector) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function navigate(label) {
  if (await evaluate('Boolean(document.querySelector(".settings-page"))')) await click('.settings-back');
  await wait('Boolean(document.querySelector("nav[aria-label=Primary]"))');
  await evaluate(`(() => { const b = [...document.querySelectorAll('nav[aria-label=Primary] button')].find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!b) throw new Error('Missing navigation ' + ${JSON.stringify(label)}); b.click(); })()`);
}
async function gallery() {
  await navigate('Devices');
  if (await evaluate('Boolean(document.querySelector(".device-workbench__back"))')) await click('.device-workbench__back');
  await wait('Boolean(document.querySelector(".device-gallery"))');
}
async function device(name) {
  await gallery();
  await click(`.device-gallery__item[aria-label*="${name}"]`);
  await wait('Boolean(document.querySelector(".device-workbench"))');
  await delay(300);
}
async function settings(category) {
  if (!await evaluate('Boolean(document.querySelector(".settings-page"))')) await click('button[aria-label="Settings"]');
  await click(`[data-settings-category="${category}"]`);
}
const routes = [
  ['devices', gallery],
  ['mouse', () => device('G502 X Plus')],
  ['keyboard', () => device('Huntsman V2 Analog')],
  ['microphone', () => device('QuadCast 2')],
  ['capture', async () => { await navigate('Capture'); await wait('Boolean(document.querySelector(".capture-command-header"))'); }],
  ['replay', async () => { await click('.capture-recorder-settings-trigger'); await wait('Boolean(document.querySelector(".capture-replay-popover"))'); }],
  ['settings-general', async () => { await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))'); await settings('general'); }],
  ['settings-capture', () => settings('capture')],
  ['settings-modules', () => settings('modules')],
  ['settings-about', () => settings('about')],
  ['audio-mixer', async () => { await evaluate('window.switchboard.updateSettings({ developerMode: true })'); await navigate('Audio'); await wait('Boolean(document.querySelector(".audio-page"))'); }],
  ['audio-microphone', async () => { await click('#audio-tab-microphone'); await wait('document.querySelector(".audio-page")?.dataset.audioTab === "microphone"'); }],
];
async function viewport(width, height) {
  window.setMinimumSize(1, 1);
  window.setContentSize(width, height, false);
  for (let i = 0; i < 12; i++) {
    await delay(160);
    const size = await evaluate('({ width: innerWidth, height: innerHeight })');
    if (size.width === width && size.height === height) return;
    const bounds = window.getBounds();
    window.setBounds({ ...bounds, width: bounds.width + width - size.width, height: bounds.height + height - size.height }, false);
  }
  throw new Error('Viewport did not settle');
}
async function review() {
  await mkdir(join(output, phase), { recursive: true });
  const results = [];
  for (const [width, height] of [[1080,720], [1420,900], [1920,1080]]) {
    await evaluate('window.switchboard.updateSettings({ developerMode: false, uiScalePercent: 100 })');
    await viewport(width, height);
    for (const [name, prepare] of routes) {
      await prepare();
      await delay(350);
      const dom = await evaluate(`(${auditDOM.toString()})()`);
      const tree = await window.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
      const unnamed = tree.nodes.filter(node => !node.ignored && ['button','checkbox','switch','slider','combobox','textbox','tab'].includes(node.role?.value) && !node.name?.value).map(node => ({ role: node.role?.value, backendNodeId: node.backendDOMNodeId }));
      assert.equal(window.isVisible(), false);
      await writeFile(join(output, phase, `${name}-${width}x${height}.png`), (await window.webContents.capturePage()).toPNG());
      results.push({ name, ...dom, unnamed });
      console.log(phase, name, width, 'contrast', dom.contrast.length, 'overflow', dom.overflow.length, 'unnamed', unnamed.length);
    }
  }
  await writeFile(join(output, `${phase}.json`), JSON.stringify({ userData, results }, null, 2));
}
await import('../../out/main/index.js');
void app.whenReady().then(async () => {
  for (let i = 0; i < 200 && !window; i++) { window = BrowserWindow.getAllWindows()[0]; if (!window) await delay(50); }
  await wait('Boolean(window.switchboard)');
  await evaluate('window.switchboard.updateSettings({ onboardingCompleted: true, developerMode: false, uiScalePercent: 100 })');
  await wait('Boolean(document.querySelector("nav[aria-label=Primary]"))');
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Accessibility.enable');
  await review();
  console.log('BASELINE_READY');
  await writeFile(join(output, 'ready'), 'baseline complete');
  for (let i = 0; i < 1800; i++) {
    try { await access(join(output, 'continue')); break; } catch { await delay(1000); }
    if (i === 1799) throw new Error('Confirmation was not requested');
  }
  phase = 'after';
  window.webContents.reload();
  await wait('Boolean(document.querySelector("nav[aria-label=Primary]"))');
  await review();
  console.log('CONFIRMATION_COMPLETE');
  app.quit();
}).catch(async error => {
  console.error(error);
  await writeFile(join(output, 'failure.txt'), String(error));
  app.exit(1);
});
