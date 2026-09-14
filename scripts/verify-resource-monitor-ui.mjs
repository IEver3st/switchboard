import { app, BrowserWindow, dialog } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const output = resolve('design-qa/diagnostics-upgrade-20260914');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'switchboard-resources-'));
app.setName('switchboard-resource-review'); app.setAppPath(resolve('.')); app.setPath('userData', profile);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1'; process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1'; process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { assertions: [], screenshots: [], errors: [] };
let win;
const js = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
const assert = (value, label) => { if (!value) throw new Error(label); report.assertions.push(label); };
async function until(expression, timeout = 45000) { const end = Date.now()+timeout; while (Date.now()<end) { if (await js(`return ${expression}`)) return; await delay(150); } throw new Error(`Timed out ${expression}`); }
async function click(text) { await js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`); }
async function capture(name, width=1420, height=900) {
  win.setBounds({x:-30000,y:-30000,width,height}); await delay(150);
  const size = await js('return [innerWidth,innerHeight]'); const outer = win.getSize();
  win.setBounds({x:-30000,y:-30000,width:outer[0]+width-size[0],height:outer[1]+height-size[1]});
  await until(`innerWidth===${width} && innerHeight===${height}`);
  await delay(150);
  assert(await js('return document.documentElement.scrollWidth<=innerWidth'), `${name} ${width}: no page overflow`);
  const file = `${name}-${width}x${height}.png`; await writeFile(join(output,file),(await win.webContents.capturePage()).toPNG()); report.screenshots.push(file);
}
await import('../out/main/index.js');
void app.whenReady().then(async () => {
try {
  for(let i=0;i<200&&!win;i++){win=BrowserWindow.getAllWindows()[0];await delay(100);}
  win.setMinimumSize(1,1); win.setBounds({x:-30000,y:-30000,width:1420,height:900}); win.setSkipTaskbar(true); win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message', event=>{if(event.level==='error')report.errors.push(event.message);});
  await until('Boolean(window.switchboard)');
  await js(`await window.switchboard.updateSettings({onboardingCompleted:true,developerMode:true,detailedDiagnostics:false,uiScalePercent:100,automaticAppUpdates:false,scanGamesAutomatically:false});`);
  await until('Boolean(document.querySelector("main"))&&!document.querySelector(".startup-screen")');
  await js(`sessionStorage.setItem('switchboard.settings.category','diagnostics');document.querySelector('[aria-label="Settings"]').click()`);
  await until('Boolean(document.querySelector(".resource-monitor"))');
  await capture('off',1080,720);
  await js(`document.querySelector('[aria-label="Detailed resource diagnostics"]').click()`);
  await until('(await window.switchboard.getSnapshot()).settings.detailedDiagnostics');
  await until('Boolean((await window.switchboard.getSnapshot()).performance.resources)');
  await capture('first-sample',1080,720);
  await until('(await window.switchboard.getSnapshot()).performance.resources?.sampleCount>=6');
  const live = await js('return await window.switchboard.getSnapshot()');
  assert(live.performance.resources.status==='available','Windows collector returns complete live counters');
  assert(live.performance.resources.history.some(p=>p.readBps!==null),'two-sample I/O rates are measured');
  assert(live.performance.resources.processes.some(p=>p.group==='monitor'),'collector overhead is attributed');
  assert(Boolean(live.performance.resources.runtime) && Array.isArray(live.performance.resources.events),'runtime and activity are canonical');
  const exportPath=join(output,'live-export.json'); dialog.showSaveDialog=async()=>({canceled:false,filePath:exportPath});
  await click('Export JSON'); await until(`document.body.textContent.includes('Diagnostics saved.')`);
  const exported=JSON.parse(await readFile(exportPath,'utf8'));
  assert(exported.schemaVersion===4 && exported.resources.history.length>=6,'export contains native resource history');
  assert(exported.samples.at(-1).nativeResources.processes.length>0,'export contains raw process counters');
  await capture('live',1420,900);
  process.kill(live.performance.resources.monitorPid);
  await until('(await window.switchboard.getSnapshot()).performance.resources?.restarts>=1');
  assert(await js('return (await window.switchboard.getSnapshot()).performance.resources.status === "available"'),'collector recovers from killed helper');
  // Stress layout with explicitly synthetic history; all exported evidence above is real native collection.
  const fixture=structuredClone(live); const r=fixture.performance.resources; const end=Date.parse(r.sampledAt);
  r.history=Array.from({length:61},(_,i)=>({at:new Date(end-(60-i)*5000).toISOString(),cpuPercent:1.1+Math.abs(Math.sin(i*.47))*2.1+(i===40?3:0),privateMb:460+Math.sin(i*.13)*15,residentMb:370+Math.sin(i*.1)*22,readBps:230000+Math.abs(Math.sin(i*.31))*1900000,writeBps:190000+Math.abs(Math.cos(i*.27))*1000000,processes:r.processes.length}));
  r.sampleCount=61;r.startedAt=r.history[0].at;
  r.history[r.history.length-1]=structuredClone(live.performance.resources.history.at(-1));
  // Latest fixture values must remain coherent with the genuine process/group totals.
  win.webContents.send('system:snapshot-updated',fixture);await delay(150);
  for(const size of [[1080,720],[1420,900],[1920,1080]]) await capture('history-fixture',...size);
  await click('15m'); assert(await js(`return document.querySelector('.resource-ranges [aria-pressed="true"]').textContent==='15m'`),'time range changes');
  await click('CPU time'); assert(await js(`return document.querySelector('[aria-sort="descending"]').textContent.includes('CPU time')`),'process sorting changes');
  await js(`const input=document.querySelector('[aria-label="Filter processes"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'no-match-zz');input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await until(`document.body.textContent.includes('No processes match')`);await capture('empty-filter',1080,720);
  await js(`const input=document.querySelector('[aria-label="Filter processes"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await js(`document.querySelectorAll('.resource-disclosure').forEach(d=>d.open=true);document.querySelector('.resource-processes details').open=true;document.querySelector('.settings-content-scroll').scrollTop=650;`);
  await capture('details',1420,900);
  await js(`document.querySelector('.settings-content-scroll').scrollTop=0`);
  await js(`document.querySelectorAll('.resource-disclosure').forEach(d=>d.open=true);document.querySelector('.settings-content-scroll').scrollTop=30000`);
  await capture('runtime-activity',1420,900);
  await click('Warnings & errors only');
  assert(await js(`return document.querySelector('.resource-event-filter button').getAttribute('aria-pressed')==='true'`),'activity filter changes');
  await js(`document.querySelector('.settings-content-scroll').scrollTop=0`);
  const partial=structuredClone(fixture);partial.performance.resources.status='unavailable';partial.performance.resources.error='Windows resource collection timed out. The next sample will retry.';
  partial.performance.resources.history.at(-1).cpuPercent=null;partial.performance.resources.history.at(-1).residentMb=null;partial.performance.resources.history.at(-1).privateMb=null;partial.performance.resources.history.at(-1).readBps=null;partial.performance.resources.history.at(-1).writeBps=null;
  win.webContents.send('system:snapshot-updated',partial);await delay(100);await capture('collector-error',1080,720);
  win.webContents.send('system:snapshot-updated',live);await delay(100);
  let finish;dialog.showSaveDialog=()=>new Promise(resolve=>{finish=resolve});await click('Export JSON');await until(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Saving…')&&b.disabled)`);await capture('export-pending',1080,720);finish({canceled:true,filePath:''});await until(`document.body.textContent.includes('Save cancelled.')`);
  dialog.showSaveDialog=async()=>({canceled:false,filePath:join(output,'missing-dir','x.json')});await click('Export JSON');await until(`document.body.textContent.includes('Could not save diagnostics.')`);await capture('export-error',1080,720);
  await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await js(`document.querySelector('[aria-label="Filter processes"]').focus()`);assert(await js(`return document.activeElement.getAttribute('aria-label')==='Filter processes'`),'process filter accepts keyboard focus');await capture('focus-reduced-motion',1080,720);
  await js(`await window.switchboard.updateSettings({detailedDiagnostics:false})`);await until('!(await window.switchboard.getSnapshot()).settings.detailedDiagnostics');
  const stopped=await js('return await window.switchboard.getSnapshot()');assert(Boolean(stopped.performance.resources),'stopped history remains in canonical state');
  win.reload();await until('Boolean(document.querySelector(".resource-monitor"))');assert(await js('return !(await window.switchboard.getSnapshot()).settings.detailedDiagnostics'),'recording setting survives reload');await capture('stopped',1080,720);
  const state=JSON.parse(await readFile(join(profile,'switchboard-state.json'),'utf8'));assert(!state.performance.resources,'resource history is not persisted with user settings');
  report.passed=true;
} catch(error) { report.error=String(error);console.error(error); }
await writeFile(join(output,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));app.exit(report.passed?0:1);
});
