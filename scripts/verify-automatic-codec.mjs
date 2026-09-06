import { app, BrowserWindow, desktopCapturer, dialog } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const profile = await mkdtemp(join(tmpdir(), 'switchboard-automatic-codec-'));
const output = resolve('design-qa', `automatic-codec-${Date.now()}`);
await mkdir(output, { recursive: true });
await mkdir(join(profile, 'videos'));
app.setName('switchboard-automatic-codec-review');
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
  await until('!document.querySelector(".startup-screen")');
  await js(`const control = document.querySelector('[aria-label="${name.startsWith('settings') ? 'Video codec' : 'Codec'}"]'); if (!control) throw new Error('Codec control missing'); control.scrollIntoView({ block: 'center', behavior: 'instant' });`);
  // Wake the hidden compositor before collecting the settled review frame.
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await delay(600);
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
  await until('Boolean(window.switchboard)');
  window.webContents.debugger.attach('1.3');
  await js('await window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100, automaticAppUpdates: false, scanGamesAutomatically: false });');
  await until('Boolean(document.querySelector("main")) && !document.querySelector(".startup-screen")');
  await js('await window.switchboard.setCaptureConfig({ enabled: false, codec: "h264", encoder: "auto" }); sessionStorage.setItem("switchboard.settings.category", "capture"); document.querySelector("button[aria-label=Settings]").click();');
  await until('Boolean(document.querySelector("[aria-label=\\"Video codec\\"]"))');
  async function choose(label, value) {
    await js(`document.querySelector('[aria-label="${label}"]').click();`);
    await until('Boolean(document.querySelector("[role=option]"))');
    await js(`const item = [...document.querySelectorAll('[role=option]')].find(el => el.textContent.trim() === ${JSON.stringify(value)}); if (!item) throw new Error('Option absent'); item.click();`);
  }
  await choose('Video codec', 'Automatic');
  await until('(await window.switchboard.getSnapshot()).capture.config.codec === "auto"');
  assert(true, 'Settings control applies Automatic through canonical IPC');
  window.reload();
  await until('Boolean(document.querySelector("[aria-label=\\"Video codec\\"]"))');
  assert(await js('return document.querySelector("[aria-label=\\"Video codec\\"]").textContent.includes("Automatic") && (await window.switchboard.getSnapshot()).capture.config.codec === "auto"'), 'Automatic survives renderer reload');
  for (const [w,h] of [[1080,720],[1420,900],[1920,1080]]) await capture('settings-capture',w,h);
  await choose('Video codec', 'H.264');
  await until('(await window.switchboard.getSnapshot()).capture.config.codec === "h264"');
  await choose('Video codec', 'Automatic');
  await js('await window.switchboard.setCaptureConfig({ enabled: true, source: "automatic-game" });');
  await until('(await window.switchboard.getSnapshot()).capture.runtime.state === "waiting"');
  assert(await js('return (await window.switchboard.getSnapshot()).capture.runtime.encoderLabel === "AMD AMF H.264"'), 'Actual native host resolves Automatic to fixture-tested AMD H.264');
  await js('await window.switchboard.setCaptureConfig({ enabled: false });');
  await js('window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));');
  await js('const button = [...document.querySelectorAll("nav button")].find(el => el.textContent.trim() === "Capture"); if (!button) throw new Error("Capture navigation missing"); button.click();');
  await until('Boolean(document.querySelector(".capture-recorder-settings-trigger"))');
  await js('document.querySelector(".capture-recorder-settings-trigger").click();');
  await until('Boolean(document.querySelector(".capture-replay-advanced__trigger"))');
  await js('document.querySelector(".capture-replay-advanced__trigger").click();');
  await until('Boolean(document.querySelector("[aria-label=Codec]"))');
  for (const [w,h] of [[1080,720],[1420,900],[1920,1080]]) await capture('replay-codec',w,h);
  await choose('Codec', 'H.264');
  await until('(await window.switchboard.getSnapshot()).capture.config.codec === "h264"');
  await choose('Codec', 'Automatic');
  await until('(await window.switchboard.getSnapshot()).capture.config.codec === "auto"');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await js('document.querySelector("[aria-label=Codec]").focus();');
  await capture('codec-focus',1080,720);
  assert(await js('return document.activeElement.getAttribute("aria-label") === "Codec"'), 'Codec control accepts keyboard focus');
  const disk = JSON.parse(await readFile(join(profile,'switchboard-state.json'),'utf8'));
  assert(disk.capture.config.codec === 'auto', 'Automatic persists on disk');
  report.passed = true;
  await writeFile(join(output,'verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report)); app.quit();
}).catch(async error => { report.errors.push(String(error)); await writeFile(join(output,'verification.json'),JSON.stringify(report,null,2)); console.error(error); app.exit(1); });
