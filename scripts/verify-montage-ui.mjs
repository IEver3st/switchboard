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
const outputDirectory = join(projectRoot, 'design-qa', 'create-montage');
const exportDestination = join(isolatedUserData, 'Montage export.mp4');
const sourceState = process.env.APPDATA ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json') : null;
if (!sourceState) throw new Error('APPDATA is required for native montage verification.');
await mkdir(mediaDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
await copyFile(sourceState, join(isolatedUserData, 'switchboard-state.json'));

const clips = [];
for (let index = 0; index < 3; index += 1) {
  const path = join(mediaDirectory, `montage-${index + 1}.mp4`);
  const colors = ['0x15364a', '0x3d2f52', '0x4a331f'];
  await executeFile('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${colors[index]}:s=1280x720:r=30:d=1.2`,
    '-f', 'lavfi', '-i', `sine=frequency=${440 + index * 110}:sample_rate=48000:duration=1.2`,
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata:s:a:0', 'title=Game', '-y', path,
  ], { windowsHide: true });
  const file = await stat(path);
  clips.push({
    id: `montage-qa-${index + 1}`,
    path,
    name: ['Opening play', 'Team follow-up', 'Final round'][index],
    game: 'Switchboard QA',
    createdAt: Date.now() - index * 1_000,
    durationMs: 1_200,
    fileSize: file.size,
    width: 1_280,
    height: 720,
    fps: 30,
    codec: 'h264',
    favorite: false,
    titleEdited: true,
    canvasSize: 'original',
    audioChannels: ['game'],
  });
}

const copiedState = JSON.parse(await readFile(join(isolatedUserData, 'switchboard-state.json'), 'utf8'));
copiedState.clips = clips;
copiedState.audio.enabled = false;
copiedState.capture.config.enabled = false;
copiedState.capture.config.clipsDirectory = mediaDirectory;
for (const module of copiedState.modules ?? []) if (module.id?.startsWith('device.')) module.enabled = false;
await writeFile(join(isolatedUserData, 'switchboard-state.json'), JSON.stringify(copiedState, null, 2));

app.setName('switchboard-montage-qa');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
shell.showItemInFolder = () => undefined;
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportDestination });

await import('../out/main/index.js');
void app.whenReady().then(run).catch((error) => {
  console.error(error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  try {
    await waitForCondition(() => evaluate(window, `!document.querySelector('.startup-screen')`), '.startup-screen to close', 30_000);
  } catch (error) {
    const diagnostics = await evaluate(window, `({ body: document.body.innerText.slice(0, 1200), hash: location.hash, startup: document.querySelector('.startup-screen')?.outerHTML.slice(0, 500) })`);
    throw new Error(`${error.message} ${JSON.stringify(diagnostics)}`);
  }
  window.setContentSize(1080, 720, false);
  await waitForViewport(window, { width: 1080, height: 720 });
  await clickButton(window, 'Capture');
  await waitForSelector(window, 'button[data-clip-id]');

  await clickButton(window, 'Create Montage');
  await waitForSelector(window, '[data-testid="montage-selection-toolbar"]');
  await clickButton(window, 'Cancel');
  await waitForMissingSelector(window, '[data-testid="montage-selection-toolbar"]');
  await clickButton(window, 'Create Montage');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESCAPE' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ESCAPE' });
  await waitForMissingSelector(window, '[data-testid="montage-selection-toolbar"]');

  await clickButton(window, 'Create Montage');
  const initialSelection = await selectionState(window);
  if (!initialSelection.createDisabled || initialSelection.checkboxes !== 3) throw new Error(`Invalid initial montage selection state: ${JSON.stringify(initialSelection)}`);
  await clickAriaButton(window, 'Add Opening play to montage');
  const oneSelected = await selectionState(window);
  if (oneSelected.count !== '1 selected' || !oneSelected.createDisabled) throw new Error(`One-clip selection rule failed: ${JSON.stringify(oneSelected)}`);
  await clickAriaButton(window, 'Add Team follow-up to montage');
  await clickAriaButton(window, 'Add Final round to montage');
  const validSelection = await selectionState(window);
  if (validSelection.count !== '3 selected' || validSelection.createDisabled || validSelection.orders.join(',') !== '1,2,3') {
    throw new Error(`Ordered montage selection failed: ${JSON.stringify(validSelection)}`);
  }
  await capture(window, '1080x720-montage-selection.png');
  await clickButtonStartsWith(window, 'Create Montage · 3 clips');
  await waitForSelector(window, '[data-testid="clip-editor"][data-project-type="montage"]');
  await waitForSelector(window, '.clip-editor-preview[data-state="ready"]');
  await verifyNoHorizontalOverflow(window, '1080x720 montage editor');
  await capture(window, '1080x720-montage-editor.png');

  const orderBefore = await segmentOrder(window);
  await evaluate(window, `(() => {
    const segments = [...document.querySelectorAll('.montage-segment')];
    const transfer = new DataTransfer();
    segments[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    segments[2].dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    segments[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    segments[0].dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  })()`);
  await waitForCondition(async () => (await segmentOrder(window)).join('|') !== orderBefore.join('|'), 'segment reorder');
  const orderAfter = await segmentOrder(window);
  if (orderAfter.join('|') !== 'Team follow-up|Final round|Opening play') throw new Error(`Unexpected reordered sequence: ${orderAfter.join('|')}`);

  const trimLabel = `${orderAfter[0]} trim end`;
  const trimBefore = Number(await evaluate(window, `document.querySelector('[aria-label=${JSON.stringify(trimLabel)}]')?.getAttribute('aria-valuenow')`));
  await evaluate(window, `document.querySelector('[aria-label=${JSON.stringify(trimLabel)}]')?.focus()`);
  for (let index = 0; index < 4; index += 1) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'LEFT' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'LEFT' });
  }
  const trimAfter = Number(await evaluate(window, `document.querySelector('[aria-label=${JSON.stringify(trimLabel)}]')?.getAttribute('aria-valuenow')`));
  if (!(trimAfter < trimBefore)) throw new Error(`Montage trim did not change: ${trimBefore} -> ${trimAfter}`);

  const scrubRect = await rect(window, '.montage-scrub');
  await nativeClick(window, scrubRect.x + scrubRect.width * 0.58, scrubRect.y + scrubRect.height / 2);
  const scrubbedMs = Number(await evaluate(window, `document.querySelector('[aria-label="Montage playhead"]')?.getAttribute('aria-valuenow')`));
  if (!(scrubbedMs > 0)) throw new Error('Montage scrub did not advance the global playhead.');

  await nativeClick(window, scrubRect.x + scrubRect.width * 0.02, scrubRect.y + scrubRect.height / 2);
  await waitForCondition(() => evaluate(window, `document.querySelector('.montage-segment')?.getAttribute('data-selected') === 'true'`), 'seek to first montage segment');
  await clickAriaButton(window, 'Play montage');
  await waitForCondition(() => evaluate(window, `document.querySelector('.montage-timeline')?.getAttribute('data-playing') === 'true'`), 'montage playback start');
  await waitForCondition(() => evaluate(window, `(() => {
    const first = document.querySelector('.montage-segment');
    const preview = document.querySelector('.clip-editor-preview--montage');
    const slot = preview?.getAttribute('data-active-slot');
    const video = document.querySelector('[data-preview-slot="' + slot + '"]');
    return first?.getAttribute('aria-pressed') === 'false' && video && !video.paused && video.readyState >= 2;
  })()`), 'continuous clip boundary', 6_000);

  for (const viewport of [{ width: 1420, height: 900 }, { width: 1920, height: 1080 }]) {
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(window, viewport);
    await verifyNoHorizontalOverflow(window, `${viewport.width}x${viewport.height} montage editor`);
    await capture(window, `${viewport.width}x${viewport.height}-montage-editor.png`);
  }

  await clickButton(window, 'Share');
  await waitForSelector(window, '[data-share-clip-dialog][role="dialog"]');
  await evaluate(window, `document.querySelector('label[for="share-preset-original"]')?.click()`);
  await clickButton(window, 'Choose destination');
  await waitForCondition(async () => {
    try { return (await stat(exportDestination)).size > 0; } catch { return false; }
  }, 'montage export output', 30_000);
  await waitForMissingSelector(window, '[data-share-clip-dialog][role="dialog"]');

  await clickButton(window, 'Back to clips');
  await waitForMissingSelector(window, '[data-testid="clip-editor"]');
  await evaluate(window, `document.querySelector('button[data-clip-id]')?.click()`);
  await waitForSelector(window, '[data-testid="clip-editor"]');
  const singleUnaffected = await evaluate(window, `Boolean(document.querySelector('.clip-editor-timeline')) && !document.querySelector('[data-testid="clip-editor"]')?.hasAttribute('data-project-type')`);
  if (!singleUnaffected) throw new Error('Single-clip editor did not remain on its original timeline path.');

  const report = {
    selection: validSelection,
    orderBefore,
    orderAfter,
    trim: { before: trimBefore, after: trimAfter },
    scrubbedMs,
    boundarySwitched: true,
    exportBytes: (await stat(exportDestination)).size,
    singleUnaffected,
  };
  await writeFile(join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outputDirectory, report }, null, 2));
  app.quit();
}

async function selectionState(window) {
  return evaluate(window, `(() => {
    const toolbar = document.querySelector('[data-testid="montage-selection-toolbar"]');
    const create = [...toolbar.querySelectorAll('button')].find((button) => button.textContent.includes('Create Montage'));
    return {
      count: toolbar.querySelector('[aria-live="polite"]')?.textContent?.trim(),
      createDisabled: create?.disabled,
      checkboxes: document.querySelectorAll('[role="checkbox"]').length,
      orders: [...document.querySelectorAll('.capture-clip-selection-control > span')].map((value) => value.textContent.trim()),
    };
  })()`);
}

async function segmentOrder(window) {
  return evaluate(window, `[...document.querySelectorAll('.montage-segment > span')].map((value) => [...value.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim())`);
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
