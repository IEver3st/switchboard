import { execFile } from 'node:child_process';
import { app, BrowserWindow, dialog } from 'electron';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-clip-editor-qa-'));
const outputDirectory = await mkdtemp(join(tmpdir(), 'switchboard-clip-editor-images-'));
const sourceState = process.env.APPDATA ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json') : null;
if (!sourceState) throw new Error('APPDATA is required for native clip editor verification.');
await copyFile(sourceState, join(isolatedUserData, 'switchboard-state.json'));

const copiedState = JSON.parse(await readFile(join(isolatedUserData, 'switchboard-state.json'), 'utf8'));
if (!copiedState.clips?.some((clip) => clip.path)) throw new Error('Native clip editor verification requires one indexed clip.');

app.setName('switchboard-clip-editor-qa');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';

let exportDestination = null;
dialog.showSaveDialog = async () => exportDestination
  ? { canceled: false, filePath: exportDestination }
  : { canceled: true, filePath: undefined };

await import('../out/main/index.js');
void app.whenReady().then(run).catch((error) => {
  console.error(error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  const results = [];

  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    console.log(`Verifying ${viewport.width}x${viewport.height}.`);
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(window, viewport);
    await openEditor(window);

    const metrics = await evaluate(window, `(() => {
      const editor = document.querySelector('[data-testid="clip-editor"]');
      const header = editor?.querySelector('header');
      const back = [...(editor?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === 'Back to clips');
      const rect = editor?.getBoundingClientRect();
      const headerRect = header?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        editor: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
        header: headerRect ? { top: headerRect.top, bottom: headerRect.bottom } : null,
        backNoDrag: back ? getComputedStyle(back).webkitAppRegion === 'no-drag' : false,
        trimHandles: [...document.querySelectorAll('[role="slider"]')].map((slider) => ({
          label: slider.getAttribute('aria-label'), value: slider.getAttribute('aria-valuenow'),
        })),
      };
    })()`);
    if (metrics.document.scrollWidth !== metrics.document.clientWidth) throw new Error(`Horizontal overflow at ${viewport.width}x${viewport.height}.`);
    if (metrics.editor?.left !== 68 || metrics.editor?.top !== 38 || metrics.editor.right !== metrics.viewport.width || metrics.editor.bottom !== metrics.viewport.height) {
      throw new Error(`Editor does not respect native chrome at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics.editor)}`);
    }
    if (metrics.header?.top !== 38 || !metrics.backNoDrag) throw new Error('Editor controls overlap or participate in the native drag region.');
    if (metrics.trimHandles.map((item) => item.label).join(',') !== 'Trim start,Trim end') throw new Error('Both accessible trim handles were not rendered.');

    await clickButton(window, 'Share');
    await waitForSelector(window, '[aria-label="Create share file"]');
    await delay(180);
    const presets = await evaluate(window, `[...document.querySelectorAll('input[name="share-preset"]')].map((input) => input.value)`);
    if (presets.join(',') !== '10mb,25mb,50mb,original') throw new Error(`Share presets were incomplete: ${presets.join(',')}`);

    const image = await window.webContents.capturePage();
    const path = join(outputDirectory, `${viewport.width}x${viewport.height}-clip-editor-share.png`);
    await writeFile(path, image.toPNG());
    results.push({ viewport, metrics, presets, screenshot: path });

    await window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
    await window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ESC' });
    await clickButton(window, 'Back to clips');
    await waitForMissingSelector(window, '[data-testid="clip-editor"]');
    await delay(80);
    const restored = await evaluate(window, `document.activeElement?.hasAttribute('data-clip-id') ?? false`);
    if (!restored) throw new Error('Back to clips did not restore focus to the originating clip.');
  }

  await openEditor(window);
  const originalEnd = Number(await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.getAttribute('aria-valuenow')`));
  await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'LEFT' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'LEFT' });
  await delay(80);
  const adjustedEnd = Number(await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.getAttribute('aria-valuenow')`));
  if (!(adjustedEnd < originalEnd)) throw new Error('Keyboard trimming did not move the end handle.');
  await clickButton(window, 'Save trim');
  await waitForButton(window, 'Saved');
  await clickButton(window, 'Back to clips');
  await waitForMissingSelector(window, '[data-testid="clip-editor"]');
  await openEditor(window);
  const reopenedEnd = Number(await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.getAttribute('aria-valuenow')`));
  if (reopenedEnd !== adjustedEnd) throw new Error(`Saved trim was not restored: ${adjustedEnd} -> ${reopenedEnd}.`);

  const exportClip = await evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips[0])`);
  exportDestination = join(outputDirectory, 'compressed-trim-10mb.mp4');
  const exported = await evaluate(window, `window.switchboard.exportClip(${JSON.stringify({
    id: exportClip.id,
    startMs: 2_000,
    endMs: 7_000,
    preset: '10mb',
  })})`);
  if (!exported) throw new Error('Compressed trim export was canceled unexpectedly.');
  const exportedFile = await stat(exportDestination);
  if (exportedFile.size > 10 * 1_024 * 1_024) throw new Error(`10 MB export exceeded its target: ${exportedFile.size} bytes.`);
  const { stdout: probeOutput } = await promisify(execFile)('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', exportDestination,
  ], { windowsHide: true });
  const exportedDuration = Number(JSON.parse(probeOutput).format?.duration ?? 0);
  if (exportedDuration < 4.8 || exportedDuration > 5.2) throw new Error(`Trimmed export duration was ${exportedDuration}s instead of 5s.`);
  const exportEvidence = { sizeBytes: exportedFile.size, targetBytes: 10 * 1_024 * 1_024, durationSeconds: exportedDuration };
  await rm(exportDestination, { force: true });

  process.stdout.write(`${JSON.stringify({ outputDirectory, results, persistence: { originalEnd, adjustedEnd, reopenedEnd }, exportEvidence }, null, 2)}\n`);
  app.quit();
}

async function openEditor(window) {
  if (await evaluate(window, `Boolean(document.querySelector('[data-testid="clip-editor"]'))`)) return;
  await evaluate(window, `location.hash = 'capture'`);
  try {
    await waitForSelector(window, '[data-clip-id]');
  } catch (error) {
    const diagnostics = await evaluate(window, `({ hash: location.hash, body: document.body.innerText.slice(0, 800), clips: null })`);
    diagnostics.clips = await evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips.length)`);
    throw new Error(`${error.message} ${JSON.stringify(diagnostics)}`);
  }
  await evaluate(window, `document.querySelector('[data-clip-id]')?.click()`);
  await waitForSelector(window, '[data-testid="clip-editor"]');
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await evaluate(window, `(document.querySelector('video')?.readyState ?? 0) >= 1`)) break;
    await delay(50);
  }
}

async function clickButton(window, label) {
  const clicked = await evaluate(window, `(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)} && !candidate.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not click ${label}.`);
}

async function waitForButton(window, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await evaluate(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === ${JSON.stringify(label)})`)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for button ${label}.`);
}

async function waitForSelector(window, selector) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await evaluate(window, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${selector}.`);
}

async function waitForMissingSelector(window, selector) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!await evaluate(window, `Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${selector} to close.`);
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
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad, reject) => {
    const timeout = setTimeout(() => reject(new Error('Switchboard renderer did not load.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForViewport(window, viewport) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const size = await evaluate(window, `({ width: innerWidth, height: innerHeight })`);
    if (size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2) return;
    await delay(40);
  }
  throw new Error(`Window did not reach ${viewport.width}x${viewport.height}.`);
}

function evaluate(window, expression) {
  return window.webContents.executeJavaScript(expression, true);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
