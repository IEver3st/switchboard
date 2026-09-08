import { app, BrowserWindow, clipboard, shell } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const output = join(root, 'design-qa', 'direct-feedback-20260907');
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
let failDelivery = false;
const submissions = [];
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://frommeans.com/api/correspond');
  submissions.push(JSON.parse(init.body));
  await new Promise(done => setTimeout(done, 1200));
  return new Response(JSON.stringify({ ok: !failDelivery }), { status: failDelivery ? 503 : 200, headers: { 'Content-Type': 'application/json' } });
};
clipboard.writeText = () => { throw new Error('Feedback must not touch the clipboard'); };
shell.openExternal = async () => { throw new Error('Feedback must not open a browser'); };
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
  for (const [width, height] of [[1080,720], [1420,900], [1920,1080]]) {
    await click('.settings-feedback-trigger');
    await capture('empty', width, height);
    assert.equal(await evaluate('document.querySelector("button[type=submit]").textContent.trim()'), 'Submit feedback');
    assert.equal(await evaluate('document.querySelector("[data-feedback-dialog]").textContent.includes("GitHub")'), false);
    for (const kind of ['bug', 'feature', 'feedback']) {
      await click('#feedback-kind-' + kind);
      await field('#feedback-title', 'Review report draft');
      await field('#feedback-description', 'A local review draft to verify direct submission.');
      await field('#feedback-email', 'review@example.com');
      await capture(kind, width, height);
    }
    await click('[data-feedback-dialog] button[aria-label="Close"]');
    await wait('!document.querySelector("[data-feedback-dialog]")');
    assert.equal(await evaluate('document.activeElement?.classList.contains("settings-feedback-trigger")'), true);
    await click('.settings-feedback-trigger');
    assert.equal(await evaluate('document.querySelector("#feedback-title").value'), 'Review report draft');
    await click('.settings-feedback-additional summary');
    await field('#feedback-supporting-details', 'Open settings and send feedback.');
    await capture('expanded', width, height);
    await click('.settings-feedback-additional summary');
    failDelivery = true;
    await click('button[type="submit"]');
    await wait('document.querySelector("button[type=submit]").disabled');
    await click('[data-feedback-dialog] button[aria-label="Close"]');
    assert.equal(await evaluate('Boolean(document.querySelector("[data-feedback-dialog]"))'), true);
    await capture('pending', width, height);
    await wait('Boolean(document.querySelector(".settings-feedback-message[role=alert]"))');
    assert.equal(await evaluate('document.querySelector("#feedback-title").value'), 'Review report draft');
    await capture('error', width, height);
    failDelivery = false;
    await click('[aria-label="Include app details"]');
    await click('button[type="submit"]');
    await wait('Boolean(document.querySelector(".settings-feedback-success"))');
    await capture('success', width, height);
    await click('.settings-feedback-success button');
    await wait('!document.querySelector("[data-feedback-dialog]")');
    await click('.settings-feedback-trigger');
    assert.equal(await evaluate('document.querySelector("#feedback-title").value'), '');
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await wait('!document.querySelector("[data-feedback-dialog]")');
  }
  assert.equal(submissions.length, 6);
  assert.ok(submissions[0].message.includes('[Feedback]'));
  assert.ok(!submissions[0].message.includes('## Environment'));
  assert.ok(submissions[1].message.includes('## Environment'));
  await writeFile(join(output, 'report.json'), JSON.stringify({ passed: true, mode: 'hidden native Electron; fixture hardware; intercepted HTTP, no real delivery', screenshots, submissions }, null, 2));
  console.log('Direct feedback native review passed.');
  app.quit();
}).catch(async (error) => {
  console.error(error);
  await writeFile(join(output, 'failure.txt'), String(error));
  app.exit(1);
});
