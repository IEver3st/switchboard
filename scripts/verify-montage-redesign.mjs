import { execFile } from 'node:child_process';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const executeFile = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-montage-qa-'));
const mediaDirectory = join(isolatedUserData, 'clips');
const outputDirectory = join(projectRoot, 'design-qa', 'montage-redesign');
const exportDestination = join(isolatedUserData, 'Montage export.mp4');
const sourceState = process.env.APPDATA ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json') : null;
if (!sourceState) throw new Error('APPDATA is required for native montage verification.');
await mkdir(mediaDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
await copyFile(sourceState, join(isolatedUserData, 'switchboard-state.json'));

const clips = [];
for (let index = 0; index < 5; index += 1) {
  const path = join(mediaDirectory, `montage-${index + 1}.mp4`);
  const colors = ['0x15364a', '0x3d2f52', '0x4a331f', '0x224836', '0x344462'];
  await executeFile('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${colors[index]}:s=640x360:r=10:d=38.2`,
    '-f', 'lavfi', '-i', `sine=frequency=${440 + index * 110}:sample_rate=48000:duration=38.2`,
    '-shortest', '-preset', 'ultrafast', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata:s:a:0', 'title=Game', '-y', path,
  ], { windowsHide: true });
  const file = await stat(path);
  clips.push({
    id: `montage-qa-${index + 1}`,
    path,
    name: ['Opening play', 'Team follow-up', 'The chase', 'Last stand', 'Final round'][index],
    game: 'Switchboard QA',
    createdAt: Date.now() - index * 1_000,
    durationMs: 38_200,
    fileSize: file.size,
    width: 640,
    height: 360,
    fps: 10,
    codec: 'h264',
    favorite: false,
    titleEdited: true,
    canvasSize: 'original',
    audioChannels: ['game'],
  });
}

const copiedState = JSON.parse(await readFile(join(isolatedUserData, 'switchboard-state.json'), 'utf8'));
copiedState.clips = clips;
copiedState.settings.onboardingCompleted = true;
copiedState.settings.uiScalePercent = 100;
copiedState.settings.enabledWorkspaces = ['devices', 'audio', 'capture'];
copiedState.audio.enabled = false;
copiedState.capture.config.enabled = false;
copiedState.capture.config.clipsDirectory = mediaDirectory;
for (const module of copiedState.modules ?? []) if (module.id?.startsWith('device.')) module.enabled = false;
await writeFile(join(isolatedUserData, 'switchboard-state.json'), JSON.stringify(copiedState, null, 2));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setName('switchboard-montage-qa');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
shell.showItemInFolder = () => undefined;
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportDestination });

const musicPath = join(isolatedUserData, 'Custom soundtrack.wav');
await executeFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=5', '-y', musicPath], { windowsHide: true });
let importMode = 'success';
dialog.showOpenDialog = async () => importMode === 'cancel' ? ({ canceled: true, filePaths: [] }) : ({ canceled: false, filePaths: [importMode === 'failure' ? join(isolatedUserData, 'missing.wav') : musicPath] });
await import('../out/main/index.js');
void app.whenReady().then(run).catch(async (error) => {
  const current = BrowserWindow.getAllWindows()[0];
  if (current && !current.isDestroyed()) {
    console.error(await evaluate(current, `({body:document.body.innerText.slice(0,2000), ready:document.readyState})`).catch(() => null));
    await capture(current,'failure.png').catch(() => {});
  }
  console.error(error);
  app.exit(1);
});


async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  window.setTitle('Switchboard montage verification');
  window.setPosition(40, 40);
  window.webContents.setBackgroundThrottling(false);
  await waitForCondition(() => evaluate(window, `!document.querySelector('.startup-screen')`), 'startup', 30000);
  const errors = [];
  window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  const project = {
    schemaVersion: 2, type: 'montage', id: '11111111-1111-4111-8111-111111111111', name: 'Friday highlights',
    createdAt: Date.now(), updatedAt: Date.now(), durationMs: 191000, canvasSize: 'original',
    segments: clips.map((clip, index) => ({ id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`, clipId: clip.id, sourceDurationMs: clip.durationMs, trimStartMs: 0, trimEndMs: clip.durationMs, volume: 1, muted: false }))
  };
  await evaluate(window, `window.switchboard.saveMontageDraft(${JSON.stringify(project)})`);
  await waitForCondition(() => evaluate(window, `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Capture')`), 'Capture navigation', 30000);
  await clickButton(window, 'Capture');
  await waitForSelector(window, '.montage-v2-draft');
  await clickButtonStartsWith(window, 'Friday highlights');
  await waitForSelector(window, '.montage-v2-preview[data-state="ready"]');
  if (await evaluate(window, `Boolean(document.querySelector('button[aria-label="Collapse inspector"]'))`)) await clickAriaButton(window, 'Collapse inspector');
  const report = { sizes: [], checks: [], isolatedUserData };
  for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(width, height, false);
    await waitForViewport(window, { width, height });
    await delay(350);
    const state = await evaluate(window, `(() => {
      const viewport = document.querySelector('.montage-v2-timeline__viewport');
      const play = document.querySelector('.montage-v2-play').getBoundingClientRect();
      const lane = document.querySelector('.montage-v2-music-lane').getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, scroll: viewport.scrollWidth, client: viewport.clientWidth, segments: document.querySelectorAll('.montage-v2-segment').length, playBottom: play.bottom, musicBottom: lane.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
    })()`);
    if (state.scroll > state.client + 1 || state.overflow || state.musicBottom > height || state.playBottom > height) throw new Error(`Layout failure ${JSON.stringify(state)}`);
    report.sizes.push(state);
    await capture(window, `${width}x${height}-fit.png`);
  }
  await clickButton(window, 'Play');
  await waitForCondition(() => evaluate(window, `document.querySelector('video[data-active="true"]').currentTime > 0.2`), 'playback advance');
  await clickButton(window, 'Pause');
  const paused = await evaluate(window, `document.querySelector('video[data-active="true"]').paused`);
  if (!paused) throw new Error('Pause failed');
  report.checks.push('Visible play and pause');
  await clickAriaButton(window, 'Zoom in');
  await delay(100);
  if (!await evaluate(window, `document.querySelector('.montage-v2-timeline__viewport').scrollWidth > document.querySelector('.montage-v2-timeline__viewport').clientWidth`)) throw new Error('Zoom failed');
  await clickButton(window, 'Fit');
  report.checks.push('Zoom and fit');
  await evaluate(window, `(() => { const select = document.querySelector('[aria-label="Montage canvas"]'); select.value = '9:16'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitForSelector(window, '.montage-v2-preview[data-canvas="9:16"]');
  const vertical = await rect(window, 'video[data-active="true"]');
  if (Math.abs(vertical.width/vertical.height - 9/16) > 0.01) throw new Error('Vertical preview aspect ratio');
  await capture(window,'vertical-canvas.png');
  await evaluate(window, `(() => { const select = document.querySelector('[aria-label="Montage canvas"]'); select.value = 'original'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  report.checks.push('Canvas selection and vertical preview aspect ratio');
  const ruler = await rect(window, '.montage-v2-ruler');
  await nativeClick(window, ruler.x + ruler.width * 0.198, ruler.y + 10);
  await waitForSelector(window, '.montage-v2-preview[data-state="ready"]');
  await clickButton(window, 'Play');
  await waitForCondition(() => evaluate(window, `document.querySelector('video[data-active="true"]').dataset.clipId === 'montage-qa-2'`), 'boundary playback');
  await clickButton(window, 'Pause');
  report.checks.push('Ruler seek and continuous clip boundary playback');
  await clickAriaButton(window, 'Back to start');
  importMode = 'cancel';
  await clickButton(window, 'Add music');
  await delay(200);
  if (await evaluate(window, `Boolean(document.querySelector('.montage-v2-music-clip'))`)) throw new Error('Canceled import changed track');
  importMode = 'failure';
  await clickButton(window, 'Add music');
  await waitForSelector(window, '.montage-v2-notice[data-error="true"]');
  await capture(window, 'import-error.png');
  importMode = 'success';
  await clickButton(window, 'Add music');
  await waitForSelector(window, '.montage-v2-music-clip');
  await waitForCondition(() => evaluate(window, `document.querySelectorAll('.montage-v2-waveform i').length > 0`), 'real waveform', 20000);
  await waitForCondition(() => evaluate(window, `document.activeElement?.classList.contains('montage-v2-music-settings')`), 'music settings focus');
  await capture(window, '1920x1080-music.png');
  report.checks.push('Import cancel, failure, recovery, managed WAV and real waveform');
  await clickButton(window, 'Play');
  await waitForCondition(() => evaluate(window, `!document.querySelector('.montage-v2-preview audio').paused && document.querySelector('.montage-v2-preview audio').currentTime > 0.1`), 'music playback');
  await clickButton(window, 'Pause');
  await clickAriaButton(window, 'Loop music track');
  await clickButton(window, 'Mute');
  await waitForSelector(window, '.montage-v2-music-clip[data-muted="true"]');
  await clickButton(window, 'Unmute');
  await clickButton(window, 'Replace music');
  await delay(500);
  await clickAriaButton(window, 'Collapse inspector');
  await clickButton(window, 'Music settings');
  for (const [width, height] of [[1080,720],[1420,900]]) {
    window.setContentSize(width,height,false);
    await waitForViewport(window,{width,height});
    await clickButton(window, 'Music settings');
    await waitForCondition(() => evaluate(window, `document.querySelector('.montage-v2-timeline__viewport').scrollWidth <= document.querySelector('.montage-v2-timeline__viewport').clientWidth + 1`), 'fit after inspector resize');
    await delay(240);
    const musicBottom = await evaluate(window, `document.querySelector('.montage-v2-music-actions').getBoundingClientRect().bottom`);
    if (musicBottom > height) throw new Error('Music controls below viewport');
    await capture(window, `${width}x${height}-music.png`);
  }
  await setField(window, 'Timeline start', '1');
  await setField(window, 'Source in', '0.2');
  await setField(window, 'Source out', '4');
  await setField(window, 'Fade in', '0.3');
  await setField(window, 'Fade out', '0.4');
  await clickAriaButton(window, 'Back to start');
  await waitForSelector(window, '.montage-v2-preview[data-state="ready"]');
  await clickButton(window, 'Play');
  await waitForCondition(() => evaluate(window, `!document.querySelector('.montage-v2-preview audio').paused && document.querySelector('.montage-v2-preview audio').currentTime > 0.2`), 'delayed music start');
  await clickButton(window, 'Pause');
  await clickAriaButton(window, 'Collapse inspector');
  window.focus();
  window.webContents.focus();
  await delay(100);
  await evaluate(window, `document.querySelector('[aria-label="Montage playhead"]').focus()`);
  window.webContents.sendInputEvent({ type:'keyDown', keyCode:'END' });
  window.webContents.sendInputEvent({ type:'keyUp', keyCode:'END' });
  await waitForCondition(() => evaluate(window, `Number(document.querySelector('[aria-label="Montage playhead"]').getAttribute('aria-valuenow')) === 191000`), 'keyboard seek to end');
  window.webContents.sendInputEvent({ type:'keyDown', keyCode:'HOME' });
  window.webContents.sendInputEvent({ type:'keyUp', keyCode:'HOME' });
  await waitForSelector(window, '.montage-v2-preview[data-state="ready"]');
  const rulerDrag = await rect(window, '.montage-v2-ruler');
  window.webContents.sendInputEvent({type:'mouseDown',x:Math.round(rulerDrag.x+10),y:Math.round(rulerDrag.y+10),button:'left',clickCount:1});
  for (const fraction of [0.2,0.4,0.6,0.8]) window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(rulerDrag.x+rulerDrag.width*fraction),y:Math.round(rulerDrag.y+10),button:'left'});
  window.webContents.sendInputEvent({type:'mouseUp',x:Math.round(rulerDrag.x+rulerDrag.width*0.8),y:Math.round(rulerDrag.y+10),button:'left',clickCount:1});
  await waitForCondition(() => evaluate(window, `Number(document.querySelector('[aria-label="Montage playhead"]').getAttribute('aria-valuenow')) > 140000`), 'drag scrubbing');
  await clickAriaButton(window, 'Enter fullscreen');
  await waitForSelector(window, '.montage-v2-preview[data-fullscreen="true"]');
  await clickAriaButton(window, 'Exit fullscreen');
  await clickAriaButton(window, 'Mute preview');
  await clickAriaButton(window, 'Unmute preview');
  report.checks.push('Delayed music, source trim/fades, keyboard Home/End, pointer drag scrub, fullscreen and preview mute');
  await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'reduce'}] });
  await clickButton(window, 'Music settings');
  await delay(100);
  await capture(window,'1080x720-reduced-motion.png');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features:[] });
  await window.webContents.debugger.detach();
  report.checks.push('Reduced motion');
  await clickButton(window, 'Back to clips');
  await waitForMissingSelector(window, '.montage-v2-shell');
  window.focus();
  window.webContents.focus();
  const reloaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload();
  await reloaded;
  await waitForCondition(() => evaluate(window, `!document.querySelector('.startup-screen')`), 'reload', 30000);
  await waitForCondition(() => evaluate(window, `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Capture')`), 'Capture navigation', 30000);
  await clickButton(window, 'Capture');
  await waitForSelector(window, '.montage-v2-draft');
  await clickButtonStartsWith(window, 'Friday highlights');
  await waitForSelector(window, '.montage-v2-music-clip');
  const drafts = await evaluate(window, 'window.switchboard.listMontageDrafts()');
  if (!drafts[0].music || drafts[0].music.timelineStartMs !== 1000 || drafts[0].music.sourceStartMs !== 200 || drafts[0].music.fadeInMs !== 300 || drafts[0].segments.length !== 5) throw new Error('Persistence failed');
  report.checks.push('Music preview, mute, loop, replacement, settings and persisted reload');
  // Exercise the real export API with a short range to keep the regression bounded.
  const exported = { ...drafts[0], segments: drafts[0].segments.slice(0,2).map(s => ({...s, trimEndMs: 1000})), durationMs: 2000 };
  const success = await evaluate(window, `window.switchboard.exportMontageV2({exportId:'33333333-3333-4333-8333-333333333333',preset:'original',project:${JSON.stringify(exported)}})`);
  if (!success || (await stat(exportDestination)).size === 0) throw new Error('Export failed');
  report.checks.push('Real FFmpeg export with imported music');
  report.errors = errors;
  await writeFile(join(outputDirectory,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  app.exit(0);
}

async function verifyNoHorizontalOverflow(window, label) {
  const value = await evaluate(window, `({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })`);
  if (value.scrollWidth !== value.clientWidth) throw new Error(`Horizontal overflow in ${label}: ${JSON.stringify(value)}`);
}

async function capture(window, name) {
  await delay(240);
  await writeFile(join(outputDirectory, name), (await window.webContents.capturePage()).toPNG());
}

async function clickButton(window, label) {
  const clicked = await evaluate(window, `(() => { const button = [...document.querySelectorAll('button')].find((value) => value.textContent?.trim() === ${JSON.stringify(label)} && !value.disabled); button?.click(); return Boolean(button); })()`);
  if (!clicked) throw new Error(`Could not click ${label}.`);
}

async function clickButtonStartsWith(window, label) {
  const clicked = await evaluate(window, `(() => { const button = [...document.querySelectorAll('button')].find((value) => value.textContent?.trim().startsWith(${JSON.stringify(label)}) && !value.disabled); button?.click(); return Boolean(button); })()`);
  if (!clicked) throw new Error(`Could not click ${label}.`);
}

async function clickAriaButton(window, label) {
  const clicked = await evaluate(window, `(() => { const button = document.querySelector('button[aria-label=${JSON.stringify(label)}]'); button?.click(); return Boolean(button); })()`);
  if (!clicked) throw new Error(`Could not click button labelled ${label}.`);
}

async function rect(window, selector) {
  const value = await evaluate(window, `(() => { const rect = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null; })()`);
  if (!value) throw new Error(`Missing geometry for ${selector}.`);
  return value;
}

async function nativeClick(window, x, y) {
  window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
  window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  await delay(160);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await delay(50);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForLoad(window) {
  if (window.webContents.getURL() && !window.webContents.isLoading()) return;
  await new Promise((resolveLoad, reject) => {
    const timeout = setTimeout(() => reject(new Error('Switchboard renderer did not load.')), 20_000);
    window.webContents.once('did-finish-load', () => { clearTimeout(timeout); resolveLoad(); });
  });
}

async function waitForSelector(window, selector) {
  await waitForCondition(() => evaluate(window, `Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector);
}

async function waitForMissingSelector(window, selector) {
  await waitForCondition(() => evaluate(window, `!document.querySelector(${JSON.stringify(selector)})`), `${selector} to close`);
}

async function waitForCondition(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForViewport(window, viewport) {
  await waitForCondition(async () => {
    const size = await evaluate(window, `({ width: innerWidth, height: innerHeight })`);
    return size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2;
  }, `${viewport.width}x${viewport.height} viewport`);
}

function evaluate(window, expression) {
  return window.webContents.executeJavaScript(expression, true);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function setField(window, label, value) {
  await evaluate(window, `(() => {
    const field = [...document.querySelectorAll('label')].find(el => el.querySelector('span')?.textContent === ${JSON.stringify(label)})?.querySelector('input');
    if (!field) throw new Error('Field missing: ' + ${JSON.stringify(label)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await delay(100);
}
