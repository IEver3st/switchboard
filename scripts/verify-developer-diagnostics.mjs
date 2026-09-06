import { app, BrowserWindow, desktopCapturer, dialog } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'switchboard-developer-diagnostics-'));
const output = resolve('design-qa', `developer-diagnostics-${Date.now()}`);
await mkdir(output, { recursive: true });
await mkdir(join(profile, 'videos'));
app.setName('switchboard-developer-diagnostics-review');
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
  await delay(150);
  assert(!window.isVisible() && !window.isFocused(), `${name}: app stays hidden and unfocused`);
  assert(await js('return document.documentElement.scrollWidth <= innerWidth'), `${name}: no page overflow at ${width}x${height}`);
  const file = `${name}-${width}x${height}.png`;
  await writeFile(join(output, file), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  report.screenshots.push(file);
}

await import('../out/main/index.js');
void app.whenReady().then(async () => {
  for (let i = 0; i < 200 && !window; i++) { window = BrowserWindow.getAllWindows()[0]; await delay(100); }
  if (!window) throw new Error('Review window unavailable.');
  window.setMinimumSize(1, 1);
  window.setPosition(-30000, -30000);
  window.setSkipTaskbar(true);
  window.webContents.setBackgroundThrottling(false);
  await until('Boolean(window.switchboard)');
  window.webContents.debugger.attach('1.3');
  await js('await window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100, automaticAppUpdates: false, scanGamesAutomatically: false });');
  await until('Boolean(document.querySelector("main")) && !document.querySelector(".startup-screen")');
  assert(await js('return !(await window.switchboard.getSnapshot()).settings.developerMode'), 'Developer mode starts disabled');
  const blocked = await js('try { await window.switchboard.exportResourceDiagnostics(); return false; } catch (error) { return error.message.includes("Developer mode"); }');
  assert(blocked, 'export is gated in main when Developer mode is off');

  await js('await window.switchboard.updateSettings({ developerMode: true }); sessionStorage.setItem("switchboard.settings.category", "diagnostics"); document.querySelector("button[aria-label=Settings]").click();');
  await until('Boolean(document.querySelector(".settings-diagnostics"))');
  const immediate = await exportTo('immediate.json');
  assert(immediate.schemaVersion === 2 && immediate.samples.length === 0, 'diagnostics exports before any resource sample');
  assert(immediate.developer.events.some(event => event.event === 'diagnostics.enabled'), 'Developer mode starts an event timeline');
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    await capture('events', width, height);
    assert(await js(`const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Export diagnostics'); const r = button.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight;`), `export visible without scrolling at ${width}x${height}`);
  }

  // Start waiting, then reject a display change with the real .NET host and a
  // fixture FFmpeg process. This reproduced the previous error -> waiting bug.
  await js('await window.switchboard.setCaptureConfig({ enabled: true, source: "automatic-game", encoder: "amf", codec: "h264", resolution: "1080p", fps: 30, includeMic: false, includeSystemAudio: false, includeChatAudio: false });');
  assert(await js('return (await window.switchboard.getSnapshot()).engines.some(engine => engine.kind === "capture" && engine.pid && engine.state === "running")'), 'first enable and source refresh retain the newly started host');
  const failure = await js('try { await window.switchboard.setCaptureConfig({ source: "display", displayIndex: 0, sourceId: "display:0" }); return ""; } catch (error) { return error.message; }');
  assert(failure.includes('0x80070057') && failure.includes('-1313558101'), 'host request retains original FFmpeg failure detail');
  await delay(2200);
  assert(await js('return (await window.switchboard.getSnapshot()).capture.runtime.state === "error"'), 'live-host startup failure stays Error beyond the old automatic recovery delay');
  const afterFailure = await exportTo('capture-failure.json');
  assert(afterFailure.capture.runtime.state === 'error', 'export retains canonical capture Error state');
  assert(afterFailure.developer.events.some(event => event.source === 'capture' && event.event === 'ffmpeg.output' && event.data.line.includes('0x80070057')), 'native FFmpeg stderr reaches the export');
  assert(afterFailure.developer.events.some(event => event.event === 'ffmpeg.start' && event.data.arguments.includes('gfxcapture=')), 'export includes actual capture filter and encoder arguments');
  assert(afterFailure.developer.events.some(event => event.event === 'capture.configure-rejected'), 'export correlates the rejected source change');
  assert(!JSON.stringify(afterFailure).includes(profile), 'export redacts the isolated profile path');
  await until('document.body.textContent.includes("Capture failure")');
  await capture('capture-error', 1080, 720);

  // Recovery on a real host exit still works. Only kill the PID created by this
  // isolated app, obtained from its canonical snapshot, never an installed host.
  const hostPid = await js('return (await window.switchboard.getSnapshot()).engines.find(engine => engine.kind === "capture").pid');
  assert(Number.isInteger(hostPid) && hostPid > 0, 'isolated host PID is available for recovery test');
  await js('await window.switchboard.updateSettings({ developerMode: false });');
  assert(await js(`return (await window.switchboard.getSnapshot()).engines.find(engine => engine.kind === 'capture').pid === ${hostPid}`), 'disabling diagnostics does not stop or restart the active host');
  await js('await window.switchboard.updateSettings({ developerMode: true });');
  await clickText('Diagnostics');
  await until('Boolean(document.querySelector(".settings-diagnostics"))');
  const liveToggle = await exportTo('live-host-toggle.json');
  assert(liveToggle.developer.events.some(event => event.source === 'capture' && event.event === 'capture.diagnostics-context'), 'diagnostic enable command reaches an already running native host');
  assert(!liveToggle.developer.events.some(event => event.event === 'ffmpeg.start'), 'toggling diagnostics does not restart FFmpeg');
  process.kill(hostPid);
  await until(`(await window.switchboard.getSnapshot()).capture.runtime.state === 'waiting' && (await window.switchboard.getSnapshot()).engines.some(engine => engine.kind === 'capture' && engine.pid && engine.pid !== ${hostPid} && engine.state === 'running')`);
  assert(true, 'actual host exit starts a replacement host');
  await js('await window.switchboard.setCaptureConfig({ enabled: false });');

  await js(`document.querySelector('[aria-label="Detailed resource diagnostics"]').click();`);
  await until('Boolean((await window.switchboard.getSnapshot()).performance.debug) && Boolean(window.switchboardDebugRuntime)');
  const sampled = await exportTo('with-resources.json');
  assert(sampled.samples.length > 0 && sampled.developer.events.length > 0, 'one file includes both resources and developer events');
  assert(sampled.environment.windowsRelease && sampled.environment.graphics, 'export includes Windows and GPU context');
  window.reload();
  await until('Boolean(document.querySelector(".settings-diagnostics"))');
  assert(await js('return (await window.switchboard.getSnapshot()).settings.developerMode && (await window.switchboard.getSnapshot()).settings.detailedDiagnostics'), 'settings survive renderer reload');

  let finishDialog;
  dialog.showSaveDialog = () => new Promise(resolve => { finishDialog = resolve; });
  await clickText('Export diagnostics');
  await until('document.body.textContent.includes("Exporting…")');
  assert(await js('return [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Exporting…" && button.disabled)'), 'export cannot be repeated while pending');
  finishDialog({ canceled: true, filePath: '' });
  await until('document.body.textContent.includes("Export canceled.")');
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(output, 'missing', 'output.json') });
  await clickText('Export diagnostics');
  await until('document.body.textContent.includes("Could not save the report")');
  await capture('export-error', 1080, 720);
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(output, 'ui-export.json') });
  await clickText('Export diagnostics');
  await until('document.body.textContent.includes("Report saved.")');

  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await js('[...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Export diagnostics").focus();');
  assert(await js('return document.activeElement.textContent.trim() === "Export diagnostics"'), 'export is keyboard focusable');
  await capture('focus-reduced-motion', 1080, 720);
  window.webContents.debugger.detach();

  await js('await window.switchboard.updateSettings({ developerMode: false });');
  await until('!(await window.switchboard.getSnapshot()).settings.detailedDiagnostics && !window.switchboardDebugRuntime');
  assert(await js('return !document.querySelector(".settings-diagnostics") && !(await window.switchboard.getSnapshot()).performance.debug'), 'disabling Developer mode hides diagnostics and removes resource probes');
  await js('await window.switchboard.updateSettings({ developerMode: true });');
  const restarted = await exportTo('new-session.json');
  assert(restarted.developer.sessionId !== sampled.developer.sessionId, 're-enabling Developer mode starts a fresh timeline');
  assert(!restarted.developer.events.some(event => event.event === 'ffmpeg.output'), 'old host output is absent from a new session');
  const disk = JSON.parse(await readFile(join(profile, 'switchboard-state.json'), 'utf8'));
  assert(!disk.settings.detailedDiagnostics, 'resource sampling disable persists on disk');
  await js('await window.switchboard.updateSettings({ developerMode: false });');
  report.passed = true;
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.quit();
}).catch(async error => {
  report.errors.push(String(error));
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.error(error);
  app.exit(1);
});
