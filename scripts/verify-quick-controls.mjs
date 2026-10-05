// Hidden native UI acceptance. Hardware-affecting actions use explicit response fixtures.
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.switchboard', 'quick-panel-redesign-review');
const userData = await mkdtemp(join(tmpdir(), 'switchboard-quick-panel-'));
await mkdir(output, { recursive: true });
app.setName('switchboard-quick-panel-review'); app.setAppPath(root); app.setPath('userData', userData);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = function () { throw Error('Review cannot show a window.'); };
BrowserWindow.prototype.focus = function () {};
let fixture = null, expected = null, fault = null, snapshotGate = null, main, quick;
const evidence = { userData, layouts: [], checks: [], errors: [], scope: 'Hidden native Electron. Persisted app/capture settings use real IPC/controller/store; active replay, scene and startup integration use labeled response fixtures. No physical audio, recorded media or global keyboard injection.' };
let completed = false;
process.on('exit', () => { if (!completed) writeFileSync(join(output,'verification.json'),JSON.stringify({...evidence,passed:false,failure:'Native review exited before completion.'},null,2)); });
app.on('before-quit', () => { if (!completed) console.error('Review quit early; windows:',BrowserWindow.getAllWindows().map(w=>({title:w.getTitle(),visible:w.isVisible()}))); });
app.on('browser-window-created', (_, window) => {
  window.webContents.setBackgroundThrottling(false);
  window.webContents.on('console-message', event => { if (event.level === 'error') evidence.errors.push(event.message); });
  const send = window.webContents.send.bind(window.webContents);
  let revision = 0;
  window.webContents.send = (channel, ...args) => {
    if (snapshotGate && channel === 'system:snapshot-updated') return;
    if (channel === 'system:snapshot-updated') {
      const frame = args[0];
      send(channel, fixture ? { type: 'full', revision: ++revision, snapshot: fixture } : { ...frame, revision: ++revision });
    } else send(channel, ...args);
  };
});
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => handle(channel, async (...args) => {
  if (channel === 'system:get-snapshot' && snapshotGate) await snapshotGate;
  if (channel === 'system:get-snapshot' && fixture) return structuredClone(fixture);
  if (fault?.channel === channel) { const current = fault; fault = null; await current.wait; throw Error('Review fixture: change rejected. Last confirmed settings retained.'); }
  if (expected?.channel === channel) {
    const current = expected; expected = null;
    assert(JSON.stringify(args[1]) === JSON.stringify(current.input), `Unexpected ${channel} input: ${JSON.stringify(args[1])}`);
    current.apply?.(fixture);
    evidence.checks.push(`Fixture intent: ${channel} ${JSON.stringify(args[1])}`);
    return structuredClone(fixture);
  }
  return handler(...args);
});
const watchdog = setTimeout(() => { console.error('Quick panel review timed out'); app.exit(2); }, 150000);
await import('../out/main/index.js');
void app.whenReady().then(async () => { try {
  await until(async () => { main = BrowserWindow.getAllWindows()[0]; return main && !main.webContents.isLoading() && await js(main, 'Boolean(window.switchboard)'); });
  await js(main, `window.switchboard.updateSettings({onboardingCompleted:true,uiScalePercent:100,scanGamesAutomatically:false})`);
  await js(main, `window.switchboard.setCaptureConfig({hotkey:'Control+Alt+Shift+F11'})`);
  await open();
  const replayRejection = await js(quick, `window.switchboard.saveReplay().then(()=>'',error=>error.message)`);
  assert(replayRejection.includes('Enable Instant Replay') && !replayRejection.includes('untrusted'), 'Panel replay save must pass the real sender check and reach the capture controller.');
  evidence.checks.push('Real replay-save IPC accepts the panel and reaches the stopped-engine guard.');
  const bounds = quick.getBounds();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  assert(bounds.x + bounds.width === display.x + display.width - 12 && bounds.y === display.y + 12 && bounds.height === Math.min(860, display.height - 24), 'Panel must float inside the work area.');
  evidence.checks.push('Native window has a 12px work-area inset and bounded height.');
  for (const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
    main.setMinimumSize(1,1); main.setContentSize(width,height,false);
    await size(460,Math.min(860,height-24));
    for (const tab of ['capture','frame','app']) { await selectTab(tab); await capture(`${width}x${height}-${tab}`); }
  }
  await size(460,720); await selectTab('capture');
  await openSelect('Replay duration');
  assert(await js(quick, `Boolean(document.querySelector('[role="option"][data-state="checked"]'))`), 'Custom menu must identify the selected option.');
  await capture('460x720-replay-menu');
  quick.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
  quick.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  await until(()=>js(quick, `!document.querySelector('[role="listbox"]')`));
  assert(!quick.isDestroyed(), 'Escape must close the dropdown before the panel.');
  await until(()=>js(quick, `document.activeElement?.getAttribute('aria-label')==='Replay duration'`));
  await openSelect('Video quality');
  for (const [keyCode,value] of [['Home','1'],['Down','2']]) {
    quick.webContents.sendInputEvent({type:'keyDown',keyCode}); quick.webContents.sendInputEvent({type:'keyUp',keyCode});
    await until(()=>js(quick,`document.activeElement?.dataset.value===${JSON.stringify(value)}`));
  }
  quick.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'}); quick.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await until(async()=> (await state()).capture.config.quality===2);
  evidence.checks.push('Custom dropdown keyboard selection, checkmark and Escape focus restoration.');
  for (const [label,value,key] of [['Replay duration','90','replaySeconds'],['Resolution','1080p','resolution'],['Frame rate','30','fps'],['Video quality','3','quality'],['Capture source','window','source'],['Desktop audio','game','systemAudioMode']]) {
    await select(label,value);
    assert(String((await state()).capture.config[key]) === value, `${label} did not reach canonical state.`);
  }
  for (const [label,key] of [['Include cursor','includeCursor'],['Record microphone','includeMic'],['Record chat separately','includeChatAudio']]) {
    const before = (await state()).capture.config[key]; await click(`[aria-label="${label}"]`);
    await until(async () => (await state()).capture.config[key] === !before);
  }
  await select('Desktop audio','off');
  assert(!(await state()).capture.config.includeSystemAudio, 'Desktop audio Off did not disable its recording.');
  await selectTab('app');
  const preferences = (await state()).setup.preferences;
  await click('[aria-label="Open from anywhere"]');
  await until(async()=> (await state()).setup.preferences.quickControlsEnabled !== preferences.quickControlsEnabled);
  await js(quick, `window.switchboard.getSnapshot().then(s=>window.switchboard.setSetupPreferences({...s.setup.preferences,quickShortcut:'Control+Shift+Space'}))`);
  assert((await state()).setup.preferences.quickShortcut==='Control+Shift+Space','Shortcut choice did not persist through the panel IPC allowlist.');
  await click('[aria-label="Open from anywhere"]');
  for (const [label,key] of [['Performance guard','performanceGuard'],['Low resource rendering','softwareRendering'],['Check for app updates','automaticAppUpdates'],['Release interface in tray','destroyRendererInTray'],['Close to tray','closeToTray']]) {
    const before = (await state()).settings[key]; await click(`[aria-label="${label}"]`); await until(async () => (await state()).settings[key] === !before);
  }
  assert(await js(quick, `document.querySelector('[aria-label="Release interface in tray"]').disabled`), 'Tray release must follow close-to-tray.');
  evidence.checks.push('Capture and app controls persist through real canonical IPC. Dependent disabled states verified.');
  // Real framing windows stay hidden throughout; no recording or desktop input is injected.
  await js(quick, 'window.switchboard.updateSettings({closeToTray:true})');
  const guideWindow = () => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Switchboard vertical guide');
  const displayListenerCount = screen.listenerCount('display-metrics-changed');
  await selectTab('frame');
  await click('[aria-label="Vertical framing guide"]');
  await until(async () => (await state()).setup.preferences.verticalGuide.enabled && guideWindow());
  let guide = guideWindow();
  assert(!guide.isVisible() && !guide.isFocusable() && guide.isAlwaysOnTop(), 'Guide must be hidden in review, non-focusable and always on top.');
  const guideLayout = await js(quick,'window.switchboard.getVerticalGuideLayout()');
  assert(guideLayout.frame.width * 16 === guideLayout.frame.height * 9, 'Phone frame must be exactly 9:16.');
  for (const [label,value,key] of [['Frame size',70,'size'],['Horizontal position',25,'horizontal'],['Vertical position',75,'vertical']]) {
    await range(label,value); await until(async () => (await state()).setup.preferences.verticalGuide[key] === value);
  }
  await select('Outline color','lime');
  await until(async () => (await state()).setup.preferences.verticalGuide.color === 'lime');
  await range('Darken outside frame',0); await until(async()=>(await state()).setup.preferences.verticalGuide.dim===0);
  await capture('frame-dimming-off');
  await range('Darken outside frame',35); await until(async()=>(await state()).setup.preferences.verticalGuide.dim===35);
  await select('Frame shape','custom');
  for (const [label,value,key] of [['Frame width',600,'width'],['Frame height',1000,'height'],['Frame left',80,'x'],['Frame top',100,'y']]) {
    await numberInput(label,value); await until(async()=>(await state()).setup.preferences.verticalGuide.frame[key]===value);
  }
  await capture('frame-exact-pixels');
  const exactFrame=(await state()).setup.preferences.verticalGuide.frame;
  assert(await js(quick, `window.switchboard.getSnapshot().then(s=>window.switchboard.setSetupPreferences({...s.setup.preferences,verticalGuide:{...s.setup.preferences.verticalGuide,frame:{x:0,y:0,width:32768,height:32768}}})).then(()=>false,()=>true)`),'Out-of-display frame accepted.');
  assert(JSON.stringify((await state()).setup.preferences.verticalGuide.frame)===JSON.stringify(exactFrame),'Rejected geometry lost confirmed frame.');
  await capture('frame-guide-enabled');
  await writeFile(join(output,'native-guide.png'),(await guide.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  const guideBounds = guide.getBounds();
  quick.emit('blur'); await until(()=>quick.isDestroyed());
  assert(!guide.isDestroyed(), 'Dismissing Quick Controls must retain the guide.');
  await open(); await selectTab('frame');
  assert(JSON.stringify(guide.getBounds()) === JSON.stringify(guideBounds), 'Reopening the panel moved the guide.');
  await clickText('Reset frame'); await until(async () => (await state()).setup.preferences.verticalGuide.size === 100);
  await click('[aria-label="Vertical framing guide"]'); await until(()=>!guideWindow());
  assert(screen.listenerCount('display-metrics-changed')===displayListenerCount, 'Disabled guide retained display listeners.');
  const nativeLoad = BrowserWindow.prototype.loadURL;
  BrowserWindow.prototype.loadURL = function(url,...args) { return url.startsWith('data:text/html') ? Promise.reject(Error('Review fixture: guide load failed')) : nativeLoad.call(this,url,...args); };
  await click('[aria-label="Vertical framing guide"]');
  await until(()=>js(quick, `document.querySelector('[role="alert"]')?.textContent.includes('guide load failed')`));
  assert(!(await state()).setup.preferences.verticalGuide.enabled && !guideWindow(), 'Failed guide creation changed confirmed state or leaked a window.');
  BrowserWindow.prototype.loadURL = nativeLoad;
  for (let cycle=0;cycle<3;cycle++) {
    await click('[aria-label="Vertical framing guide"]'); await until(()=>guideWindow());
    await click('[aria-label="Vertical framing guide"]'); await until(()=>!guideWindow());
  }
  await click('[aria-label="Vertical framing guide"]'); await until(()=>guideWindow());
  guide=guideWindow(); guide.webContents.forcefullyCrashRenderer();
  await until(async()=> !guideWindow() && !(await state()).setup.preferences.verticalGuide.enabled);
  assert(screen.listenerCount('display-metrics-changed')===displayListenerCount, 'Crashed guide retained display listeners.');
  await selectTab('app');
  if (await js(quick, `!document.querySelector('[aria-label="Frosted glass"]').disabled`)) {
    await click('[aria-label="Frosted glass"]'); await until(async()=> (await state()).setup.preferences.quickSurface==='solid');
    await capture('panel-solid');
    await click('[aria-label="Frosted glass"]'); await until(async()=> (await state()).setup.preferences.quickSurface==='frosted');
    await capture('panel-frosted');
  }
  evidence.checks.push('Real guide IPC, exact aspect, size/position/color, reset, retained on panel dismissal, disabled cleanup, rejected creation, repeated lifecycle and renderer crash recovery. Native material preference toggled.');
  const persisted = await state();
  quick.webContents.reload(); await delay(150); await until(() => !quick.webContents.isLoading() && js(quick, `Boolean(document.querySelector('.quick-tabs'))`).catch(() => false));
  assert(JSON.stringify((await state()).capture.config) === JSON.stringify(persisted.capture.config), 'Capture settings lost on reload.');
  await until(async () => JSON.parse(await readFile(join(userData,'switchboard-state.json'),'utf8')).capture.config.replaySeconds === 90);
  const disk = JSON.parse(await readFile(join(userData,'switchboard-state.json'),'utf8'));
  assert(disk.settings.softwareRendering === persisted.settings.softwareRendering && disk.settings.closeToTray === persisted.settings.closeToTray, 'App settings were not saved to disk.');
  evidence.checks.push('Renderer reload and persisted state file agree.');

  // Real allowlist and schema failures must not mutate saved values.
  assert(await js(quick, `window.switchboard.deleteScene('review-denied').then(()=>false,()=>true)`), 'Panel escaped its IPC allowlist.');
  assert(await js(quick, `window.switchboard.setCaptureConfig({fps:999}).then(()=>false,()=>true)`), 'Invalid capture input passed validation.');
  await selectTab('capture');
  let reject; fault = {channel:'capture:set-config', wait:new Promise(resolve => { reject=resolve; })};
  await select('Replay duration','120',false); await capture('460x720-pending');
  assert(await js(quick, `document.querySelector('[aria-label="Replay duration"]').disabled`), 'Pending controls remained enabled.');
  reject(); await until(() => js(quick, `Boolean(document.querySelector('[role="alert"]'))`));
  assert(await js(quick, `document.querySelector('[aria-label="Replay duration"]').dataset.value==='90'`), 'Rejected setting did not keep confirmed value.');
  await capture('460x720-rejected');
  evidence.checks.push('Allowlist, schema rejection, pending and rollback verified.');

  // Fixture-only active responses exercise replay, scene and app controls without changing devices.
  fixture = structuredClone(persisted);
  fixture.settings.developerMode = true;
  fixture.capture.config.enabled=true; fixture.capture.runtime.state='buffering'; fixture.capture.runtime.bufferedSeconds=76;
  fixture.capture.runtime.activeSource={id:'review-game',type:'window',name:'Review game window',available:true};
  await publish(); await selectTab('capture');
  await capture('460x720-replay-active-fixture');
  await expectAction('capture:save-replay',undefined,null,()=>click('.quick-save'));
  await expectAction('capture:set-config',{enabled:false},s=>{s.capture.config.enabled=false;s.capture.runtime.state='stopped';},()=>click('button[aria-label="Instant Replay"]'));
  await expectAction('capture:set-config',{enabled:true},s=>{s.capture.config.enabled=true;s.capture.runtime.state='buffering';},()=>click('button[aria-label="Instant Replay"]'));
  await selectTab('app'); await expectAction('settings:update',{launchAtStartup:!fixture.settings.launchAtStartup},s=>s.settings.launchAtStartup=!s.settings.launchAtStartup,()=>click('[aria-label="Launch at startup"]'));
  const sceneValues={capture:null,devices:[]};
  fixture.setup.scenes=[{id:'review-scene',name:'A long scene name for gaming, streaming and voice chat',executable:'',automatic:false,restoreOnExit:true,values:sceneValues}];
  await publish();
  await expectAction('setup:apply-scene','review-scene',s=>{s.setup.runtime.activeSceneId='review-scene';s.setup.runtime.state='partial';s.setup.runtime.issues=['Review fixture: a device is disconnected.'];s.setup.restore={before:sceneValues,applied:sceneValues,automatic:false,executable:'',restoreOnExit:true};},()=>click('.quick-scene-row'));
  await capture('460x720-partial-scene-fixture');
  await expectAction('setup:restore-scene',undefined,s=>{s.setup.restore=null;s.setup.runtime.state='idle';},()=>clickText('Restore previous setup'));

  // Keyboard traversal, focus, reflow and reduced motion in the same hidden session.
  quick.webContents.debugger.attach('1.3');
  await quick.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await js(quick, `document.querySelector('#quick-tab-app').focus()`);
  quick.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'}); quick.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
  await until(()=>js(quick, `document.activeElement?.id==='quick-tab-capture' && document.querySelector('#quick-tab-capture').getAttribute('aria-selected')==='true'`));
  const ax = await quick.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
  assert(ax.nodes.some(node=>node.role?.value==='switch' && node.name?.value==='Instant Replay'), 'Replay switch lacks accessible role/name.');
  await capture('460x720-keyboard-reduced-motion');
  await size(320,720); await capture('320x720-narrow');
  await size(460,720); quick.webContents.setZoomFactor(2); await capture('460x720-200-percent'); quick.webContents.setZoomFactor(1);
  evidence.checks.push('Native arrow-key tab navigation, accessible names, reduced motion, 320px width and 200% zoom.');
  fixture=null;
  void js(quick, 'window.switchboard.closeQuickControls()').catch(()=>{}); await until(()=>quick.isDestroyed());
  for (let i=0;i<3;i++) { await open(); void js(quick, `window.switchboard.closeQuickControls()`).catch(()=>{}); await until(()=>quick.isDestroyed()); }
  assert(BrowserWindow.getAllWindows().length===1,'Closed panel retained a native window.');
  await open(); quick.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'}); await until(()=>quick.isDestroyed());
  evidence.checks.push('Repeated open/close destroys the panel; Escape closes it.');
  let releaseSnapshot;
  snapshotGate=new Promise(resolve=>{releaseSnapshot=resolve;});
  await js(main,'window.switchboard.openQuickControls()');
  await until(async()=>{quick=BrowserWindow.getAllWindows().find(w=>w!==main);return quick&&!quick.webContents.isLoading()&&await js(quick,`Boolean(document.querySelector('.quick-loading'))`);});
  await size(460,720); await capture('460x720-loading');
  snapshotGate=null; releaseSnapshot(); await until(()=>js(quick,`Boolean(document.querySelector('.quick-tabs'))`));
  assert(await js(quick,`!document.body.innerText.includes('Release to close') && !document.body.innerText.includes('Keep open')`),'Panel retained obsolete held-shortcut instructions.');
  quick.emit('blur');await until(()=>quick.isDestroyed());
  evidence.checks.push('Loading and blur dismissal verified; obsolete held-shortcut controls removed.');
  completed=true;
  await writeFile(join(output,'verification.json'),JSON.stringify({...evidence,passed:true},null,2));
  console.log(JSON.stringify({passed:true,output,layouts:evidence.layouts.length,checks:evidence.checks.length})); clearTimeout(watchdog); app.quit();
} catch(error) {
  completed=true;
  evidence.failure=String(error.stack??error); try { await capture('failure'); } catch {}
  await writeFile(join(output,'verification.json'),JSON.stringify({...evidence,passed:false},null,2));
  console.error(evidence.failure); clearTimeout(watchdog); process.env.SWITCHBOARD_REVIEW_EXIT_CODE='1'; app.quit();
} });

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assert(value,message){if(!value)throw Error(message);}
function js(window,code){return window.webContents.executeJavaScript(code).catch(error=>{throw new Error(`${error.message}: ${code}`);});}
function state(){return js(quick,'window.switchboard.getSnapshot()');}
async function until(check){const end=Date.now()+12000;while(Date.now()<end){if(await check())return;await delay(40);}throw Error('Timed out waiting for panel state.');}
async function open(){await js(main,'window.switchboard.openQuickControls()');await until(async()=>{quick=BrowserWindow.getAllWindows().find(w=>w!==main && w.getTitle()!=='Switchboard vertical guide');return quick&&!quick.webContents.isLoading()&&await js(quick,`Boolean(document.querySelector('.quick-tabs'))`);});}
async function size(width,height){quick.setContentSize(width,height,false);await delay(100);const actual=await js(quick,'({w:innerWidth,h:innerHeight})');if(actual.w!==width||actual.h!==height){const b=quick.getBounds();quick.setSize(b.width+width-actual.w,b.height+height-actual.h,false);await delay(80);}}
async function selectTab(tab){await click(`#quick-tab-${tab}`);await until(()=>js(quick,`document.querySelector('#quick-tab-${tab}').getAttribute('aria-selected')==='true'`));}
async function click(selector){assert(await js(quick,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.click();return true})()`),`Unavailable control ${selector}`);await delay(70);}
async function clickText(text){await js(quick,`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await delay(70);}
async function openSelect(label){
  await until(()=>js(quick,`!document.querySelector('[role="listbox"]') && document.querySelector('[role="combobox"][aria-label=${JSON.stringify(label)}]')?.disabled===false`));
  await js(quick,`document.querySelector('[role="combobox"][aria-label=${JSON.stringify(label)}]').focus()`);
  quick.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'}); quick.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
  await until(()=>js(quick,`Boolean(document.querySelector('[role="listbox"]'))`));
}
async function select(label,value,settle=true){
  await openSelect(label);
  await until(()=>js(quick,`Boolean(document.querySelector('[role="option"][data-value=${JSON.stringify(value)}]'))`));
  await js(quick,`document.querySelector('[role="option"][data-value=${JSON.stringify(value)}]').focus()`);
  quick.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'}); quick.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
  await until(()=>js(quick,`!document.querySelector('[role="listbox"]')`));
  if(settle)await delay(80);
}
async function range(label,value){await js(quick,`(()=>{const e=document.querySelector('input[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${value});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(30);await js(quick,`document.querySelector('input[aria-label=${JSON.stringify(label)}]').dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}))`);await delay(70);}
async function numberInput(label,value){await js(quick,`(()=>{const e=document.querySelector('input[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify('')}+${value});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(30);await js(quick,`document.querySelector('input[aria-label=${JSON.stringify(label)}]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await delay(70);}
async function publish(){quick.webContents.send('system:snapshot-updated',fixture);await delay(80);}
async function expectAction(channel,input,apply,action){expected={channel,input,apply};await action();await until(()=>expected===null);await delay(30);}
async function capture(name){
  assert(!quick.isVisible()&&!quick.isFocused(),'Panel became visible or focused.');
  await js(quick,'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  await js(quick,'document.getAnimations().forEach(animation=>{if(animation.effect?.getTiming().iterations!==Infinity)animation.finish()})');
  await quick.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
  await delay(100);
  const layout=await js(quick,`({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,bodyScroll:document.querySelector('.quick-body')?.scrollHeight,bodyHeight:document.querySelector('.quick-body')?.clientHeight,tab:document.querySelector('[role="tab"][aria-selected="true"]')?.textContent})`);
  assert(layout.scrollWidth<=layout.width,`${name}: horizontal overflow.`);
  await writeFile(join(output,`${name}.png`),(await quick.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());evidence.layouts.push({name,...layout});
}
