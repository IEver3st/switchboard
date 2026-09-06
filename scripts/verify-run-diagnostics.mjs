import { app, BrowserWindow, desktopCapturer, dialog } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'switchboard-run-diagnostics-'));
const output = resolve('design-qa', `run-diagnostics-${Date.now()}`);
await mkdir(output, { recursive: true });
await mkdir(join(profile, 'videos'));
app.setName('switchboard-run-diagnostics-review');
app.setAppPath(resolve('.'));
app.setPath('userData', profile);
app.setPath('videos', join(profile, 'videos'));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_DEVELOPMENT_CAPTURE_HOST = resolve('engines/capture-host/bin/Release/net10.0-windows/Capture.Host.exe');
process.env.SWITCHBOARD_FFMPEG = resolve('engines/capture-host-tests/bin/Release/net10.0-windows/Capture.Host.Tests.exe');
process.env.SWITCHBOARD_FFPROBE = process.env.SWITCHBOARD_FFMPEG;
process.env.SWITCHBOARD_CAPTURE_FAILURE_FIXTURE = '1';
delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// Never display or focus the app or a dialog on any monitor. Source thumbnails
// and encoder input are fixtures; this test reads no desktop pixels or audio.
for (const method of ['show', 'showInactive', 'focus']) BrowserWindow.prototype[method] = function () {};
desktopCapturer.getSources = async () => [];
dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });

const report = { output, profile, assertions: [], screenshots: [], errors: [], passed: false };
let window;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); report.assertions.push(message); };
const js = async code => {
  try { return await window.webContents.executeJavaScript(`(async () => { ${code} })()`); }
  catch (error) { throw new Error(`${code}: ${error}`); }
};
async function until(expression, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await js(`return ${expression}`)) return; await delay(100); }
  throw new Error(`Timed out: ${expression}`);
}
async function clickText(text) {
  await js(`const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw new Error('Missing button'); button.click();`);
}
async function exportTo(name) {
  const path = join(output, name);
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  assert(await js('return await window.switchboard.exportResourceDiagnostics()'), `export ${name} succeeds`);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function capture(name, width, height) {
  window.webContents.setZoomFactor(1);
  window.setContentSize(width, height);
  await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await until(`innerWidth === ${width} && innerHeight === ${height}`);
  await until('!document.querySelector(".startup-screen")'); await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }); await delay(600);
  assert(!window.isVisible() && !window.isFocused(), `${name}: app stays hidden and unfocused`);
  assert(await js('return document.documentElement.scrollWidth <= innerWidth'), `${name}: no page overflow at ${width}x${height}`);
  const file = `${name}-${width}x${height}.png`;
  await writeFile(join(output, file), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  report.screenshots.push(file);
}

process.env.SWITCHBOARD_DIAGNOSTIC_PROBE_DELAY_MS = '700';
await import('../out/main/index.js');
void app.whenReady().then(async () => {
  for (let i = 0; i < 200 && !window; i++) { window = BrowserWindow.getAllWindows()[0]; await delay(100); }
  if (!window) throw new Error('Review window unavailable.');
  window.setMinimumSize(1, 1);
  window.setPosition(-30000, -30000);
  window.setSkipTaskbar(true);
  await until('Boolean(window.switchboard)');
  window.webContents.debugger.attach('1.3');
  await js('await window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100, automaticAppUpdates: false, scanGamesAutomatically: false }); await window.switchboard.setCaptureConfig({ enabled: false, source: "automatic-game", codec: "auto", encoder: "auto", includeMic: false, includeSystemAudio: false, includeChatAudio: false });');
  await until('Boolean(document.querySelector("main")) && !document.querySelector(".startup-screen")');
  await js('sessionStorage.setItem("switchboard.settings.category", "general"); document.querySelector("button[aria-label=Settings]").click();');
  await until('Boolean(document.querySelector(".diagnostic-runner"))');
  assert(await js('return !(await window.switchboard.getSnapshot()).settings.developerMode'), 'Run diagnostics is available without Developer mode');
  for (const [w,h] of [[1080,720],[1420,900],[1920,1080]]) await capture('idle',w,h);
  const configBefore = await js('return (await window.switchboard.getSnapshot()).capture.config');
  await clickText('Run diagnostics');
  await until('(await window.switchboard.getSnapshot()).diagnostics.status === "running"');
  const runId = await js('return (await window.switchboard.getSnapshot()).diagnostics.id');
  assert(await js(`return (await window.switchboard.runDiagnostics()).diagnostics.id === ${JSON.stringify(runId)}`), 'Repeated start requests join the existing run');
  for (const [w,h] of [[1080,720],[1420,900],[1920,1080]]) await capture('running',w,h);
  window.reload();
  await until('Boolean(document.querySelector(".diagnostic-runner")) && !document.querySelector(".startup-screen")');
  assert(await js(`return (await window.switchboard.getSnapshot()).diagnostics.id === ${JSON.stringify(runId)}`), 'Run state survives renderer reload');
  await until('(await window.switchboard.getSnapshot()).diagnostics.status !== "running"', 45000);
  const failed = await exportTo('failed-capture.json');
  assert(failed.diagnosticRun.checks.some(check => check.id === 'encoder.h264_amf' && check.status === 'pass'), 'Encoder probe success appears in export');
  assert(failed.diagnosticRun.checks.some(check => check.id === 'capture.software' && check.status === 'fail' && check.detail.includes('0x80070057')), 'Real child-process stderr reaches the exported capture failure');
  assert(failed.environment.graphics && !failed.developer.enabled, 'GPU context exports without enabling background developer logging');
  assert(await js(`return JSON.stringify((await window.switchboard.getSnapshot()).capture.config) === ${JSON.stringify(JSON.stringify(configBefore))}`), 'Diagnostic run preserves capture preferences');
  assert(await js('return (await window.switchboard.getSnapshot()).engines.find(engine => engine.kind === "capture").state === "stopped"'), 'Disabled Replay stays disabled after diagnostic host cleanup');
  await js('document.querySelector(".diagnostic-runner__results").open = true; [...document.querySelectorAll(".diagnostic-runner__results li")].find(el => el.textContent.includes("Display · software H.264")).querySelector("details").open = true;');
  for (const [w,h] of [[1080,720],[1420,900],[1920,1080]]) await capture('failed-results',w,h);
  dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
  await clickText('Save diagnostics');
  await until('document.body.textContent.includes("Save cancelled.")');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(output,'missing','result.json') });
  await clickText('Save diagnostics');
  await until('document.body.textContent.includes("Could not save diagnostics. Choose another location and try again.")');
  await capture('save-error',1080,720);
  await clickText('Run diagnostics');
  await until('(await window.switchboard.getSnapshot()).diagnostics.checks.some(check => check.id === "ffmpeg" && check.status === "running")');
  await clickText('Cancel diagnostics');
  await until('(await window.switchboard.getSnapshot()).diagnostics.status === "cancelled"');
  await capture('cancelled',1080,720);
  delete process.env.SWITCHBOARD_DIAGNOSTIC_PROBE_DELAY_MS;
  process.env.SWITCHBOARD_DIAGNOSTIC_CAPTURE_SUCCESS = '1';
  await clickText('Run diagnostics');
  await until('(await window.switchboard.getSnapshot()).diagnostics.status === "completed"');
  const success = await exportTo('working-display.json');
  assert(success.diagnosticRun.checks.some(check => check.id === 'capture.hardware' && check.status === 'pass'), 'Successful discard-sink capture produces a passed check');
  assert(success.diagnosticRun.checks.some(check => check.id === 'capture.duplication' && check.status === 'pass'), 'Alternative display backend is tested automatically');
  await capture('completed',1080,720);
  process.env.SWITCHBOARD_DIAGNOSTIC_RECORDING_FIXTURE = '1';
  await js('await window.switchboard.setCaptureConfig({ enabled: true, source: "display", displayIndex: 0, includeMic: false, includeSystemAudio: false, includeChatAudio: false });');
  await until('(await window.switchboard.getSnapshot()).capture.runtime.state === "buffering"');
  const before = await js('const s = await window.switchboard.getSnapshot(); return { pid: s.engines.find(e => e.kind === "capture").pid, frames: s.capture.runtime.encodedFrames };');
  await clickText('Run diagnostics');
  await until('(await window.switchboard.getSnapshot()).diagnostics.status === "completed"');
  assert(await js('return (await window.switchboard.getSnapshot()).diagnostics.checks.some(check => check.id === "capture.active" && check.status === "skipped")'), 'Active recording skips encoder and capture probes');
  assert(await js(`const s = await window.switchboard.getSnapshot(); return s.capture.runtime.state === 'buffering' && s.engines.find(e => e.kind === 'capture').pid === ${before.pid}`), 'An active native recorder keeps its host and state during diagnostics');
  await js('await window.switchboard.setCaptureConfig({ enabled: false });');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await js('[...document.querySelectorAll("button")].find(el => el.textContent.trim() === "Run diagnostics").focus();');
  await capture('focus-reduced-motion',1080,720);
  assert(await js('return document.activeElement.textContent.trim() === "Run diagnostics"'), 'Run button is keyboard focusable');
  report.passed = true;
  await writeFile(join(output,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report)); app.quit();
}).catch(async error => { report.errors.push(String(error)); await writeFile(join(output,'verification.json'),JSON.stringify(report,null,2)); console.error(error); app.exit(1); });
