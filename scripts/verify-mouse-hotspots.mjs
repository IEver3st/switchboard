import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'design-qa', 'mouse-hotspot-fix');
app.setName('switchboard-hotspot-review');
app.setAppPath(root);
app.setPath('userData', await mkdtemp(join(tmpdir(), 'switchboard-hotspots-')));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
const delay = ms => new Promise(r => setTimeout(r, ms));
let win;
const evaluate = code => win.webContents.executeJavaScript(code, true);
async function wait(code) {
  for (let i = 0; i < 150; i++) { if (await evaluate(code)) return; await delay(40); }
  throw new Error(`Timed out: ${code}`);
}
async function click(selector) {
  const p = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw Error('Missing target'); const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),disabled:e.closest('button')?.disabled,cursor:getComputedStyle(e).cursor};})()`);
  if (p.disabled || p.cursor === 'not-allowed') throw new Error(`Hotspot is blocked: ${selector} ${JSON.stringify(p)}`);
  p.x = Math.round(p.x * win.webContents.getZoomFactor());
  p.y = Math.round(p.y * win.webContents.getZoomFactor());
  win.webContents.sendInputEvent({type:'mouseMove', x:p.x, y:p.y});
  await delay(40);
  win.webContents.sendInputEvent({type:'mouseDown', x:p.x, y:p.y, button:'left', clickCount:1});
  await delay(40);
  win.webContents.sendInputEvent({type:'mouseUp', x:p.x, y:p.y, button:'left', clickCount:1});
  await delay(100);
}
async function openMouse() {
  await wait(`Boolean(window.switchboard)`);
  await evaluate(`window.switchboard.updateSettings({onboardingCompleted:true})`);
  if (await evaluate(`Boolean(document.querySelector('.mouse-stage'))`)) return;
  await wait(`Boolean(document.querySelector('.device-gallery'))`);
  await evaluate(`[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.includes('G502 X Plus')).click()`);
  await wait(`document.querySelector('.mouse-stage canvas')?.dataset.renderState === 'ready'`);
}
async function setMode(enabled) {
  await evaluate(`(async()=>{const s=await window.switchboard.getSnapshot();const d=s.devices.find(d=>d.displayName==='G502 X Plus');await window.switchboard.setDeviceControl({deviceId:d.id,change:{type:'onboard-memory',enabled:${enabled}}});})()`);
  await wait(`document.querySelector('.mouse-stage')?.dataset.calloutsDisabled === ${enabled ? "'true'" : 'undefined'}`);
}
async function closePicker() {
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await wait(`!document.querySelector('.assignment-picker')`);
  await delay(250);
}
void app.whenReady().then(run);
async function run() {
try {
  for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows()[0];if(win && !win.webContents.isLoading()) break;await delay(40);}
  win.webContents.setZoomFactor(1);
  await openMouse();
  await setMode(true); // Existing fixture models the G HUB adapter's read-only onboard profile.
  const report=[];
  for(const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
    win.setContentSize(width,height); await delay(800);
    const ids=await evaluate(`[...document.querySelectorAll('[data-hotspot-id]')].map(e=>e.dataset.hotspotId)`);
    if(ids.length!==6) throw Error('Expected all six physical buttons');
    for(const id of ids) {
      console.log(`Clicking ${width}x${height} ${id}`);
      await click(`[data-hotspot-id="${id}"] .device-hotspot__dot`);
      await wait(`Boolean(document.querySelector('.assignment-picker'))`);
      const state=await evaluate(`({reason:document.querySelector('.assignment-picker__reason')?.textContent,enabledActions:[...document.querySelectorAll('[cmdk-item]')].filter(e=>e.getAttribute('aria-disabled')!=='true').length,overflow:document.documentElement.scrollWidth>innerWidth})`);
      if(!state.reason || state.enabledActions || state.overflow) throw Error(JSON.stringify(state));
      if(id==='back') {
        await delay(250);
        await writeFile(join(output,`${width}x${height}-readonly.png`),(await win.webContents.capturePage()).toPNG());
      }
      report.push({width,height,id,...state});
      await closePicker();
    }
  }
  await evaluate(`document.querySelector('[data-callout-id="back"]').focus()`);
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
  win.webContents.sendInputEvent({type:'char',keyCode:'\r'});
  win.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await wait(`Boolean(document.querySelector('.assignment-picker'))`);
  await evaluate(`[...document.querySelectorAll('[cmdk-item]')].find(e=>e.textContent.trim()==='Forward').click()`);
  const blockedAssignment = await evaluate(`(async()=>{const s=await window.switchboard.getSnapshot();return s.devices.find(d=>d.displayName==='G502 X Plus').capabilities.buttonAssignments.bindings.find(b=>b.buttonId==='back').currentActionId})()`);
  if(blockedAssignment !== 'mouse.back') throw Error('Read-only action wrote an assignment');
  await click('.assignment-picker [data-assignment-mode]');
  await wait(`document.querySelector('.mouse-stage')?.dataset.calloutsDisabled === undefined`);
  await wait(`document.querySelector('[cmdk-item][aria-disabled="false"]') !== null`);
  await evaluate(`[...document.querySelectorAll('[cmdk-item]')].find(e=>e.textContent.trim()==='Forward').click()`);
  await wait(`!document.querySelector('.assignment-picker')`);
  await wait(`document.querySelector('[data-callout-id="back"]')?.textContent.includes('Forward')`);
  win.webContents.reload(); await delay(200); await openMouse();
  const persisted=await evaluate(`(async()=>{const s=await window.switchboard.getSnapshot();return s.devices.find(d=>d.displayName==='G502 X Plus').capabilities.buttonAssignments.bindings.find(b=>b.buttonId==='back').currentActionId})()`);
  if(persisted!=='mouse.forward') throw Error('Assignment did not survive reload');
  for(const id of await evaluate(`[...document.querySelectorAll('[data-hotspot-id]')].map(e=>e.dataset.hotspotId)`)) {
    await click(`[data-hotspot-id="${id}"] .device-hotspot__dot`);
    await wait(`Boolean(document.querySelector('.assignment-picker'))`); await closePicker();
  }
  await writeFile(join(output,'report.json'),JSON.stringify({report,persisted,keyboardOpen:true,blockedAssignment},null,2));
  console.log('PASS: six dots open in read-only and writable states; three sizes; mode recovery; assignment persistence.');
  app.exit(0);
} catch(error) {
  console.error(error);
  if(win) {
    console.log(await evaluate(`({callouts:[...document.querySelectorAll('[data-callout-id]')].map(e=>({id:e.dataset.calloutId,disabled:e.disabled,open:e.dataset.state})),dots:[...document.querySelectorAll('.device-hotspot__dot')].map(e=>{const r=e.getBoundingClientRect();return {id:e.parentElement.dataset.hotspotId,at:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML}})})`));
    await writeFile(join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());
  }
  app.exit(1);
}

}
