// Hidden Electron regression: real IPC and Windows inventory, injected scan failures.
import { app, BrowserWindow } from 'electron';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const output = resolve('.switchboard/source-refresh-review');
await mkdir(output, { recursive: true });
app.setName('switchboard-source-recovery-review');
app.setAppPath(resolve('.'));
app.setPath('userData', await mkdtemp(join(tmpdir(), 'switchboard-source-recovery-')));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
let failures = 0;
let attempts = 0;
const execFile = childProcess.execFile;
childProcess.execFile = function (file, args, options, callback) {
  if (args?.includes('--list-sources')) {
    attempts++;
    if (failures-- > 0) {
      queueMicrotask(() => callback(new Error('capture engine request timed out: listSources'), '', ''));
      return;
    }
  }
  return execFile.call(this, file, args, options, callback);
};
syncBuiltinESMExports();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { assertions: [], screenshots: [] };
let win;
const js = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`).catch(error => { throw new Error(`${code}: ${error}`); });
const assert = (value, label) => { if (!value) throw new Error(label); report.assertions.push(label); };
async function until(expression) {
  for (let i = 0; i < 200; i++) { if (await js(`return ${expression}`)) return; await delay(100); }
  throw new Error(`Timed out: ${expression}`);
}
async function capture(name, width, height) {
  win.setBounds({ x: -30000, y: -30000, width, height });
  await delay(150);
  const size = await js('return [innerWidth,innerHeight]'); const outer = win.getSize();
  win.setBounds({ x: -30000, y: -30000, width: outer[0] + width - size[0], height: outer[1] + height - size[1] });
  await delay(200);
  assert(await js('return document.documentElement.scrollWidth <= innerWidth'), `${name} ${width}: no page overflow`);
  const filename = `${name}-${width}x${height}.png`;
  await writeFile(join(output, filename), (await win.webContents.capturePage()).toPNG());
  report.screenshots.push(filename);
}

await import('../out/main/index.js');
void app.whenReady().then(async () => {
  try {
    for (let i = 0; i < 200 && !win; i++) { win = BrowserWindow.getAllWindows()[0]; await delay(100); }
    win.setMinimumSize(1, 1); win.setBounds({ x: -30000, y: -30000, width: 1420, height: 900 });
    win.webContents.setBackgroundThrottling(false);
    await until('Boolean(window.switchboard)');
    await js(`await window.switchboard.updateSettings({onboardingCompleted:true,automaticAppUpdates:false,scanGamesAutomatically:false,uiScalePercent:100});`);
    await until('Boolean(document.querySelector("main")) && !document.querySelector(".startup-screen")');
    await js(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('Capture')).click()`);
    await until('Boolean(document.querySelector(".capture-source-trigger"))');
    const before = await js('return (await window.switchboard.getSnapshot()).capture.config');
    failures = 1; attempts = 0;
    await js('document.querySelector(".capture-source-trigger").click()');
    await until('(await window.switchboard.getSnapshot()).capture.sourceRefreshState === "retrying"');
    assert(await js(`return !document.querySelector('[aria-label="Dismiss error"]')`), 'Transient timeout does not show a global error');
    await capture('retrying', 1420, 900);
    await until('(await window.switchboard.getSnapshot()).capture.sourceRefreshState === "ready"');
    assert(attempts === 2, 'Source picker automatically retries once and recovers');
    const ready = await js('return await window.switchboard.getSnapshot()');
    assert(ready.capture.sources.some(s => s.type === 'display'), 'Recovered inventory includes actual Windows displays');
    assert(JSON.stringify(before) === JSON.stringify(ready.capture.config), 'Discovery leaves recording preferences unchanged');
    const prior = ready.capture.sources;
    failures = 3; attempts = 0;
    await js(`Array.from(document.querySelectorAll('.capture-source-popover button')).find(b=>b.textContent.trim()==='Refresh').click()`);
    await until('(await window.switchboard.getSnapshot()).capture.sourceRefreshState === "unavailable"');
    assert(attempts === 3, 'Repeated failures stop after three attempts');
    assert(await js(`return !document.querySelector('[aria-label="Dismiss error"]')`), 'Exhausted discovery retries remain an inline notice');
    assert(JSON.stringify(prior) === JSON.stringify(await js('return (await window.switchboard.getSnapshot()).capture.sources')), 'Failed refresh preserves the confirmed source list');
    for (const [w, h] of [[1080,720],[1420,900],[1920,1080]]) await capture('unavailable', w, h);
    await js(`Array.from(document.querySelectorAll('.capture-source-popover button')).find(b=>b.textContent.trim()==='Refresh').click()`);
    await until('(await window.switchboard.getSnapshot()).capture.sourceRefreshState === "ready"');
    assert(await js('return !document.querySelector(".capture-source-popover [role=status]")'), 'Successful retry clears the inline notice');
    await js('document.querySelector(".capture-source-trigger").focus()');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await delay(150);
    assert(await js('return document.activeElement?.classList.contains("capture-source-trigger")'), 'Closing the source picker restores keyboard focus');
    win.reload();
    await until('Boolean(window.switchboard) && Boolean(document.querySelector(".capture-source-trigger"))');
    assert(await js('return (await window.switchboard.getSnapshot()).capture.sourceRefreshState === "ready"'), 'Renderer reload retains canonical discovery state');
    assert(!win.isVisible(), 'Review window remained hidden');
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
