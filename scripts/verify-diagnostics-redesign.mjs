import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const baseline = process.argv.includes('--baseline');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-diagnostics-redesign-'));
const output = resolve('design-qa/diagnostics-redesign', baseline ? 'baseline' : 'final');
await mkdir(output, { recursive: true });
app.setName('switchboard-diagnostics-redesign-review');
app.setAppPath(resolve('.'));
app.setPath('userData', profile);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const report = { profile, assertions: [], screenshots: [], errors: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let window;
async function js(code) { return window.webContents.executeJavaScript(`(async () => { ${code} })()`); }
function assert(value, label) { if (!value) throw new Error(label); report.assertions.push(label); }
async function until(code, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await js(`return ${code}`)) return; await delay(100); }
  throw new Error(`Timed out: ${code}`);
}
async function capture(name, width = 1420, height = 900) {
  window.webContents.setZoomFactor(1);
  window.setContentSize(width, height);
  await delay(200);
  const [actualWidth, actualHeight] = await js('return [innerWidth, innerHeight]');
  const [outerWidth, outerHeight] = window.getSize();
  window.setSize(outerWidth + width - actualWidth, outerHeight + height - actualHeight);
  await until(`innerWidth === ${width} && innerHeight === ${height}`);
  await delay(250);
  assert(await js('return document.documentElement.scrollWidth <= innerWidth'), `${name}: no horizontal page overflow`);
  const file = `${name}-${width}x${height}.png`;
  await writeFile(join(output, file), (await window.webContents.capturePage()).toPNG());
  report.screenshots.push(file);
}
async function clickText(text) {
  await js(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)}).click();`);
}
async function key(keyCode) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  if (keyCode === 'Enter') window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  await delay(80);
}
async function focus(label) {
  await js(`document.querySelector('[aria-label="${label}"]').focus();`);
  window.webContents.focus();
}
async function sendFixture(snapshot) {
  window.webContents.send('system:snapshot-updated', snapshot);
  await delay(80);
}
await import('../out/main/index.js');
void app.whenReady().then(async () => {
  for (let i = 0; i < 200 && !window; i++) { window = BrowserWindow.getAllWindows()[0]; await delay(100); }
  window.webContents.on('console-message', event => { if (event.level === 'error') report.errors.push(event.message); });
  await until('Boolean(window.switchboard)');
  await js(`await window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100, automaticAppUpdates: false, scanGamesAutomatically: false });`);
  await until('Boolean(document.querySelector("main")) && !document.querySelector(".startup-screen")');
  window.setMinimumSize(1, 1);
  window.setPosition(-30000, -30000);
  window.setSkipTaskbar(true);
  window.webContents.setBackgroundThrottling(false);
  window.showInactive();
  await js(`sessionStorage.setItem('switchboard.settings.category', 'diagnostics'); document.querySelector('button[aria-label="Settings"]').click();`);
  await until(`Boolean(document.querySelector('.settings-diagnostics'))`);
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    await capture('overview', width, height);
    assert(await js(`return ['Detailed resource diagnostics', 'Local retention', 'Performance guard'].every(label => {
      const r = document.querySelector('[aria-label="' + label + '"]').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    });`), `${width}x${height}: routine controls visible without scrolling`);
  }
  if (!baseline) {
    await clickText('Export resource report');
    await until(`document.body.textContent.includes('Enable detailed diagnostics and wait')`);
    await capture('empty-export', 1080, 720);
    await focus('Detailed resource diagnostics');
    await key('Space');
    await until(`(await window.switchboard.getSnapshot()).settings.detailedDiagnostics`);
    await until(`Boolean((await window.switchboard.getSnapshot()).performance.debug)`);
    assert(true, 'keyboard toggle enables canonical resource recording');
    await until(`Boolean(document.querySelector('.resource-debug-metrics'))`);
    await js(`document.querySelectorAll('.resource-debug-report summary')[0].focus();`);
    window.webContents.focus();
    await key('Enter');
    await js(`document.querySelectorAll('.resource-debug-report summary')[1].focus();`);
    await key('Enter');
    assert(await js(`return Array.from(document.querySelectorAll('.resource-debug-report details')).every(d => d.open);`), 'keyboard opens both resource tables');
    await js(`document.querySelector('.settings-content-scroll').scrollTop = 260;`);
    await capture('recording-tables', 1080, 720);
    await capture('recording-tables', 1420, 900);
    await capture('recording-tables', 1920, 1080);
    await js(`document.querySelectorAll('.resource-debug-report details').forEach(d => d.open = false); document.querySelector('.settings-content-scroll').scrollTop = 0;`);
    let finishDialog;
    dialog.showSaveDialog = () => new Promise(resolve => { finishDialog = resolve; });
    await clickText('Export resource report');
    await until(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Exporting…' && b.disabled)`);
    await capture('export-pending', 1080, 720);
    finishDialog({ canceled: true, filePath: '' });
    await until(`document.body.textContent.includes('Export canceled.')`);
    assert(true, 'export disables while pending and reports cancellation');
    const exportPath = join(output, 'resource-report.json');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
    await clickText('Export resource report');
    await until(`document.body.textContent.includes('Report saved.')`);
    const exported = JSON.parse(await readFile(exportPath, 'utf8'));
    assert(exported.samples.length > 0 && exported.samples.at(-1).debug.processes.length > 0, 'export contains recorded native process samples');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(output, 'missing-directory', 'report.json') });
    await clickText('Export resource report');
    await until(`document.body.textContent.includes('Could not save the report.')`);
    await capture('export-error', 1080, 720);
    await focus('Performance guard');
    await key('Space');
    await until(`!(await window.switchboard.getSnapshot()).settings.performanceGuard`);
    await focus('Local retention');
    await key('Space');
    await until(`Boolean(document.querySelector('[role="listbox"]'))`);
    await key('Home');
    await key('Down');
    await key('Enter');
    await until(`(await window.switchboard.getSnapshot()).settings.diagnosticsRetentionDays === 3`);
    window.reload();
    await until(`Boolean(document.querySelector('[aria-label="Detailed resource diagnostics"]'))`);
    const saved = await js(`return (await window.switchboard.getSnapshot()).settings;`);
    const disk = JSON.parse(await readFile(join(profile, 'switchboard-state.json'), 'utf8')).settings;
    assert(saved.detailedDiagnostics && !saved.performanceGuard && saved.diagnosticsRetentionDays === 3, 'all three preferences survive renderer reload');
    assert(disk.detailedDiagnostics && !disk.performanceGuard && disk.diagnosticsRetentionDays === 3, 'all three preferences persist on disk');
    await focus('Detailed resource diagnostics');
    await key('Space');
    await until(`!(await window.switchboard.getSnapshot()).settings.detailedDiagnostics && !window.switchboardDebugRuntime`);
    await until(`!document.querySelector('.resource-debug-metrics')`);
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
    await clickText('Export resource report');
    await until(`document.body.textContent.includes('Export canceled.')`);
    assert(true, 'stopping removes metrics and observer while the previous session remains exportable');
    await clickText('Reset section');
    await until(`Boolean(document.querySelector('[role="alertdialog"]'))`);
    await capture('reset-confirmation', 1080, 720);
    await key('Escape');
    await until(`!document.querySelector('[role="alertdialog"]')`);
    assert(await js(`return (await window.switchboard.getSnapshot()).settings.diagnosticsRetentionDays === 3;`), 'reset cancellation preserves settings');
    await clickText('Reset section');
    await until(`Boolean(document.querySelector('[role="alertdialog"]'))`);
    await key('Enter');
    await until(`(await window.switchboard.getSnapshot()).settings.diagnosticsRetentionDays === 7`);
    assert(true, 'confirmed reset applies diagnostics defaults');
    const actual = await js('return await window.switchboard.getSnapshot();');
    // Synthetic snapshots exercise presentation only, within this isolated fixture instance.
    const collecting = structuredClone(actual);
    collecting.settings.detailedDiagnostics = true;
    collecting.performance.sampledAt = null;
    delete collecting.performance.debug;
    collecting.devices = [];
    collecting.engines = [];
    await sendFixture(collecting);
    assert(await js(`return document.querySelector('.diagnostics-overview__engine').textContent.includes('Unavailable');`), 'missing host is unavailable, not stopped');
    await capture('collecting-unavailable-fixture', 1080, 720);
    await js(`document.querySelector('#diagnostics-device-identity').scrollIntoView();`);
    await capture('empty-devices-fixture', 1080, 720);
    const failure = structuredClone(actual);
    failure.settings.developerMode = true;
    failure.performance.warning = 'Capture memory exceeded the configured budget during replay recording.';
    failure.engines = [{kind: 'capture', state: 'error', cpuPercent: 0, memoryMb: 0, uptimeSeconds: 0, updatedAt: new Date().toISOString(), message: 'Capture host disconnected. Restart capture to reconnect.'}];
    failure.capture.autoCapture.runtime.lastError = 'The event provider disconnected. Restart the game to reconnect.';
    if (failure.devices[0]) {
      failure.devices[0].displayName = 'Logitech G502 X Plus connected through the desktop wireless receiver';
      failure.devices[0].identity.serialNumber = 'long-device-identifier-'.repeat(12);
    }
    await sendFixture(failure);
    await js(`document.querySelector('.settings-content-scroll').scrollTop = 0;`);
    await capture('warning-developer-fixture', 1080, 720);
    await capture('warning-developer-fixture', 1420, 900);
    await js(`document.querySelector('#diagnostics-device-identity').scrollIntoView();`);
    await capture('long-device-fixture', 1080, 720);
    await sendFixture(actual);
    await js(`document.querySelector('.settings-content-scroll').scrollTop = 0;`);
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await focus('Detailed resource diagnostics');
    await key('Tab');
    assert(await js(`return document.activeElement.textContent === 'Export resource report';`), 'keyboard order goes from recording to export');
    await until(`document.getAnimations().filter(a => a.playState === 'running').length === 0`, 2000);
    assert(true, 'reduced motion has no running animations after focus settles');
    await capture('keyboard-reduced-motion', 1080, 720);
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
    await capture('forced-contrast', 1080, 720);
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    // Reject one settings write to verify pending and last-confirmed state.
    let rejectWrite;
    ipcMain.removeHandler('settings:update');
    ipcMain.handle('settings:update', () => new Promise((_resolve, reject) => { rejectWrite = reject; }));
    const priorGuard = actual.settings.performanceGuard;
    await focus('Performance guard');
    await key('Space');
    await until(`document.querySelector('[aria-label="Performance guard"]').disabled`);
    await capture('setting-pending', 1080, 720);
    rejectWrite(new Error('Review fixture: settings could not be saved.'));
    await until(`document.body.textContent.includes('Review fixture: settings could not be saved.')`);
    assert(await js(`return document.querySelector('[aria-label="Performance guard"]').getAttribute('aria-checked') === '${priorGuard}';`), 'failed write preserves last confirmed guard value');
    await capture('setting-error-fixture', 1080, 720);
  }
  report.passed = true;
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.quit();
}).catch(async error => {
  report.error = String(error);
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.error(error);
  app.exit(1);
});
