import { app, BrowserWindow, clipboard, shell, dialog } from 'electron';
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
const evaluate = async (code) => { try { return await window.webContents.executeJavaScript(code); } catch (e) { console.error('Evaluation failed:',code); throw e; } };
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

const errors = [];
await import('../../out/main/index.js');
void app.whenReady().then(async () => {
  for (let i = 0; i < 300 && !window; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (!window) await delay(50);
  }
  window.webContents.on('console-message', (_e, level, message) => { if (level === 3) errors.push(message); });
  await wait('Boolean(window.switchboard)');
  await evaluate('window.switchboard.updateSettings({ onboardingCompleted: true, developerMode: true, uiScalePercent: 100 })');
  await click('button[aria-label="Settings"]');
  await click('[data-settings-category="diagnostics"]');
  await wait('Boolean(document.querySelector(".diagnostics-workspace"))');
  const button = async (name) => {
    await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(name)}); if (!b) throw new Error('Missing button '+${JSON.stringify(name)}); b.click(); })()`);
    await delay(80);
  };
  for (const [w,h] of [[1080,720],[1420,900],[1920,1080]]) {
    for (const pane of ['Checks','Pipelines','Devices','Resources']) {
      await button(pane);
      await capture(pane.toLowerCase(),w,h);
    }
  }
  await button('Checks');
  await evaluate('document.querySelector(".diagnostics-views button").focus()');
  await capture('focus',1080,720);
  // Clipboard failures are explicit in hidden windows with no clipboard permission.
  await button('Copy view');
  assert.match(await evaluate('document.querySelector(".diagnostics-feedback").innerText'), /copied|Clipboard unavailable/);
  dialog.showSaveDialog = async () => ({ canceled: true, filePath: undefined });
  await button('Export JSON');
  await wait('document.querySelector(".diagnostics-feedback")?.innerText === "Save cancelled."');
  dialog.showSaveDialog = async () => { throw new Error('Review export failure'); };
  await button('Export JSON');
  await wait('document.querySelector(".diagnostics-feedback")?.innerText.includes("Could not save")');
  await capture('export-error',1080,720);
  const exportPath = join(userData, 'diagnostics.json');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
  await button('Export JSON');
  await wait('document.querySelector(".diagnostics-feedback")?.innerText.includes("Diagnostics saved")');
  assert.ok(JSON.parse(await readFile(exportPath, 'utf8')));
  await button('Resources');
  await click('[aria-label="Detailed resource diagnostics"]');
  await wait('window.switchboard.getSnapshot().then(s => s.settings.detailedDiagnostics === true)');
  await click('[aria-label="Performance guard"]');
  await wait('window.switchboard.getSnapshot().then(s => s.settings.performanceGuard === false)');
  window.webContents.reload();
  await wait('Boolean(document.querySelector(".diagnostics-workspace"))');
  await button('Resources');
  await wait(`document.querySelector('[aria-label="Detailed resource diagnostics"]')?.getAttribute("aria-checked") === "true"`);
  await capture('resources-recording',1420,900);
  await click('[aria-label="Detailed resource diagnostics"]');
  await wait('window.switchboard.getSnapshot().then(s => s.settings.detailedDiagnostics === false)');
  await button('Checks');
  await button('Run diagnostics');
  await wait('window.switchboard.getSnapshot().then(s => s.diagnostics.status !== "idle")');
  let run = await evaluate('window.switchboard.getSnapshot().then(s => s.diagnostics)');
  if (run.status === 'running') {
    await button('Cancel diagnostics');
    await wait('window.switchboard.getSnapshot().then(s => s.diagnostics.status !== "running")');
  }
  const fixture = await evaluate('window.switchboard.getSnapshot()');
  fixture.diagnostics = { id: 'review-checks', status: 'completed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), summary: '1 failed, 1 warning, 1 passed, 1 skipped.', checks: [
    { id: 'encoder', label: 'Hardware encoder', status: 'fail', durationMs: 243, detail: 'The selected encoder did not accept the capture format.\nTry the software encoder in Capture settings, then run this check again.' },
    { id: 'audio', label: 'Microphone endpoint', status: 'warning', durationMs: 11, detail: 'The saved microphone is unavailable. Reconnect the device or select an available input.' },
    { id: 'storage', label: 'Clip folder write access', status: 'pass', durationMs: 4, detail: 'Created and removed a temporary file in the configured clip folder.' },
    { id: 'frame', label: 'Capture frame test', status: 'skipped', detail: 'Skipped because a recording is active.' }
  ] };
  const send = () => window.webContents.send('system:snapshot-updated',fixture);
  send();
  await delay(100);
  for (const [w,h] of [[1080,720],[1420,900],[1920,1080]]) { send(); await capture('results',w,h); }
  assert.equal(await evaluate('document.querySelectorAll(".diagnostic-runner__results li details[open]").length'),2);
  await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Review unavailable clipboard'); } } })`);
  await button('Copy view');
  assert.match(await evaluate('document.querySelector(".diagnostics-copy-fallback").value'), /Created and removed a temporary file/);
  await click('.diagnostics-copy-fallback');
  await evaluate('document.querySelector(".diagnostics-copy-fallback").focus()');
  assert.equal(await evaluate('document.querySelector(".diagnostics-copy-fallback").selectionStart'),0);
  await evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copiedDiagnostics = text; } } })`);
  await button('Copy view');
  assert.match(await evaluate('window.__copiedDiagnostics'), /Microphone endpoint/);
  assert.match(await evaluate('document.querySelector(".diagnostics-feedback").innerText'), /View copied/);

  await button('Needs attention · 2');
  assert.equal(await evaluate('document.querySelectorAll(".diagnostic-runner__results li").length'),2);
  await field('input[placeholder="Find a check, error, or encoder…"]','nomatch');
  await delay(100);
  assert.match(await evaluate('document.querySelector(".diagnostics-empty").innerText'),/No checks match/);
  await capture('no-matches',1080,720);
  await button('Show all checks');
  fixture.diagnostics.status='running'; fixture.diagnostics.completedAt=null;
  fixture.diagnostics.checks=[{id:'pending',label:'Testing capture source',status:'running',detail:'Waiting for the first frame.'}];
  send(); await capture('running',1080,720);
  fixture.diagnostics.status='cancelled'; fixture.diagnostics.summary='Diagnostics cancelled. Completed checks are retained.';
  fixture.diagnostics.checks=[]; send(); await capture('cancelled',1080,720);
  fixture.performance.sampledAt=null; fixture.devices=[];
  await button('Devices'); send(); await capture('empty-devices',1080,720);
  // Search must reveal its target even when another diagnostics view is selected.
  await field('input[placeholder="Search settings"]','retention');
  await delay(100);
  await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Local retention')); if(!b) throw new Error('Missing retention search result'); b.click(); })()`);
  await wait('document.querySelector(".diagnostics-workspace").dataset.view === "resources"');
  await wait('document.activeElement?.id === "setting-diagnostics.retention"');
  assert.equal(window.isVisible(),false);
  await writeFile(join(output,'report.json'), JSON.stringify({ screenshots, errors }, null, 2));
  assert.deepEqual(errors,[]);
  console.log('Diagnostics native review passed');
  app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});