import { app, BrowserWindow, dialog } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'switchboard-resource-debug-'));
const output = resolve('design-qa/resource-diagnostics');
await mkdir(output, { recursive: true });
app.setName('switchboard-resource-debug-review');
app.setAppPath(resolve('.'));
app.setPath('userData', profile);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
const report = { profile, assertions: [], screenshots: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let window;
async function js(code) { try { return await window.webContents.executeJavaScript(code.includes('await ') ? `(async () => (${code}))()` : code); } catch (error) { throw new Error(`${code}: ${error}`); } }
function assert(value, label) { if (!value) throw new Error(label); report.assertions.push(label); }
async function until(code, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await js(code)) return; await delay(100); }
  throw new Error(`Timed out: ${code}`);
}
await import('../out/main/index.js');
void app.whenReady().then(async () => {
  for (let i = 0; i < 200 && !window; i++) { window = BrowserWindow.getAllWindows()[0]; await delay(100); }
  await until('Boolean(window.switchboard)');
  await js(`window.switchboard.updateSettings({ onboardingCompleted: true, automaticAppUpdates: false, scanGamesAutomatically: false })`);
  await until('Boolean(document.querySelector("main")) && !document.querySelector(".startup-screen")');
  window.setMinimumSize(1, 1);
  window.setContentSize(1420, 900);
  window.setPosition(-30000, -30000);
  window.setSkipTaskbar(true);
  window.webContents.setBackgroundThrottling(false);
  window.showInactive();
  await js(`localStorage.setItem('switchboard.settings.category', 'diagnostics'); document.querySelector('button[aria-label="Settings"]').click()`);
  await until(`Boolean(document.querySelector('.settings-page'))`);
  await js(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Diagnostics')?.click()`);
  await until(`Boolean(document.querySelector('[aria-label="Detailed resource diagnostics"]'))`);
  assert(await js(`!(await window.switchboard.getSnapshot()).settings.detailedDiagnostics`), 'off by default');
  await js(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Export resource report').click()`);
  await until(`document.body.textContent.includes('Enable detailed diagnostics and wait')`);
  assert(true, 'empty export has a visible error');
  await js(`document.querySelector('[aria-label="Detailed resource diagnostics"]').click()`);
  await until(`Boolean((await window.switchboard.getSnapshot()).performance.debug)`);
  await until(`Boolean(window.switchboardDebugRuntime)`);
  assert(true, 'toggle enables canonical diagnostics and renderer observer');
  await js(`const end = performance.now() + 85; while (performance.now() < end) {}`);
  // Capture a useful observation window; only this owned instance is exercised.
  for (let i = 0; i < 12; i++) {
    await js(`window.switchboard.updateSettings({ performanceGuard: ${i % 2 === 0} })`);
    await delay(5000);
  }
  await js(`document.querySelectorAll('.resource-debug-report details').forEach(d => d.open = true)`);
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setContentSize(width, height);
    await delay(300);
    assert(await js(`document.documentElement.scrollWidth <= innerWidth`), `no page overflow at ${width}x${height}`);
    const name = `diagnostics-${width}x${height}.png`;
    await writeFile(join(output, name), (await window.webContents.capturePage()).toPNG());
    report.screenshots.push(name);
  }
  const exportPath = join(output, 'resource-report.json');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
  await js(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Export resource report').click()`);
  await until(`document.body.textContent.includes('Report saved.')`);
  const exported = JSON.parse(await readFile(exportPath, 'utf8'));
  assert(exported.samples.length >= 10, 'export contains a five-second sample history');
  assert(exported.samples.some(s => s.rendererRuntime?.longTasks?.count > 0), 'renderer long task observed');
  assert(exported.samples.at(-1).debug.operations.some(o => o.name === 'state.validate' && o.calls > 0), 'canonical state work attributed');
  assert(exported.samples.at(-1).debug.processes.length > 0, 'real process metrics attributed');
  window.reload();
  await until(`Boolean(document.querySelector('[aria-label="Detailed resource diagnostics"]'))`);
  assert(await js(`(await window.switchboard.getSnapshot()).settings.detailedDiagnostics`), 'enabled preference survives renderer reload');
  assert(JSON.parse(await readFile(join(profile, 'switchboard-state.json'), 'utf8')).settings.detailedDiagnostics, 'enabled preference persisted on disk');
  await js(`document.querySelector('[aria-label="Detailed resource diagnostics"]').click()`);
  await until(`!(await window.switchboard.getSnapshot()).settings.detailedDiagnostics && !window.switchboardDebugRuntime`);
  await delay(5500);
  assert(await js(`!(await window.switchboard.getSnapshot()).performance.debug`), 'disable clears runtime metrics and observer');
  dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
  assert(await js(`await window.switchboard.exportResourceDiagnostics() === false`), 'stopped session remains exportable and cancel is honored');
  await js(`window.switchboard.updateSettings({ detailedDiagnostics: true })`);
  await delay(5500);
  await js(`window.switchboard.resetSettings('diagnostics')`);
  await until(`!(await window.switchboard.getSnapshot()).settings.detailedDiagnostics && !window.switchboardDebugRuntime`);
  assert(true, 'diagnostics reset stops recording');
  await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await js(`document.querySelector('[aria-label="Detailed resource diagnostics"]').focus()`);
  assert(await js(`document.activeElement.getAttribute('aria-label') === 'Detailed resource diagnostics'`), 'toggle accepts keyboard focus');
  await writeFile(join(output, 'off-focus-reduced-motion.png'), (await window.webContents.capturePage()).toPNG());
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
