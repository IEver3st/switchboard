import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userData = await mkdtemp(join(tmpdir(), 'switchboard-setup-review-'));
const output = join(projectRoot, '.switchboard', 'setup-review', `${Date.now()}`);
await mkdir(output, { recursive: true });
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setName('switchboard-setup-review'); app.setAppPath(projectRoot); app.setPath('userData', userData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
// Fail before any review window could be shown or activated on a protected monitor.
BrowserWindow.prototype.show = function () { throw new Error('Visible windows are prohibited in this review.'); };
BrowserWindow.prototype.showInactive = function () { throw new Error('Visible windows are prohibited in this review.'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => window.webContents.setBackgroundThrottling(false));
const results = [];
const watchdog = setTimeout(() => { console.error('Setup UI review timed out', output); app.exit(2); }, 90_000);
await import('../out/main/index.js');
void app.whenReady().then(async () => { try {
  let window;
  await wait(async () => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading() && await js(window, 'Boolean(window.switchboard)'); });
  window.setMinimumSize(1, 1);
  await js(window, `window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100, scanGamesAutomatically: false })`);
  await js(window, `sessionStorage.setItem('switchboard.settings.category','setup'); location.hash='settings'`);
  await wait(() => js(window, `Boolean(document.querySelector('.setup-workspace'))`));
  for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
    await resize(window, width, height); await delay(100);
    await capture(window, `${width}x${height}-empty`);
  }
  await input(window, '.setup-field input', 'Work');
  await clickText(window, 'Save scene');
  await wait(async () => (await state(window)).setup.scenes.length === 1);
  const work = (await state(window)).setup.scenes[0];
  await js(window, `window.switchboard.setCaptureConfig({replaySeconds:90,systemAudioMode:'game'})`);
  await clickText(window, 'New scene'); await input(window, '.setup-field input', 'War Thunder');
  await js(window, `document.querySelector('[aria-label="Apply when an application starts"]').click()`);
  await wait(() => js(window, `Boolean(document.querySelector('input[placeholder="aces.exe"]'))`));
  await input(window, 'input[placeholder="aces.exe"]', 'aces.exe');
  await clickText(window, 'Save scene');
  await wait(async () => (await state(window)).setup.scenes.length === 2);
  const game = (await state(window)).setup.scenes[1];
  await js(window, `window.switchboard.setCaptureConfig({replaySeconds:120})`);
  await js(window, `window.switchboard.applyScene(${JSON.stringify(work.id)})`);
  let saved = await state(window);
  assert(saved.capture.config.replaySeconds === 60 && saved.capture.config.systemAudioMode === 'system', 'Work scene did not apply its capture configuration.');
  assert(saved.setup.runtime.state === 'active', JSON.stringify(saved.setup.runtime.issues));
  await js(window, `window.switchboard.applyScene(${JSON.stringify(game.id)})`);
  saved = await state(window);
  assert(saved.capture.config.systemAudioMode === 'game' && saved.capture.config.replaySeconds === 90, 'Game scene was not applied.');
  for (const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
    await resize(window,width,height); await delay(100); await capture(window, `${width}x${height}-scenes`);
  }
  await clickText(window, 'Restore previous setup');
  await wait(async () => (await state(window)).setup.restore === null);
  assert((await state(window)).capture.config.replaySeconds === 120, 'Original capture state was not restored.');
  await js(window, `window.switchboard.setCaptureConfig({includeMic:false})`);
  assert((await state(window)).capture.config.systemAudioMode === 'game', 'An unrelated patch reset game-only audio.');
  await js(window, `window.switchboard.getSnapshot().then(snapshot=>window.switchboard.setSetupPreferences({...snapshot.setup.preferences,quickControlsEnabled:true}))`);
  await clickText(window, 'Quick controls');
  await js(window, `document.querySelector('[aria-label="Show ChatMix"]').click()`);
  await wait(async () => !(await state(window)).setup.preferences.quickActions.includes('chatmix'));
  await js(window, `document.querySelector('[aria-label="Show ChatMix"]').click()`);
  await wait(async () => (await state(window)).setup.preferences.quickActions.includes('chatmix'));
  await choose(window, 'Quick controls shortcut', 'Control+Shift+Space');
  await wait(async () => (await state(window)).setup.preferences.quickShortcut === 'Control+Shift+Space');
  for (const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
    await resize(window,width,height); await delay(100); await capture(window, `${width}x${height}-quick-settings`);
  }
  await js(window, `window.switchboard.openQuickControls()`);
  let quick;
  await wait(async () => { quick = BrowserWindow.getAllWindows().find(item => item !== window); return quick && !quick.webContents.isLoading() && await js(quick, `Boolean(document.querySelector('.quick-controls h1'))`); });
  await capture(quick, 'quick-panel');
  await js(quick, `window.switchboard.applyScene(${JSON.stringify(work.id)})`);
  assert((await state(quick)).setup.runtime.activeSceneId === work.id, 'Quick scene action did not reach canonical state.');
  await capture(quick, 'quick-panel-active');
  const rejection = await js(quick, `window.switchboard.deleteScene('__setup-review-denied__').then(()=>false,()=>true)`);
  assert(rejection, 'Quick panel was allowed to call an IPC outside its allowlist.');
  void js(quick, `window.switchboard.closeQuickControls()`).catch(() => undefined);
  await wait(async () => quick.isDestroyed());
  await clickText(window, 'Status lighting');
  await js(window, `document.querySelector('[aria-label="Enable status lighting"]').click()`);
  await wait(async () => (await state(window)).setup.preferences.lighting.enabled);
  for (const label of ['Clip saved lighting cue','Microphone muted lighting cue','Capture error lighting cue']) {
    await js(window, `document.querySelector('[aria-label=${JSON.stringify(label)}]').click()`);
    await delay(50);
  }
  assert(Object.entries((await state(window)).setup.preferences.lighting).filter(([key])=>['clipSaved','microphoneMuted','captureError'].includes(key)).every(([,value])=>value===false),'Lighting preferences did not reach canonical state.');
  for (const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
    await resize(window,width,height); await delay(100); await capture(window, `${width}x${height}-lighting`);
  }
  await js(window, `document.querySelector('[data-settings-category="capture"]')?.click()`);
  await wait(() => js(window, `Boolean(document.querySelector('#capture-tab-audio'))`));
  await js(window, `document.querySelector('#capture-tab-audio').click()`);
  await wait(() => js(window, `Boolean(document.querySelector('#capture-audio-mode'))`));
  await js(window, `(()=>{const select=document.querySelector('#capture-audio-mode');select.value='game';select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(async () => (await state(window)).capture.config.systemAudioMode === 'game');
  for (const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
    await resize(window,width,height); await delay(100); await capture(window, `${width}x${height}-game-audio`);
  }
  window.webContents.reload();
  await wait(async () => !window.webContents.isLoading() && await js(window, `Boolean(window.switchboard && document.querySelector('.app-shell'))`));
  saved = await state(window);
  assert(saved.setup.scenes.length === 2 && saved.setup.preferences.quickControlsEnabled && saved.capture.config.systemAudioMode === 'game', 'Saved setup did not survive refresh.');
  assert(saved.setup.scenes[1].automatic && saved.setup.scenes[1].executable === 'aces.exe' && saved.setup.preferences.quickShortcut === 'Control+Shift+Space' && saved.setup.preferences.lighting.clipSaved === false, 'Setup controls did not survive refresh.');
  await js(window, `sessionStorage.setItem('switchboard.settings.category','setup'); location.hash='devices'`);
  await delay(100); await js(window, `location.hash='settings'`);
  await wait(() => js(window, `Boolean(document.querySelector('.setup-workspace'))`));
  const target = saved.devices.find(item => item.capabilities.dpi?.writable);
  if (target) {
    await js(window, `window.switchboard.setDeviceControl({deviceId:${JSON.stringify(target.id)},change:{type:'dpi',value:1200}})`);
    await js(window, `window.switchboard.setModuleState({moduleId:${JSON.stringify(target.moduleId)},enabled:false})`);
    await js(window, `window.switchboard.applyScene(${JSON.stringify(work.id)})`);
    assert((await state(window)).setup.runtime.state === 'partial', 'Unavailable scene device was reported as applied.');
    await resize(window,1080,720); await delay(100); await capture(window, '1080x720-partial-device');
    await js(window, `window.switchboard.setModuleState({moduleId:${JSON.stringify(target.moduleId)},enabled:true})`);
    await js(window, `window.switchboard.restoreScene()`);
  }
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'reduce'}] });
  await js(window, `document.querySelector('.setup-scene-list button')?.focus()`);
  await resize(window,1080,720); await delay(100); await capture(window,'1080x720-reduced-motion-focus');
  // Exercise the redesigned editor's draft controls, rejection recovery and destructive confirmation.
  await clickText(window, 'New scene');
  const longName='A long scene name for a work and replay setup '.padEnd(64,'X');
  await input(window,'.setup-field input',longName);
  await toggle(window,'#setting-setup\\.includeDevices button');
  await toggle(window,'#setting-setup\\.includeCapture button');
  await clickText(window,'Save scene');
  await wait(()=>js(window,`Boolean(document.querySelector('.setup-error[role="alert"]'))`));
  assert(await js(window,`document.querySelector('.setup-field input').value===${JSON.stringify(longName)}`),'Rejected save lost its draft');
  await capture(window,'1080x720-save-error');
  await toggle(window,'#setting-setup\\.includeCapture button');
  await clickText(window,'Save scene');
  await wait(async()=>(await state(window)).setup.scenes.length===3);
  await choose(window,'Saved scenes','Work · Manual');
  assert(await js(window,`document.querySelector('.setup-field input').value==='Work'`),'Scene selection did not change editor');
  await choose(window,'Saved scenes',longName+' · Manual');
  await toggle(window,'#setting-setup\\.recapture button');
  await toggle(window,'#setting-setup\\.includeDevices button');
  await clickText(window,'Save changes');
  await wait(async()=>Boolean((await state(window)).setup.scenes[2].values.devices.length));
  await clickText(window,'Apply scene');
  await wait(async()=>(await state(window)).setup.runtime.activeSceneId===(await state(window)).setup.scenes[2].id);
  assert(await js(window,`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Delete').disabled`),'Active scene deletion should be disabled');
  await clickText(window,'Restore previous setup');
  await wait(async()=>(await state(window)).setup.restore===null);
  for(const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {await resize(window,width,height);await capture(window,`${width}x${height}-long-scene`);}
  await clickText(window,'Delete');await capture(window,'delete-confirmation');await clickText(window,'Cancel');
  assert(await js(window,`!document.querySelector('.setup-delete')`),'Delete cancel did not close confirmation');
  await clickText(window,'Delete');await clickText(window,'Delete scene');
  await wait(async()=>(await state(window)).setup.scenes.length===2);
  await clickText(window,'Quick controls');
  for(const action of ['Scenes','Save replay','Microphone','Output device','ChatMix']) {
    const before=(await state(window)).setup.preferences.quickActions;
    await toggle(window,`[aria-label="Show ${action}"]`);await delay(80);
    assert(JSON.stringify((await state(window)).setup.preferences.quickActions)!==JSON.stringify(before),'Quick action did not persist');
    await toggle(window,`[aria-label="Show ${action}"]`);await delay(80);
  }
  await toggle(window,'[aria-label="Enable quick controls shortcut"]');
  await wait(async()=>!(await state(window)).setup.preferences.quickControlsEnabled);
  await toggle(window,'[aria-label="Enable quick controls shortcut"]');
  await wait(async()=>(await state(window)).setup.preferences.quickControlsEnabled);
  window.webContents.reload();await wait(async()=>!window.webContents.isLoading()&&await js(window,`Boolean(document.querySelector('.setup-workspace'))`));
  assert((await state(window)).setup.scenes.length===2,'Deletion did not survive reload');
  await writeFile(join(output,'verification.json'),JSON.stringify({passed:true, userData, results, scope:'Hidden native Electron with canonical fixture devices. No physical HID, real media capture, or global key injection.'},null,2));
  console.log(JSON.stringify({passed:true,output,checks:results.length})); clearTimeout(watchdog); app.quit();
} catch (error) {
  await writeFile(join(output,'failure.json'),JSON.stringify({error:String(error),stack:error.stack,results},null,2));
  console.error(error,output); clearTimeout(watchdog); app.exit(1);
} });
function js(window,code) { return window.webContents.executeJavaScript(code).catch(error => { throw new Error(`${code}: ${error}`); }); }
function state(window) { return js(window,'window.switchboard.getSnapshot()'); }
async function clickText(window,text) { await js(window, `(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(text)}); if(!button)throw new Error('Missing button: '+${JSON.stringify(text)});button.click()})()`); await delay(40); }
async function input(window,selector,value) { await js(window, `(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`); }
async function capture(window,name) {
  assert(!window.isVisible(),'A review window became visible.');
  await js(window, `Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>undefined))).then(()=>true)`);
  const layout=await js(window,`({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,alerts:[...document.querySelectorAll('[role="alert"]')].map(item=>item.textContent)})`);
  assert(layout.scrollWidth<=layout.width,`${name} has horizontal overflow.`);
  const image=await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
  assert(!image.isEmpty(),`${name} screenshot is empty.`); await writeFile(join(output,`${name}.png`),image.toPNG()); results.push({name,...layout});
}
async function wait(predicate) { const deadline=Date.now()+15000;while(Date.now()<deadline){if(await predicate())return;await delay(50);}throw new Error('Timed out waiting for review state.'); }
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function assert(condition,message){if(!condition)throw new Error(message);}

async function resize(window,width,height) {
  window.setBounds({x:-30000,y:-30000,width,height},false); await delay(150);
  for(let i=0;i<4;i++) {
    const inner=await js(window,'({width:innerWidth,height:innerHeight})');
    if(inner.width===width&&inner.height===height)return;
    const bounds=window.getBounds();window.setBounds({...bounds,width:bounds.width+width-inner.width,height:bounds.height+height-inner.height},false);await delay(80);
  }
  const inner=await js(window,'({width:innerWidth,height:innerHeight})');assert(inner.width===width&&inner.height===height,`Incorrect viewport ${JSON.stringify(inner)} requested ${width}x${height}`);
}
async function choose(window,label,text) {
  await js(window,`document.querySelector('[aria-label="${label}"]').click()`);
  await wait(()=>js(window,`Boolean(document.querySelector('[role="option"]'))`));
  await js(window,`(()=>{const option=[...document.querySelectorAll('[role="option"]')].find(item=>item.textContent.trim()===${JSON.stringify(text)});if(!option)throw new Error('Missing option');option.focus();})()`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
  await wait(()=>js(window,`!document.querySelector('[role="option"]')`));
  await delay(80);
}

async function toggle(window,selector) {
  await js(window,`(()=>{const control=document.querySelector(${JSON.stringify(selector)});if(!control)throw new Error('Missing control');control.scrollIntoView({block:'nearest'});control.focus()})()`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
  await delay(80);
}
