import { execFileSync } from 'node:child_process';
// Hidden native Electron acceptance for the capture-only shell.
// Writes and recycles synthetic media only in its isolated temporary profile. Never starts capture.
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-library-improvements-'));
const output = join(root, '.switchboard', 'library-improvements-review', String(Date.now()));
await mkdir(output, { recursive: true });
const state = JSON.parse(await readFile(join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json'), 'utf8'));
const base = state.clips.find(clip => clip.thumbnailPath && existsSync(clip.thumbnailPath) && existsSync(clip.path));
if (!base) throw Error('A local clip with a real thumbnail is required for the library fixture.');
await mkdir(join(profile, 'cache', 'thumbnails'), { recursive: true });
const fixtureVideo = join(profile, 'fixture.mp4');
execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30','-t','2','-c:v','libx264','-pix_fmt','yuv420p',fixtureVideo], {windowsHide:true});
await mkdir(join(profile,'Clips'));
const generatedTitle=execFileSync('bun',['-e',`import { createDefaultClipTitle } from './src/shared/clip-library.ts'; process.stdout.write(createDefaultClipTitle(${JSON.stringify(base.game)},${Date.now()}));`],{cwd:root,encoding:'utf8',windowsHide:true});
state.clips = [];
for (let index=0; index<30; index++) {
  const id='library-fixture-'+index;
  const thumbnailPath=join(profile,'cache','thumbnails',id+'.v2.jpg');
  const path=join(profile,index===7||index===8?'OfflineClips':'Clips',id+'.mp4');
  await copyFile(base.thumbnailPath,thumbnailPath);
  if (index !== 7 && index !== 8) await copyFile(fixtureVideo,path);
  state.clips.push({...base,id,path,thumbnailPath,name:index===3?generatedTitle:'Library fixture '+index,titleEdited:index!==3,width:320,height:180,fps:30,durationMs:2000,trimStartMs:0,trimEndMs:2000,fileSize:5000,audioChannels:[],createdAt:Date.now()-index*1000,availability:index===7||index===8?'unavailable':'available'});
}
state.capture.config.enabled = false;
state.capture.config.replaySeconds = 60;
state.capture.config.replayCacheDirectory = null;
state.capture.config.clipsDirectory = join(profile, 'Clips');
state.audio.enabled = false;
state.modules.forEach(module => { module.enabled = false; });
Object.assign(state.settings, { onboardingCompleted: true, visibleWorkspaces: ['devices', 'capture'], uiScalePercent: 100, automaticUpdates: false, scanGamesAutomatically: false });

await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
await mkdir(join(profile,'montage-v2'),{recursive:true});
const oldKept={schemaVersion:2,type:'montage',id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Kept overnight',createdAt:Date.now()-86400000,updatedAt:Date.now()-86400000,durationMs:2000,canvasSize:'original',kept:true,segments:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',clipId:'library-fixture-29',sourceDurationMs:2000,trimStartMs:0,trimEndMs:2000,volume:1,muted:false}]};
await writeFile(join(profile,'montage-v2','manifest.json'),JSON.stringify({schemaVersion:1,assets:[],drafts:[oldKept,{...oldKept,id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Expired temporary',kept:false}]}));
app.setName('switchboard-library-improvements-review');
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
const report = { scope: 'Hidden Electron capture-only shell with canonical snapshot fixtures. Synthetic media and isolated profile; no live capture proof.', checks: [], screenshots: [], errors: [] };
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
let window, fixture;
const js = async expression => { try { return await window.webContents.executeJavaScript(expression); } catch(error) { console.error('Renderer expression:',expression); throw error; } };
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


let nextSelection;
dialog.showOpenDialog = async () => ({ canceled: !nextSelection, filePaths: nextSelection ? [nextSelection] : [] });
const realTrash=shell.trashItem;
shell.trashItem=async path => {
  if (!resolve(path).startsWith(resolve(profile)+'\\')) throw Error('Refusing to recycle a non-fixture file');
  if (path.endsWith('library-fixture-2.mp4')) throw Error('Fixture file is locked');
  return realTrash(path);
};
const watchdog=setTimeout(()=>app.exit(2),120000);
await import('../out/main/index.js');
void app.whenReady().then(async()=>{try {
 await wait(async()=>{window=BrowserWindow.getAllWindows()[0];return window&&!window.webContents.isLoading()&&await js('Boolean(window.switchboard)');},'window');
 await wait(()=>js('Boolean(document.querySelector(".capture-clip-card"))'),'library');
 window.webContents.debugger.attach('1.3');
 await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
 await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 window.webContents.on('console-message',event=>{if(event.level==='error') report.errors.push(event.message);});
 assert(await js('window.switchboard.listMontageDrafts().then(ds=>ds.some(d=>d.name==="Kept overnight")&&!ds.some(d=>d.name==="Expired temporary"))'),'kept survives overnight while temporary expires');
 const click=async text=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing '+${JSON.stringify(text)});b.click();})()`);await frames();};
 // New location writes pass through production IPC and controller, dialog selection is isolated.
 nextSelection=join(profile,'Cache destination'); await mkdir(nextSelection);
 await js('window.switchboard.chooseReplayCacheDirectory()');
 assert(await js(`window.switchboard.getSnapshot().then(s=>s.capture.config.replayCacheDirectory.endsWith('Switchboard Replay Cache'))`),'cache location persisted through controller');
 nextSelection=undefined;
 await js('window.switchboard.updateSettings({clipLibraryView:{layout:"list",sort:"oldest"}})');await frames();
 await wait(()=>js('Boolean(document.querySelector(".capture-clip-list__item"))'),'list preference');
 await js(`document.querySelector('[aria-label="Search clips"]').value='';`);
 const setSearch=async value=>{await js(`(()=>{const e=document.querySelector('[aria-label="Search clips"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await frames();};
 await setSearch('Library fixture');
 await js("document.querySelector('[data-radix-scroll-area-viewport]').scrollTop=450");await frames();
 await js("document.querySelector('.capture-title-strip button').click()");await wait(()=>js('Boolean(document.querySelector(".settings-page"))'),'settings');
 await click('Clips');
 await wait(()=>js('Boolean(document.getElementById("setting-capture.replay-cache"))'),'cache settings');
 nextSelection=join(profile,'Second cache destination');await mkdir(nextSelection);
 await click('Change cache folder');
 await wait(()=>js('window.switchboard.getSnapshot().then(s=>s.capture.config.replayCacheDirectory.includes("Second cache destination"))'),'cache button writes canonical config');
 nextSelection=undefined;
 for(const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
   window.setMinimumSize(1,1);window.setContentSize(width,height);const [ow,oh]=window.getSize(),[cw,ch]=window.getContentSize();window.setSize(ow+width-cw,oh+height-ch);await frames();
   await js('document.getElementById("setting-capture.replay-cache").scrollIntoView({block:"center"})');
   await capture(width+'x'+height+'-cache-settings');
   assert(await js('document.documentElement.scrollWidth<=innerWidth'),'cache settings no overflow '+width);
 }
 await js("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await wait(()=>js('Boolean(document.querySelector(".capture-clip-list__item"))'),'return');
 assert(await js(`document.querySelector('[aria-label="Search clips"]').value === "Library fixture"`),'search survives settings');
 assert(await js(`document.querySelector('[aria-label="List view"]').getAttribute("data-state")==="on"`),'view survives settings');
 assert(await js("document.querySelector('[data-radix-scroll-area-viewport]').scrollTop >= 440"),'scroll survives settings');
 await js("document.querySelector('[data-radix-scroll-area-viewport]').scrollTop=0");await frames();
 await setSearch('');
 await js('window.switchboard.updateSettings({clipLibraryView:{layout:"grid",sort:"newest"}})');await frames();
 for(const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
   window.setMinimumSize(1,1);window.setContentSize(width,height);const [ow,oh]=window.getSize(),[cw,ch]=window.getContentSize();window.setSize(ow+width-cw,oh+height-ch);await frames();
   await capture(width+'x'+height+'-library');
   await js("document.querySelector('[aria-label=\"Select clips\"]').click()");await frames();
   await js(`document.querySelector('[data-clip-id="library-fixture-0"]').click();document.querySelector('[data-clip-id="library-fixture-2"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));`);await frames();
   assert(await js(`document.querySelectorAll('[data-selected="true"]').length===3`),'shift range '+width);
   await capture(width+'x'+height+'-selection');
   assert(await js('document.documentElement.scrollWidth<=innerWidth'),'no overflow '+width);
   await click('Favorite');
   await wait(()=>js('window.switchboard.getSnapshot().then(s=>s.clips.slice(0,3).every(c=>c.favorite))'),'bulk favorite');
   await click('Unfavorite');
   await wait(()=>js('window.switchboard.getSnapshot().then(s=>s.clips.slice(0,3).every(c=>!c.favorite))'),'bulk unfavorite');
   await click('Cancel');
 }
 // Keep project uses editor autosave.
 await js("document.querySelector('[data-clip-id=\"library-fixture-0\"]').click()");
 await wait(()=>js('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Keep project")'),'editor');
 await click('Keep project');
 await wait(()=>js('window.switchboard.listMontageDrafts().then(ds=>ds.some(d=>d.kept&&d.name!=="Kept overnight"))'),'kept project saved');
 await capture('kept-project');
 await click('Back to clips');
 // Project references are visible before delete. Only throwaway fixture files are recycled.
 await js("document.querySelector('[aria-label=\"Select clips\"]').click()");await frames();
 await js(`document.querySelector('[data-clip-id="library-fixture-0"]').click();document.querySelector('[data-clip-id="library-fixture-2"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));`);await frames();
 await click('Delete');
 await wait(()=>js('document.body.textContent.includes("Used by 1 saved project")'),'reference warning');
 await capture('delete-reference-warning');
 await click('Move to Recycle Bin');
 await wait(()=>js('document.body.textContent.includes("Fixture file is locked")'),'partial failure');
 assert(await js('window.switchboard.getSnapshot().then(s=>!s.clips.some(c=>c.id==="library-fixture-0")&&s.clips.some(c=>c.id==="library-fixture-2"))'),'partial deletion preserves failed record');
 await capture('delete-partial-failure');await click('Close');await click('Cancel');
 // Exercise unavailable context-menu recovery and explicit record removal.
 await setSearch("Library fixture 8"); await wait(()=>js(`Boolean(document.querySelector('[data-clip-id="library-fixture-8"]'))`),'offline clip visible');
 await js(`document.querySelector('[data-clip-id="library-fixture-8"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:350,clientY:250}));`);
 await wait(()=>js('[...document.querySelectorAll("[role=menuitem]")].some(e=>e.textContent.includes("Locate file"))'),'unavailable menu');
 await capture('unavailable-actions');
 await js(`[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('Remove from library')).click()`);
 await wait(()=>js('document.body.textContent.includes("Remove unavailable clips from library?")'),'remove confirmation');
 await capture('remove-unavailable');
 await wait(()=>js('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Remove from library"&&!b.disabled)'),'reference check');
 await click('Remove from library');
 await wait(()=>js('window.switchboard.getSnapshot().then(s=>!s.clips.some(c=>c.id==="library-fixture-8"))'),'explicit record removal');
 assert(!existsSync(join(profile,'Clips','library-fixture-8.mp4')),'record removal leaves missing media untouched');
 // Missing file retry, relink and removal retain identity until explicit removal.
 let result=await js('window.switchboard.operateClips({ids:["library-fixture-7"],action:"retry"})');assert(result.failures.length===1&&result.snapshot.clips.some(c=>c.id==='library-fixture-7'),'retry retains unavailable record');
 nextSelection=join(profile,'restored.mp4');await copyFile(fixtureVideo,nextSelection);
 result=await js('window.switchboard.operateClips({ids:["library-fixture-7"],action:"locate"})');assert(!result.failures.length&&result.snapshot.clips.find(c=>c.id==='library-fixture-7').availability==='available','locate preserves identity');
 await js('window.switchboard.updateSettings({clipLibraryView:{layout:"list",sort:"oldest"}})');window.webContents.reload();
 await wait(()=>js('Boolean(document.querySelector(".capture-clip-list__item"))'),'reload');
 assert(await js('window.switchboard.getSnapshot().then(s=>s.settings.clipLibraryView.layout==="list")'),'view persists after reload');
 assert(await js('window.switchboard.listMontageDrafts().then(ds=>ds.some(d=>d.kept))'),'kept project persists after reload');
 assert(!window.isVisible(),'hidden throughout');
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,checks:report.checks.length,errors:report.errors}));clearTimeout(watchdog);app.quit();
}catch(error){console.error(error);console.error(output);clearTimeout(watchdog);app.exit(1);}});