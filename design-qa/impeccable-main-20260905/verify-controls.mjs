import { app, BrowserWindow } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { auditDOM } from './dom-audit.mjs';

const output = import.meta.dirname;
const root = resolve(output, '../..');
const { userData } = JSON.parse(await readFile(join(output, 'after.json'), 'utf8'));
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
const delay = ms => new Promise(done => setTimeout(done, ms));
const evaluate = code => window.webContents.executeJavaScript(code).catch(error => { console.error('Failed renderer expression:', code); throw error; });
async function wait(code) {
  for (let i = 0; i < 400; i++) { if (await evaluate(code)) return; await delay(50); }
  throw new Error('Timed out: ' + code);
}
async function click(selector) {
  await wait(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function field(selector, value) {
  await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', {bubbles:true})); })()`);
}
async function navigate(label) {
  if (await evaluate('Boolean(document.querySelector(".settings-page"))')) await click('.settings-back');
  await wait('Boolean(document.querySelector("nav[aria-label=Primary]"))');
  await evaluate(`(() => { const e = [...document.querySelectorAll('nav[aria-label=Primary] button')].find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!e) throw new Error('Missing route'); e.click(); })()`);
}
async function settings(category) {
  if (!await evaluate('Boolean(document.querySelector(".settings-page"))')) await click('[aria-label="Settings"]');
  await click(`[data-settings-category="${category}"]`);
}
async function viewport(width, height) {
  window.setMinimumSize(1, 1);
  window.setContentSize(width, height, false);
  for (let i = 0; i < 12; i++) {
    await delay(180);
    window.webContents.invalidate();
    await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const size = await evaluate('({width:innerWidth,height:innerHeight})');
    if (size.width === width && size.height === height) return;
    const b = window.getBounds();
    const zoom = window.webContents.getZoomFactor();
    window.setBounds({...b, width:Math.round(b.width+(width-size.width)*zoom), height:Math.round(b.height+(height-size.height)*zoom)}, false);
  }
  throw new Error('Viewport did not settle: ' + JSON.stringify({bounds:window.getBounds(), zoom:window.webContents.getZoomFactor(), size:await evaluate('({width:innerWidth,height:innerHeight})')}));
}
const results = [];
async function capture(name) {
  window.webContents.invalidate();
  await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  await delay(150);
  const dom = await evaluate(`(${auditDOM.toString()})()`);
  assert.deepEqual(dom.contrast, [], name + ' contrast');
  assert.deepEqual(dom.overflow, [], name + ' overflow');
  assert.equal(window.isVisible(), false);
  await writeFile(join(output,'final',`${name}-${dom.viewport.width}x${dom.viewport.height}.png`), (await window.webContents.capturePage()).toPNG());
  results.push({name,...dom});
  await writeFile(join(output,'controls-progress.json'),JSON.stringify(results,null,2));
}
await import('../../out/main/index.js');
void app.whenReady().then(async () => {
  await mkdir(join(output,'final'),{recursive:true});
  for(let i=0;i<200 && !window;i++){window=BrowserWindow.getAllWindows()[0];if(!window)await delay(50);}
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {enabled:true});
  await wait('Boolean(window.switchboard)');
  await evaluate('window.switchboard.updateSettings({developerMode:false,uiScalePercent:100})');
  await wait('Boolean(document.querySelector("nav[aria-label=Primary]"))');
  for(const [width,height] of [[1080,720],[1420,900],[1920,1080]]){
    await viewport(width,height);
    await settings('modules');
    await wait(`document.querySelector('[aria-label="Enable Audio Router"]')?.disabled === true`);
    await capture('modules-locked');
    await click('[aria-label="View Audio Router details"]');
    await wait('Boolean(document.querySelector(".module-details-dialog"))');
    assert.equal(await evaluate(`document.querySelector('.module-details-dialog [aria-label="Enable Audio Router"]').disabled`),true);
    await click('.module-details-dialog button[aria-label="Close"]');
    await field('[data-module-search]','no-such-module-audit');
    await wait('Boolean(document.querySelector(".module-manager__empty"))');
    const focus = await evaluate('({active:document.activeElement.hasAttribute("data-module-search"),shadow:getComputedStyle(document.activeElement).boxShadow})');
    assert.equal(focus.active,true);
    assert.ok(focus.shadow.includes('2px'));
    await capture('module-search-focus');
    await click('[aria-label="Clear module search"]');
    await settings('general');
    await click('[aria-label="Developer mode"]');
    await wait('window.switchboard.getSnapshot().then(s=>s.settings.developerMode)');
    await settings('modules');
    await wait(`document.querySelector('[aria-label="Enable Audio Router"]')?.disabled === false`);
    window.webContents.reload();
    await wait(`document.querySelector('[aria-label="Enable Audio Router"]')?.disabled === false`);
    await capture('modules-unlocked');
    await navigate('Audio');
    await click('#audio-tab-mixer');
    await wait('document.querySelector(".audio-page")?.dataset.audioTab === "mixer"');
    await capture('audio-mixer');
    await settings('general');
    await click('[aria-label="Developer mode"]');
    await wait('window.switchboard.getSnapshot().then(s=>!s.settings.developerMode)');
    await navigate('Capture');
    await wait('Boolean(document.querySelector("#replay-status"))');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Instant Replay"]').disabled`),true);
    await click('[aria-label="Instant Replay"]');
    assert.equal(await evaluate('window.switchboard.getSnapshot().then(s=>s.capture.config.enabled)'),false);
    await capture('capture-unavailable');
    await field('[aria-label="Search clips"]','no-such-clip-audit');
    await wait('document.querySelector("[data-slot=input-group]")?.matches(":focus-within")');
    assert.ok((await evaluate('getComputedStyle(document.querySelector("[data-slot=input-group]")).boxShadow')).includes('2px'));
    await capture('capture-search-focus');
    await click('[aria-label="Clear search"]');
    await click('.capture-recorder-settings-trigger');
    await wait('Boolean(document.querySelector(".capture-replay-popover__warning"))');
    await capture('replay-unavailable');
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape",bubbles:true}))');
  }
  await settings('general');
  await evaluate('window.switchboard.updateSettings({uiScalePercent:125})');
  await viewport(1080,720);
  await settings('modules');
  await capture('modules-125-percent');
  await evaluate('window.switchboard.updateSettings({uiScalePercent:100})');
  const disk=JSON.parse(await readFile(join(userData,'switchboard-state.json'),'utf8'));
  assert.equal(disk.settings.developerMode,false);
  await writeFile(join(output,'controls.json'),JSON.stringify({passed:true,results,mode:'hidden Electron with fixture devices; same isolated profile'},null,2));
  console.log('Focused controls and contrast verification passed.');
  app.quit();
}).catch(async error=>{console.error(error);await writeFile(join(output,'controls-failure.txt'),String(error));app.exit(1);});
