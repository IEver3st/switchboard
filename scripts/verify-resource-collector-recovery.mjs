import { app, BrowserWindow, desktopCapturer, dialog } from 'electron';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const output = resolve('.switchboard/resource-collector-review');
await mkdir(output, { recursive: true });
app.setName('switchboard-resource-collector-review'); app.setAppPath(resolve('.'));
const profile = await mkdtemp(join(tmpdir(), 'switchboard-resource-collector-'));
app.setPath('userData', profile);
await mkdir(join(profile, 'videos'));
app.setPath('videos', join(profile, 'videos'));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1'; process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1'; process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_FFMPEG = resolve('engines/capture-host-tests/bin/Release/net10.0-windows/Capture.Host.Tests.exe');
process.env.SWITCHBOARD_FFPROBE = process.env.SWITCHBOARD_FFMPEG;
process.env.SWITCHBOARD_CAPTURE_FAILURE_FIXTURE = '1';
delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
for (const method of ['show', 'showInactive', 'focus']) BrowserWindow.prototype[method] = function () {};
desktopCapturer.getSources = async () => [];
const exportPath = join(output, 'recovered-export.json');
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
const spawn = childProcess.spawn;
let collectors = 0;
let failedWorker;
childProcess.spawn = function (file, args, options) {
  if (args?.includes('--resource-diagnostics') && ++collectors === 1) {
    failedWorker = spawn(process.execPath, [resolve('tests/fixtures/resource-collector.cjs'), 'hang'], {
      windowsHide: true, stdio: 'pipe', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    return failedWorker;
  }
  return spawn.call(this, file, args, options);
};
syncBuiltinESMExports();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const report = { assertions: [], screenshots: [] };
const assert = (value, label) => { if (!value) throw new Error(label); report.assertions.push(label); };
const js = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`);
async function until(expression, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await js(`return ${expression}`)) return; await delay(100); }
  throw new Error(`Timed out: ${expression}`);
}
async function capture(name, width, height) {
  win.setBounds({ x: -30000, y: -30000, width, height }); await delay(100);
  const size = await js('return [innerWidth,innerHeight]'); const outer = win.getSize();
  win.setBounds({ x: -30000, y: -30000, width: outer[0] + width - size[0], height: outer[1] + height - size[1] }); await delay(150);
  assert(await js('return document.documentElement.scrollWidth<=innerWidth'), `${width}: no page overflow`);
  const file = `${name}-${width}x${height}.png`;
  await writeFile(join(output, file), (await win.webContents.capturePage()).toPNG()); report.screenshots.push(file);
}
await import('../out/main/index.js');
void app.whenReady().then(async () => {
  try {
    for (let i = 0; i < 200 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; await delay(100); }
    win.setMinimumSize(1, 1); win.setBounds({ x: -30000, y: -30000, width: 1420, height: 900 });
    win.webContents.setBackgroundThrottling(false);
    await until('Boolean(window.switchboard)');
    await js('await window.switchboard.updateSettings({onboardingCompleted:true,developerMode:true,detailedDiagnostics:false,automaticAppUpdates:false,scanGamesAutomatically:false,uiScalePercent:100})');
    await until('Boolean(document.querySelector("main")) && !document.querySelector(".startup-screen")');
    await js(`sessionStorage.setItem('switchboard.settings.category','diagnostics'); document.querySelector('[aria-label="Settings"]').click()`);
    await until('Boolean(document.querySelector(".resource-monitor"))');
    await js(`Array.from(document.querySelectorAll('.resource-monitor button')).find(b=>b.textContent.trim()==='Run diagnostics').click()`);
    await until('(await window.switchboard.getSnapshot()).performance.resources?.status === "unavailable"');
    assert(await js('return (await window.switchboard.getSnapshot()).diagnostics.status === "running"'), 'Counter timeout does not stop the diagnostic run');
    assert(await js('return document.querySelector(".resource-monitor__error")?.textContent.includes("Retrying automatically")'), 'Timeout explains automatic recovery');
    assert(failedWorker.killed, 'Stalled helper was terminated');
    for (const [w,h] of [[1080,720],[1420,900],[1920,1080]]) await capture('retrying',w,h);
    const started = Date.now();
    await until('(await window.switchboard.getSnapshot()).performance.resources?.status === "available"');
    report.recoveryWaitMs = Date.now() - started;
    assert(report.recoveryWaitMs < 10000, 'Recovery is published without waiting for the 30-second UI interval');
    assert(collectors === 2, 'Next sample started a fresh real Windows collector');
    assert(await js('return !document.querySelector(".resource-monitor__error")'), 'Recovery clears the warning');
    await capture('recovered',1420,900);
    await js(`Array.from(document.querySelectorAll('.resource-monitor button')).find(b=>b.textContent.trim()==='Cancel diagnostics').click()`);
    await until('(await window.switchboard.getSnapshot()).diagnostics.status === "cancelled"');
    assert(await js('return await window.switchboard.exportResourceDiagnostics()'), 'Cancelled diagnostic run remains exportable');
    const exported = JSON.parse(await readFile(exportPath, 'utf8'));
    assert(exported.samples.some(s=>s.nativeResources?.error?.includes('timed out')), 'Export retains the failed collection detail');
    assert(exported.samples.some(s=>s.nativeResources?.processes?.length>0), 'Export retains recovered real process counters');
    const stopped = await js('return (await window.switchboard.getSnapshot()).performance.resources');
    await delay(100);
    let alive = true; try { process.kill(stopped.monitorPid, 0); } catch { alive = false; }
    assert(!alive, 'Cancelling releases the optional collector');
    win.reload(); await until('Boolean(document.querySelector(".resource-monitor"))');
    assert(await js('return (await window.switchboard.getSnapshot()).performance.resources.status === "available"'), 'Renderer reload preserves recovered diagnostics');
    assert(!win.isVisible(), 'Native review remained hidden');
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report)); app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
