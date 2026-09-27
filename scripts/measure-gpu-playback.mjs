import { execFileSync } from 'node:child_process';
// Hidden native Electron acceptance for the capture-only shell.
// Does not start capture, write media, or change the user's application profile.
import { app, BrowserWindow, ipcMain, contentTracing } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-gpu-playback-'));
const output = join(root, '.switchboard', 'gpu-playback-review', String(Date.now()));
await mkdir(output, { recursive: true });
const state = JSON.parse(await readFile(join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json'), 'utf8'));
const base = state.clips.find(clip => clip.thumbnailPath && existsSync(clip.thumbnailPath) && existsSync(clip.path));
if (!base) throw Error('A local clip with a real thumbnail is required for the library fixture.');
await mkdir(join(profile, 'cache', 'thumbnails'), { recursive: true });
state.capture.config.enabled = false;
state.capture.config.replayCacheDirectory = null;
state.capture.config.replaySeconds = 60;
state.capture.config.clipsDirectory = join(profile, 'Clips');
state.audio.enabled = false;
state.modules.forEach(module => { module.enabled = false; });
Object.assign(state.settings, { onboardingCompleted: true, visibleWorkspaces: ['devices', 'capture'], uiScalePercent: 100, automaticUpdates: false, scanGamesAutomatically: false });
await mkdir(state.capture.config.clipsDirectory);
await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
app.setName('switchboard-gpu-playback-review');
app.setAppPath(root);
app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = function () { throw Error('This review must remain hidden.'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => {
  window.setBounds({ x: -20000, y: -20000, width: 1420, height: 900 });
  window.webContents.setBackgroundThrottling(false);
  window.webContents.setAudioMuted(true);
});
const report = { scope: 'Hidden Electron capture-only shell with canonical snapshot fixtures. No live capture proof.', checks: [], screenshots: [], errors: [] };
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
let window, fixture;
const js = expression => window.webContents.executeJavaScript(expression);
function assert(value, label) { if (!value) throw Error(label); report.checks.push(label); }
async function wait(test, label) {
  const until = Date.now() + 15000;
  while (Date.now() < until) { if (await test()) return; await delay(50); }
  throw Error(`Timed out: ${label}`);
}
// Hidden windows may suspend rAF once reduced motion removes the last animation.
async function frames() {
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await delay(100);
}
async function capture(name) {
  // capturePage wakes painting in the hidden window; allow the updated frame to commit.
  for (let pass = 0; pass < 3; pass++) {
    await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await frames();
  }
  await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  report.screenshots.push(name);
}


const metrics=[];const tracing=[];let tracingStarted=false,heapEnabled=false,gpuPid;
const wpr=args=>{try{return {ok:true,output:execFileSync('wpr',args,{encoding:'utf8',windowsHide:true,timeout:20000})};}catch(e){return {ok:false,output:String(e.stdout??'')+String(e.stderr??'')+String(e.message)}}};
async function sample(phase){await frames();await delay(1500);metrics.push({phase,at:Date.now(),video:await js('(()=>{const v=document.querySelector("video");return v?{time:v.currentTime,paused:v.paused,readyState:v.readyState,error:v.error?.message??null}:null})()'),processes:app.getAppMetrics().map(p=>({pid:p.pid,type:p.type,privateMiB:p.memory.privateBytes/1024,residentMiB:p.memory.workingSetSize/1024}))});console.log('Sample',phase);await writeFile(join(output,'measurements.json'),JSON.stringify({softwareRendering:state.settings.softwareRendering,clips:state.clips.length,metrics,tracing},null,2));}
const watchdog=setTimeout(()=>app.exit(2),90000);
await import('../out/main/index.js');
void app.whenReady().then(async()=>{try{
 await wait(async()=>{window=BrowserWindow.getAllWindows()[0];return window&&!window.webContents.isLoading()&&await js('Boolean(window.switchboard)');},'window');
 await wait(()=>js('Boolean(document.querySelector(".capture-clip-card"))'),'library');
 window.webContents.debugger.attach('1.3');
 await sample('library');gpuPid=app.getAppMetrics().find(p=>p.type==='GPU')?.pid;
 if(gpuPid){
   const status=wpr(['-status']);tracing.push({phase:'status',...status});
   if(status.output.includes('not recording')){
     const enabled=wpr(['-snapshotconfig','heap','-pid',String(gpuPid),'enable']);heapEnabled=enabled.ok || enabled.output.includes('Succeed');tracing.push({phase:'enable-own-gpu-heap',...enabled});
     if(enabled.ok){const started=wpr(['-start','heapsnapshot','-filemode']);tracingStarted=started.ok;tracing.push({phase:'start',...started});}
   }
 }
 await contentTracing.startRecording({included_categories:['disabled-by-default-memory-infra'],memory_dump_config:{triggers:[{mode:'detailed',periodic_interval_ms:1000}]}});
 for(let cycle=1;cycle<=2;cycle++){
   await js("document.querySelector('.capture-clip-card [data-clip-id]').click()");
   await wait(()=>js('Boolean(document.querySelector("video"))'),'editor video');
   await js('(async()=>{const v=document.querySelector("video");v.muted=true;try{void v.play().catch(()=>{})}catch{} })()');
   await delay(4000);await sample('playback-'+cycle);
   if(tracingStarted)tracing.push({phase:'heap-'+cycle,...wpr(['-singlesnapshot','heap',String(gpuPid)])});
   await js("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Back to clips').click()");
   await wait(()=>js('!document.querySelector(".montage-v2-shell")'),'editor close');await sample('closed-'+cycle);
 }
 await js("document.querySelector('.capture-title-strip button')?.click()");await sample('settings');
 await contentTracing.stopRecording(join(output,'chromium-memory.json'));
 if(tracingStarted){tracing.push({phase:'stop',...wpr(['-stop',join(output,'gpu-heap.etl')])});tracingStarted=false;}
 if(heapEnabled){tracing.push({phase:'disable',...wpr(['-snapshotconfig','heap','-pid',String(gpuPid),'disable'])});heapEnabled=false;}
 await writeFile(join(output,'gpu.json'),JSON.stringify(await app.getGPUInfo('complete'),null,2));
 await writeFile(join(output,'measurements.json'),JSON.stringify({scope:'Hidden isolated real-library editor cycles; video progress reported per sample; no live capture or foreground gameplay proof',softwareRendering:state.settings.softwareRendering,clips:state.clips.length,metrics,tracing},null,2));
 console.log(JSON.stringify({output,metrics,tracing}));clearTimeout(watchdog);app.quit();
}catch(error){console.error(error);if(tracingStarted)wpr(['-stop',join(output,'gpu-heap.etl')]);if(heapEnabled)wpr(['-snapshotconfig','heap','-pid',String(gpuPid),'disable']);console.error(output);clearTimeout(watchdog);app.exit(1);}});
