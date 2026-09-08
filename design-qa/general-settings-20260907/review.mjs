import { app, BrowserWindow, clipboard, shell } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const output = import.meta.dirname;
const userData = await mkdtemp(join(tmpdir(), 'switchboard-developer-feedback-'));
await mkdir(output, { recursive: true });
app.setName('switchboard-developer-feedback-review');
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
let openFails = false;
let clipboardFails = false;
const handoffs = [];
clipboard.writeText = (text) => {
  if (clipboardFails) throw new Error('Review clipboard failure');
  handoffs.push({ copied: text });
};
shell.openExternal = async (url) => {
  await new Promise((done) => setTimeout(done, 200));
  if (openFails) throw new Error('Review browser failure');
  handoffs.push({ url });
};
let window;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const evaluate = (code) => window.webContents.executeJavaScript(code);
async function wait(code) {
  for (let i = 0; i < 300; i++) {
    if (await evaluate(code)) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${code}`);
}
async function click(selector) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function field(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}
const screenshots = [];
async function capture(name, width, height) {
  window.setMinimumSize(1, 1);
  window.setContentSize(width, height, false);
  for (let i = 0; i < 12; i++) {
    await delay(150);
    const size = await evaluate('({ width: innerWidth, height: innerHeight })');
    if (size.width === width && size.height === height) break;
    const bounds = window.getBounds();
    window.setBounds({ ...bounds, width: bounds.width + width - size.width, height: bounds.height + height - size.height }, false);
  }
  const metrics = await evaluate(`({ width: innerWidth, height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth,
    contentOverflow: [...document.querySelectorAll('[data-settings-content-scroll], [data-feedback-dialog]')].some(e => e.scrollWidth > e.clientWidth),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })`);
  assert.equal(metrics.width, width);
  assert.equal(metrics.height, height);
  assert.equal(metrics.overflow || metrics.contentOverflow, false);
  assert.equal(window.isVisible(), false);
  window.webContents.invalidate();
  await delay(120);
  await writeFile(join(output, `${name}-${width}x${height}.png`), (await window.webContents.capturePage()).toPNG());
  screenshots.push({ name, ...metrics });
}
await import('../../out/main/index.js');
void app.whenReady().then(async () => {
  for (let i = 0; i < 300 && !window; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (!window) await delay(50);
  }
  await wait('Boolean(window.switchboard)');
  await evaluate('window.switchboard.updateSettings({ onboardingCompleted: true, developerMode: false, uiScalePercent: 100 })');
  await click('button[aria-label="Settings"]');
  await wait('Boolean(document.querySelector(".settings-page"))');
  for (const [width, height] of [[1080,720], [1420,900], [1920,1080]]) await capture('general', width, height);
  await click('[aria-label="Developer mode"]');
  await wait('window.switchboard.getSnapshot().then(s => s.settings.developerMode === true)');
  await click('.settings-segmented__option:first-child');
  await wait('window.switchboard.getSnapshot().then(s => s.settings.visibleWorkspaces.length === 1)');
  await click('[aria-label="Devices"][role="switch"]');
  await wait('window.switchboard.getSnapshot().then(s => s.settings.visibleWorkspaces.includes("devices"))');
  await capture('custom',1080,720);
  window.webContents.reload();
  await wait('Boolean(document.querySelector(".settings-workspaces__custom"))');
  await click('.settings-segmented__option:last-child');
  await wait('window.switchboard.getSnapshot().then(s => s.settings.visibleWorkspaces.includes("audio"))');
  await capture('full',1420,900);
  await click('.diagnostic-runner__actions button');
  await wait('Boolean(document.querySelector(".diagnostic-runner__summary"))');
  await capture('checks',1080,720);
  await click('.diagnostic-runner__results > summary');
  await evaluate('document.querySelector(".diagnostic-runner__results > summary").focus()');
  await capture('results-focus',1080,720);
  await click('[aria-label="Audio"][role="switch"]');
  await wait('window.switchboard.getSnapshot().then(s => !s.settings.visibleWorkspaces.includes("audio"))');
  await writeFile(join(output,'report.json'),JSON.stringify(screenshots,null,2));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
