import { SnapshotPublisher, snapshotStreamChannel } from '../src/shared/snapshot-stream';
import { AudioDependencySetup, AudioSetupCancelled, type AudioSetupInventory } from '../src/main/services/audio-dependency-setup';
import { audioSetupActionSchema } from '../src/shared/contracts';
// Hidden native UI regression with a persisted fixture; never starts a recorder.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StateStore } from '../src/main/services/state-store';
import { parseAudioEndpoints } from '../src/main/services/audio-endpoint-discovery';
import { captureConfigSchema, ipcChannels, setCaptureConfigInputSchema, updateSettingsInputSchema } from '../src/shared/contracts';

const root = process.cwd();
const directory = resolve(root, '.switchboard/audio-dependency-ui');
await mkdir(directory, {recursive:true});
app.setPath('userData', join(directory, 'profile'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
void app.whenReady().then(run).catch((error) => { console.error(error); app.exit(1); });
async function run() {
let store = new StateStore(join(directory, 'state.json'));
await store.load();
store.update(draft=>{draft.settings.onboardingCompleted=false;draft.settings.developerMode=false;draft.settings.visibleWorkspaces=['devices','capture'];draft.audio.enabled=false;draft.capture.config.enabled=false;});
const window = new BrowserWindow({ show: false, frame: false, useContentSize: true, x: -30000, y: -30000, width: 1080, height: 720,
  webPreferences: { preload: resolve(root, 'out/preload/index.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false },
});
let rejectStart = false;
let requests = 0;
let starts = 0;
const physicalDevices = parseAudioEndpoints([
  { id: 'usb-speakers', name: 'USB Speakers', flow: 'render', isDefault: true, volume: 1, muted: false },
  { id: 'usb-headset', name: 'USB Headset', flow: 'render', isDefault: false, volume: 1, muted: false },
  { id: 'usb-mic', name: 'USB Microphone', flow: 'capture', isDefault: true, volume: 1, muted: false },
]);
store.update((draft) => { draft.audio.devices = physicalDevices; draft.settings.uiScalePercent = 100; });
const publisher = new SnapshotPublisher();
const publish = () => window.webContents.send(ipcChannels.snapshotUpdated, publisher.next(store.get(),true));
ipcMain.on(snapshotStreamChannel,publish);
ipcMain.handle('montage-v2:list-drafts', () => []);
ipcMain.handle(ipcChannels.getSnapshot, () => store.get());
ipcMain.handle(ipcChannels.updateSettings, async (_event, input) => {
  const patch = updateSettingsInputSchema.parse(input);
  const result = store.update((draft) => { Object.assign(draft.settings, patch); });
  await store.flush();
  return result;
});
ipcMain.handle(ipcChannels.setCaptureConfig, async (_event, input) => {
  requests++;
  const patch = setCaptureConfigInputSchema.parse(input);
  const enabling = patch.enabled === true && !store.get().capture.config.enabled;
  if (enabling) starts++;
  await new Promise((resolve) => setTimeout(resolve, enabling ? 800 : 50));
  if (rejectStart) throw new Error('Fixture capture start failed');
  const result = store.update((draft) => {
    draft.capture.config = captureConfigSchema.parse({ ...draft.capture.config, ...patch });
    draft.capture.runtime.state = draft.capture.config.enabled ? 'waiting' : 'stopped';
    draft.capture.runtime.error = undefined;
    draft.capture.runtime.warning = undefined;
    draft.capture.capabilities.backend = 'windows-graphics-capture';
    draft.capture.capabilities.encoders = ['libx264'];
    draft.capture.capabilities.systemAudio = true;
    draft.capture.capabilities.microphoneAudio = true;
  });
  await store.flush();
  return result;
});

let inventory: AudioSetupInventory = {cable:false,microphone:false,microphoneRateReady:false,bootTimeMs:1000000,defaults:[],registered:{cable:false,microphone:false}};
let receipt: number|null=null;
let simulateFailure=false;
let holdDownload=false;
let installs=0;
const setup=new AudioDependencySetup({
 inspect:async()=>inventory,receipt:async()=>receipt,record:async value=>{receipt=value;},acquire:async()=>async()=>{},
 download:async(_kind,signal,progress)=>{progress(35);if(holdDownload)await new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Download cancelled.')),{once:true}));await new Promise(r=>setTimeout(r,50));return 'fixture';},
 install:async(kind)=>{if(simulateFailure)throw new AudioSetupCancelled();installs++;await new Promise(r=>setTimeout(r,150));inventory={...inventory,[kind]:true,registered:{...inventory.registered,[kind]:true}};},
 configure:async()=>{inventory={...inventory,microphoneRateReady:true};return inventory;},
},state=>{store.updateBranches(['audio'],draft=>{draft.audio.dependencies=state;},{persist:false});publish();});
ipcMain.handle(ipcChannels.audioDependencySetup,(_event,input)=>{const action=audioSetupActionSchema.parse(input);if(action==='cancel')setup.cancel();else setup.start(action==='install');return store.get();});
ipcMain.handle(ipcChannels.setAudioEnabled,(_event,enabled)=>{if(typeof enabled!=='boolean')throw Error('Invalid enabled');return store.update(d=>{d.audio.enabled=enabled;});});
const evaluate=(code:string)=>window.webContents.executeJavaScript(code);
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const assert=(condition:boolean,message:string)=>{if(!condition)throw Error(message);};
async function wait(code:string){for(let i=0;i<200;i++){if(await evaluate(code))return;await delay(50);}throw Error('Timed out '+code);}
async function click(label:string){await wait(`[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===${JSON.stringify(label)})`);await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)}).click()`);await delay(80);}
async function capture(name:string){
 await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
 await delay(800); // Let the outgoing onboarding step finish before taking a native frame.
 for(const [width,height] of [[1080,720],[1420,900],[1920,1080]]){
  window.setMinimumSize(1,1);window.setContentSize(width!,height!);await delay(50);
  const v=await evaluate('({w:innerWidth,h:innerHeight})');const o=window.getSize();window.setSize(o[0]+width!-v.w,o[1]+height!-v.h);await delay(200);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Horizontal overflow '+name);
  assert(await evaluate(`(()=>{const p=document.querySelector('.onboarding-main');return !p||p.scrollHeight<=p.clientHeight+1})()`),'Onboarding requires scrolling '+name);
  await writeFile(join(directory,`${name}-${width}.png`),(await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
}
try {
 await window.loadFile(resolve(root,'out/renderer/index.html'));
 window.webContents.debugger.attach('1.3');await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await delay(1800);
 await click('Get started');
 await wait(`Boolean(document.querySelector('[aria-label="Show the Audio page"]'))`);
 assert(installs===0,'Onboarding installed without opt-in');
 await evaluate(`document.querySelector('[aria-label="Show the Audio page"]').click()`);
 await capture('onboarding-opt-in');await click('Continue');
 await wait(`Boolean(document.querySelector('[aria-label="Capture engine"]'))`);
 await evaluate(`document.querySelector('[aria-label="Capture engine"]').click()`);
 await click('Continue');await click('Continue');
 await wait(`document.querySelector('.onboarding-screen')?.getAttribute('data-step')==='audio-setup'`);
 await wait(`document.querySelector('[aria-label="Audio driver setup"]')?.getAttribute('aria-busy')==='false'`);
 await capture('onboarding-missing');
 holdDownload=true;await click('Install audio drivers');
 await wait(`document.body.innerText.includes('Downloading VB-CABLE')`);await capture('onboarding-downloading');
 await click('Cancel download');await wait(`document.body.innerText.includes('Download cancelled.')`);
 holdDownload=false;simulateFailure=true;await click('Retry audio setup');await wait(`document.body.innerText.includes('administrator approval was cancelled')`);await capture('onboarding-error');
 simulateFailure=false;await click('Retry audio setup');await wait(`document.body.innerText.includes('Restart Windows to finish')`);await capture('onboarding-restart');
 assert(installs===2,'Expected exactly two missing driver installs');
 await click('Continue');await click('Open Devices');
 await wait(`!document.querySelector('.onboarding-screen')`);
 assert(!store.get().settings.developerMode&&store.get().settings.visibleWorkspaces.includes('audio'),'Normal user audio selection lost');
 await evaluate(`sessionStorage.setItem('switchboard.settings.category','audio');location.hash='settings'`);
 await wait(`Boolean(document.querySelector('[aria-label="Audio driver setup"]'))`);await capture('settings-restart');
 window.reload();await new Promise(r=>window.webContents.once('did-finish-load',r));await wait(`document.body.innerText.includes('Restart Windows to finish')`);
 inventory={...inventory,bootTimeMs:1200000};await click('Check again');await wait(`document.body.innerText.includes('Audio drivers are ready')`);await capture('settings-ready');
 await evaluate(`document.querySelector('[data-setting-id="audio.engine"] [role="switch"]').focus()`);
 window.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
 await wait(`window.switchboard.getSnapshot().then(s=>s.audio.enabled)`);
 await store.flush();const reopened=new StateStore(join(directory,'state.json'));await reopened.load();
 assert(reopened.get().audio.dependencies.phase==='idle','Transient installer state leaked into persisted preferences');
 assert(reopened.get().audio.enabled,'Audio choice was not persisted');
 await writeFile(join(directory,'verification.json'),JSON.stringify({fixture:true,normalUser:true,optIn:true,cancelDownload:true,uacCancel:true,retry:true,restart:true,reload:true,keyboardEnable:true,installs,viewports:[1080,1420,1920]},null,2));
 console.log('Audio dependency onboarding/settings UI passed. Vendor installation was simulated.');
}catch(error){console.error(error);console.log(await evaluate('document.body.innerText'));await writeFile(join(directory,'failure.png'),(await window.webContents.capturePage(undefined,{stayHidden:true})).toPNG());process.exitCode=1;}finally{setup.dispose();window.destroy();app.quit();}
}
