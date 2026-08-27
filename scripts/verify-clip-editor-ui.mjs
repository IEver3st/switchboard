import { execFile } from 'node:child_process';
import { app, BrowserWindow, dialog, shell } from 'electron';
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
copiedState.audio.enabled = false;
copiedState.capture.config.enabled = false;
await writeFile(join(isolatedUserData, 'switchboard-state.json'), JSON.stringify(copiedState, null, 2));

app.setName('switchboard-clip-editor-qa');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';

let exportDestination = null;
let holdNextSaveDialog = false;
let pendingSaveDialogResolve = null;
const saveDialogCalls = [];
const revealCalls = [];
shell.showItemInFolder = (path) => { revealCalls.push(path); };
dialog.showSaveDialog = async (options) => {
  saveDialogCalls.push(options);
  if (holdNextSaveDialog) {
    holdNextSaveDialog = false;
    return new Promise((resolveDialog) => { pendingSaveDialogResolve = resolveDialog; });
  }
  return exportDestination
    ? { canceled: false, filePath: exportDestination }
    : { canceled: true, filePath: undefined };
};

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
        timelineSliders: [...editor.querySelectorAll('[role="slider"]')].map((slider) => ({
          label: slider.getAttribute('aria-label'), value: slider.getAttribute('aria-valuenow'),
        })),
        interaction: editor.querySelector('.clip-editor-timeline')?.getAttribute('data-interaction'),
      };
    })()`);
    if (metrics.document.scrollWidth !== metrics.document.clientWidth) throw new Error(`Horizontal overflow at ${viewport.width}x${viewport.height}.`);
    if (metrics.editor?.left !== 68 || metrics.editor?.top !== 38 || metrics.editor.right !== metrics.viewport.width || metrics.editor.bottom !== metrics.viewport.height) {
      throw new Error(`Editor does not respect native chrome at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics.editor)}`);
    }
    if (metrics.header?.top !== 38 || !metrics.backNoDrag) throw new Error('Editor controls overlap or participate in the native drag region.');
    if (metrics.timelineSliders.map((item) => item.label).join(',') !== 'Playback volume,Playhead,Trim start,Trim end') throw new Error('The accessible volume, playhead, and both trim handles were not rendered.');
    if (metrics.interaction !== 'idle') throw new Error(`Timeline did not begin idle: ${metrics.interaction}`);

    const editorImage = await window.webContents.capturePage();
    const editorPath = join(outputDirectory, `${viewport.width}x${viewport.height}-clip-editor.png`);
    await writeFile(editorPath, editorImage.toPNG());

    await clickButton(window, 'Share');
    await waitForSelector(window, '[data-share-clip-dialog][role="dialog"]');
    await delay(180);
    const dialogMetrics = await evaluate(window, `(() => {
      const content = document.querySelector('[data-share-clip-dialog][role="dialog"]');
      const overlay = document.querySelector('[data-dialog-overlay][data-state="open"]');
      const rect = content?.getBoundingClientRect();
      const overlayStyle = overlay ? getComputedStyle(overlay) : null;
      return {
        role: content?.getAttribute('role'),
        ariaModal: content?.getAttribute('aria-modal'),
        title: content ? document.getElementById(content.getAttribute('aria-labelledby'))?.textContent?.trim() : null,
        rect: rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
        centerDelta: rect ? {
          x: Math.abs(rect.left + rect.width / 2 - innerWidth / 2),
          y: Math.abs(rect.top + rect.height / 2 - innerHeight / 2),
        } : null,
        overlay: overlayStyle ? {
          inset: [overlayStyle.top, overlayStyle.right, overlayStyle.bottom, overlayStyle.left],
          backgroundColor: overlayStyle.backgroundColor,
          backdropFilter: overlayStyle.backdropFilter,
        } : null,
        focusInside: content?.contains(document.activeElement) ?? false,
      };
    })()`);
    if (dialogMetrics.role !== 'dialog' || dialogMetrics.ariaModal !== 'true') throw new Error(`Share surface is not modal: ${JSON.stringify(dialogMetrics)}`);
    if (dialogMetrics.title !== 'Create share file') throw new Error(`Share dialog title is missing: ${JSON.stringify(dialogMetrics)}`);
    if (!dialogMetrics.rect || dialogMetrics.rect.width > 440.5 || dialogMetrics.centerDelta.x > 1 || dialogMetrics.centerDelta.y > 1) {
      throw new Error(`Share dialog is not centered at ${viewport.width}x${viewport.height}: ${JSON.stringify(dialogMetrics)}`);
    }
    if (!dialogMetrics.overlay || !dialogMetrics.overlay.backdropFilter.includes('blur') || !dialogMetrics.overlay.backgroundColor.includes('0.5')) {
      throw new Error(`Share backdrop is incomplete: ${JSON.stringify(dialogMetrics.overlay)}`);
    }
    if (!dialogMetrics.focusInside) throw new Error('Initial dialog focus escaped the modal.');

    const presets = await evaluate(window, `[...document.querySelectorAll('[data-share-clip-dialog] [role="radio"]')].map((item) => item.getAttribute('value'))`);
    if (presets.join(',') !== '10mb,25mb,50mb,original') throw new Error(`Share presets were incomplete: ${presets.join(',')}`);
    if (viewport.width === 1080) {
      await evaluate(window, `document.querySelector('[data-share-clip-dialog] [role="radio"][data-state="checked"]')?.focus()`);
      await evaluate(window, `(() => {
        window.__shareDialogKey = null;
        document.activeElement?.addEventListener('keydown', (event) => { window.__shareDialogKey = { key: event.key, code: event.code }; }, { once: true });
      })()`);
      await pressKey(window, 'Down');
      const keyEvidence = await evaluate(window, `window.__shareDialogKey`);
      if (keyEvidence?.key !== 'ArrowDown') throw new Error(`Native ArrowDown was not delivered correctly: ${JSON.stringify(keyEvidence)}`);
      await evaluate(window, `document.querySelector('label[for="share-preset-25mb"]')?.click()`);
      await waitForSelector(window, '[data-share-clip-dialog] [role="radio"][value="25mb"][data-state="checked"]');
      const expectedOutput = await evaluate(window, `document.querySelector('[data-share-clip-dialog] footer')?.textContent?.replace(/\\s+/g, ' ').trim()`);
      if (!expectedOutput.includes('Expected output') || !expectedOutput.includes('Up to 25 MB')) throw new Error(`Keyboard radio selection did not update output: ${expectedOutput}`);
      await evaluate(window, `document.querySelector('label[for="share-preset-50mb"]')?.click()`);
      await waitForSelector(window, '[data-share-clip-dialog] [role="radio"][value="50mb"][data-state="checked"]');
      await evaluate(window, `document.querySelector('[data-share-clip-dialog] button')?.focus()`);
      for (let index = 0; index < 7; index += 1) {
        await pressKey(window, 'TAB');
        const trapped = await evaluate(window, `document.querySelector('[data-share-clip-dialog]')?.contains(document.activeElement) ?? false`);
        if (!trapped) throw new Error(`Dialog focus escaped after ${index + 1} Tab presses.`);
      }
    }

    const image = await window.webContents.capturePage();
    const path = join(outputDirectory, `${viewport.width}x${viewport.height}-clip-editor-share.png`);
    await writeFile(path, image.toPNG());
    results.push({ viewport, metrics, dialogMetrics, presets, editorScreenshot: editorPath, shareScreenshot: path });

    await pressKey(window, 'ESC');
    await waitForMissingSelector(window, '[data-share-clip-dialog]');
    const escapeState = await evaluate(window, `({ editorOpen: Boolean(document.querySelector('[data-testid="clip-editor"]')), focus: document.activeElement?.textContent?.trim() })`);
    if (!escapeState.editorOpen || escapeState.focus !== 'Share') throw new Error(`Escape did not close only the dialog and restore focus: ${JSON.stringify(escapeState)}`);
    await clickButton(window, 'Back to clips');
    await waitForMissingSelector(window, '[data-testid="clip-editor"]');
    await waitForCondition(() => evaluate(window, `document.activeElement?.hasAttribute('data-clip-id') ?? false`), 'clip focus restoration');
  }

  window.setContentSize(1420, 900, false);
  await waitForViewport(window, { width: 1420, height: 900 });
  const workspaceEvidence = await verifyEditorWorkspace(window);

  await openEditor(window);
  await clickButton(window, 'Share');
  await evaluate(window, `document.querySelector('label[for="share-preset-25mb"]')?.click()`);
  await waitForSelector(window, '[data-share-clip-dialog] [role="radio"][value="25mb"][data-state="checked"]');
  const saveDialogCallCount = saveDialogCalls.length;
  holdNextSaveDialog = true;
  await clickButton(window, 'Choose destination');
  await waitForCondition(() => saveDialogCalls.length > saveDialogCallCount && pendingSaveDialogResolve !== null, 'destination chooser');
  const pendingState = await evaluate(window, `(() => {
    const radios = [...document.querySelectorAll('[data-share-clip-dialog] [role="radio"]')];
    const button = [...document.querySelectorAll('[data-share-clip-dialog] button')].find((candidate) => candidate.textContent?.trim() === 'Compressing…');
    return {
      radiosDisabled: radios.length === 4 && radios.every((radio) => radio.matches(':disabled')),
      rowsDisabled: [...document.querySelectorAll('[data-share-clip-dialog] label[data-disabled]')].length,
      buttonDisabled: button?.matches(':disabled') ?? false,
    };
  })()`);
  if (!pendingState.radiosDisabled || pendingState.rowsDisabled !== 4 || !pendingState.buttonDisabled) {
    throw new Error(`Pending export state was not disabled: ${JSON.stringify(pendingState)}`);
  }
  pendingSaveDialogResolve({ canceled: true, filePath: undefined });
  pendingSaveDialogResolve = null;
  await waitForButton(window, 'Choose destination');
  await waitForSelector(window, '[data-share-clip-dialog][role="dialog"]');
  const destinationCall = saveDialogCalls.at(-1);
  if (destinationCall?.title !== 'Create share file' || !destinationCall.defaultPath?.endsWith('-25mb.mp4')) {
    throw new Error(`Destination action did not preserve the selected share preset: ${JSON.stringify(destinationCall)}`);
  }
  await pressKey(window, 'ESC');
  await waitForMissingSelector(window, '[data-share-clip-dialog]');

  const interactionEvidence = await verifyTimelineInteractions(window);
  await clickButtonByLabel(window, 'Reset trim');
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

  process.stdout.write(`${JSON.stringify({ outputDirectory, results, workspaceEvidence, interactionEvidence, destinationAction: { title: destinationCall.title, defaultPath: destinationCall.defaultPath, pendingState, canceledDialogStayedOpen: true }, persistence: { originalEnd, adjustedEnd, reopenedEnd }, exportEvidence }, null, 2)}\n`);
  app.quit();
}

async function verifyEditorWorkspace(window) {
  await openEditor(window);
  if (await evaluate(window, `document.querySelector('.clip-editor-layout')?.dataset.inspector !== 'open'`)) {
    await clickButtonByLabel(window, 'Open Inspector');
  }
  await waitForSelector(window, '.clip-editor-layout[data-inspector="open"]');
  const expanded = await editorGeometry(window);

  await clickButtonByLabel(window, 'Collapse Inspector');
  await waitForSelector(window, '.clip-editor-layout[data-inspector="closed"]');
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.settings.clipEditorInspectorOpen === false)`), 'collapsed Inspector persistence');
  await delay(280);
  const collapsed = await editorGeometry(window);
  if (collapsed.viewerWidth <= expanded.viewerWidth + 180 || collapsed.timelineWidth <= expanded.timelineWidth + 180) {
    throw new Error(`Collapsing the Inspector did not reclaim workspace width: ${JSON.stringify({ expanded, collapsed })}`);
  }

  await clickButton(window, 'Back to clips');
  await waitForMissingSelector(window, '[data-testid="clip-editor"]');
  await openEditor(window);
  if (!await evaluate(window, `document.querySelector('.clip-editor-layout')?.dataset.inspector === 'closed'`)) {
    throw new Error('Collapsed Inspector state did not survive an editor round trip.');
  }
  await clickButtonByLabel(window, 'Open Inspector');
  await waitForSelector(window, '.clip-editor-layout[data-inspector="open"]');
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.settings.clipEditorInspectorOpen === true)`), 'restored Inspector persistence');
  await delay(280);

  await evaluate(window, `document.addEventListener('click', (event) => { window.__fullscreenClick = { x: event.clientX, y: event.clientY, tag: event.target?.tagName, label: event.target?.closest?.('button')?.getAttribute('aria-label') }; }, { capture: true, once: true })`);
  const fullscreenButtonRect = await nativeClickButtonByLabel(window, 'Enter fullscreen');
  await delay(100);
  console.log(`Fullscreen click: ${JSON.stringify({ button: fullscreenButtonRect, event: await evaluate(window, 'window.__fullscreenClick'), active: await evaluate(window, 'Boolean(document.fullscreenElement)') })}`);
  await waitForCondition(() => evaluate(window, `document.fullscreenElement?.classList.contains('clip-editor-preview') ?? false`), 'viewer fullscreen entry');
  const fullscreen = await evaluate(window, `(() => {
    const viewer = document.fullscreenElement;
    const rect = viewer?.getBoundingClientRect();
    return { active: Boolean(viewer), rect: rect ? { width: rect.width, height: rect.height } : null, viewport: { width: innerWidth, height: innerHeight } };
  })()`);
  if (!fullscreen.active || Math.abs(fullscreen.rect.width - fullscreen.viewport.width) > 1 || Math.abs(fullscreen.rect.height - fullscreen.viewport.height) > 1) {
    throw new Error(`Viewer fullscreen did not occupy the display: ${JSON.stringify(fullscreen)}`);
  }
  await pressKey(window, 'ESC');
  await waitForCondition(() => evaluate(window, `document.fullscreenElement === null`), 'viewer fullscreen exit');
  if (!await evaluate(window, `Boolean(document.querySelector('[data-testid="clip-editor"]'))`)) throw new Error('Escape closed the editor while exiting fullscreen.');

  const playbackStart = Number(await evaluate(window, `document.querySelector('video')?.currentTime ?? 0`));
  await clickButtonByLabel(window, 'Play selection');
  await waitForCondition(() => evaluate(window, `document.querySelector('video')?.paused === false`), 'clip playback start');
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.currentTime ?? 0) > ${playbackStart + 0.08}`), 'clip playback progress');
  await clickButtonByLabel(window, 'Pause');
  await waitForCondition(() => evaluate(window, `document.querySelector('video')?.paused === true`), 'clip playback pause');

  await evaluate(window, `document.querySelector('[aria-label="Playback volume"]')?.focus()`);
  const volumeBefore = Number(await evaluate(window, `document.querySelector('video')?.volume ?? 0`));
  await pressKey(window, 'LEFT');
  const volumeAfter = Number(await evaluate(window, `document.querySelector('video')?.volume ?? 0`));
  if (!(volumeAfter < volumeBefore)) throw new Error(`Playback volume did not respond to the keyboard: ${volumeBefore} -> ${volumeAfter}.`);
  await clickButtonByLabel(window, 'Mute');
  if (!await evaluate(window, `document.querySelector('video')?.muted === true`)) throw new Error('Mute did not update the video element.');
  await clickButtonByLabel(window, 'Unmute');

  const clipBefore = await evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips[0])`);
  await clickButtonByLabel(window, clipBefore.favorite ? 'Remove from favorites' : 'Add to favorites');
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips[0].favorite === ${!clipBefore.favorite})`), 'favorite update');

  const revealCount = revealCalls.length;
  await clickButton(window, 'Show in folder');
  await waitForCondition(() => revealCalls.length === revealCount + 1, 'show in folder action');

  await evaluate(window, `document.querySelector('.clip-editor-header__rename')?.click()`);
  await waitForSelector(window, '[role="dialog"] input');
  const renamed = `QA clip ${Date.now()}`;
  await evaluate(window, `(() => {
    const input = document.querySelector('[role="dialog"] input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(renamed)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await clickButton(window, 'Rename');
  await waitForCondition(() => evaluate(window, `document.querySelector('.clip-editor-header__rename span')?.textContent === ${JSON.stringify(renamed)}`), 'clip rename');

  const permanentDelete = await evaluate(window, `[...document.querySelectorAll('.clip-editor-shell > .clip-editor-header button')].some((button) => button.textContent?.trim() === 'Delete clip')`);
  if (permanentDelete) throw new Error('Delete clip remained permanently exposed in the editor toolbar.');
  await clickButtonByLabel(window, 'More clip actions');
  await waitForSelector(window, '[role="menu"]');
  const menuItems = await evaluate(window, `[...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim())`);
  if (menuItems.join(',') !== 'Rename clip,Show in folder,Delete clip') throw new Error(`Overflow actions are incomplete: ${menuItems.join(',')}`);
  await evaluate(window, `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === 'Delete clip')?.click()`);
  await waitForSelector(window, '[role="alertdialog"]');
  await pressKey(window, 'ESC');
  await waitForMissingSelector(window, '[role="alertdialog"]');

  return { expanded, collapsed, fullscreen, playbackAdvanced: true, volume: { before: volumeBefore, after: volumeAfter }, favorite: { before: clipBefore.favorite, after: !clipBefore.favorite }, revealCount: revealCalls.length, renamed, menuItems };
}

async function editorGeometry(window) {
  return evaluate(window, `(() => {
    const viewer = document.querySelector('.clip-editor-preview')?.getBoundingClientRect();
    const timeline = document.querySelector('[data-testid="clip-timeline-surface"]')?.getBoundingClientRect();
    return { viewerWidth: viewer?.width ?? 0, timelineWidth: timeline?.width ?? 0 };
  })()`);
}

async function verifyTimelineInteractions(window) {
  const initial = await timelineState(window);
  const surface = await evaluate(window, `(() => { const rect = document.querySelector('[data-testid="clip-timeline-surface"]')?.getBoundingClientRect(); return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null; })()`);
  if (!surface) throw new Error('Timeline surface was not rendered.');
  const trackY = Math.round(surface.y + surface.height * 0.62);
  const clickX = Math.round(surface.x + surface.width * 0.25);
  const hitEvidence = await evaluate(window, `(() => {
    window.__timelinePointerEvents = [];
    document.addEventListener('pointerdown', (event) => window.__timelinePointerEvents.push({ type: event.type, x: event.clientX, y: event.clientY, button: event.button, buttons: event.buttons, isPrimary: event.isPrimary, pointerId: event.pointerId, target: event.target?.className }), { capture: true, once: true });
    const target = document.elementFromPoint(${clickX}, ${trackY});
    return { target: target?.className, label: target?.getAttribute?.('aria-label'), rect: target ? { x: target.getBoundingClientRect().x, y: target.getBoundingClientRect().y, width: target.getBoundingClientRect().width, height: target.getBoundingClientRect().height } : null };
  })()`);

  await pointerDrag(window, clickX, trackY, clickX, trackY);
  const clicked = await timelineState(window);
  clicked.hitEvidence = hitEvidence;
  clicked.pointerEvents = await evaluate(window, `window.__timelinePointerEvents`);
  if (clicked.currentMs === 0) throw new Error(`Native click did not reach the timeline: ${JSON.stringify(clicked)}`);
  assertNear(clicked.currentMs, clicked.durationMs * 0.25, 180, 'Click-to-seek');
  try {
    await waitForCondition(async () => {
      const state = await timelineState(window);
      return Math.abs(state.videoMs - clicked.currentMs) <= 180;
    }, 'click-to-seek preview update', 5_000);
  } catch (error) {
    throw new Error(`${error.message} ${JSON.stringify(await timelineState(window))}`);
  }
  clicked.videoMs = (await timelineState(window)).videoMs;
  assertNear(clicked.videoMs, clicked.currentMs, 180, 'Click-to-seek preview');
  assertTrimUnchanged(initial, clicked, 'Click-to-seek');

  await pointerDrag(window, surface.x + surface.width * 0.32, trackY, surface.x + surface.width * 0.68, trackY);
  const scrubbed = await timelineState(window);
  assertNear(scrubbed.currentMs, scrubbed.durationMs * 0.68, 200, 'Drag-to-scrub');
  await waitForCondition(async () => {
    const state = await timelineState(window);
    return Math.abs(state.videoMs - scrubbed.currentMs) <= 180;
  }, 'drag-to-scrub preview update', 5_000);
  scrubbed.videoMs = (await timelineState(window)).videoMs;
  assertNear(scrubbed.videoMs, scrubbed.currentMs, 180, 'Drag-to-scrub preview');
  assertTrimUnchanged(initial, scrubbed, 'Drag-to-scrub');
  if (scrubbed.interaction !== 'idle') throw new Error(`Scrubbing did not return to idle: ${scrubbed.interaction}`);

  const startRect = await sliderRect(window, 'Trim start');
  await pointerDrag(window, startRect.x + startRect.width / 2, startRect.y + startRect.height / 2, surface.x + surface.width * 0.18, trackY);
  const startTrimmed = await timelineState(window);
  if (!(startTrimmed.startMs > initial.startMs)) throw new Error(`Left trim handle did not advance: ${initial.startMs} -> ${startTrimmed.startMs}`);
  assertNear(startTrimmed.currentMs, scrubbed.currentMs, 80, 'Left trim handle unexpectedly sought');

  const endRect = await sliderRect(window, 'Trim end');
  await pointerDrag(window, endRect.x + endRect.width / 2, endRect.y + endRect.height / 2, surface.x + surface.width * 0.82, trackY);
  const endTrimmed = await timelineState(window);
  if (!(endTrimmed.endMs < initial.endMs)) throw new Error(`Right trim handle did not retreat: ${initial.endMs} -> ${endTrimmed.endMs}`);
  assertNear(endTrimmed.currentMs, startTrimmed.currentMs, 80, 'Right trim handle unexpectedly sought');
  const trimmedScreenshot = join(outputDirectory, '1920x1080-clip-editor-trimmed.png');
  await writeFile(trimmedScreenshot, (await window.webContents.capturePage()).toPNG());

  const crossedStartRect = await sliderRect(window, 'Trim start');
  await pointerDrag(window, crossedStartRect.x + crossedStartRect.width / 2, crossedStartRect.y + crossedStartRect.height / 2, surface.x + surface.width, trackY);
  const bounded = await timelineState(window);
  if (bounded.endMs - bounded.startMs < 100) throw new Error(`Trim handles crossed: ${bounded.startMs} -> ${bounded.endMs}`);
  if (bounded.interaction !== 'idle') throw new Error(`Trim drag did not return to idle: ${bounded.interaction}`);

  await evaluate(window, `document.querySelector('[aria-label="Playhead"]')?.focus()`);
  await pressKey(window, 'LEFT');
  const keyboard = await timelineState(window);
  if (!(keyboard.currentMs < bounded.currentMs)) throw new Error('Playhead keyboard control did not move by one frame.');
  assertTrimUnchanged(bounded, keyboard, 'Playhead keyboard control');

  return { initial, clicked, scrubbed, startTrimmed, endTrimmed, bounded, keyboard, trimmedScreenshot };
}

async function timelineState(window) {
  return evaluate(window, `(() => {
    const read = (label) => Number(document.querySelector('[aria-label="' + label + '"]')?.getAttribute('aria-valuenow'));
    const playhead = document.querySelector('[aria-label="Playhead"]');
    const video = document.querySelector('video');
    return {
      currentMs: read('Playhead'), startMs: read('Trim start'), endMs: read('Trim end'),
      durationMs: Number(playhead?.getAttribute('aria-valuemax')),
      videoMs: Math.round((video?.currentTime ?? 0) * 1000),
      readyState: video?.readyState, seeking: video?.seeking,
      seekable: video ? Array.from({ length: video.seekable.length }, (_, index) => [video.seekable.start(index), video.seekable.end(index)]) : [],
      mediaError: video?.error ? { code: video.error.code, message: video.error.message } : null,
      interaction: document.querySelector('.clip-editor-timeline')?.getAttribute('data-interaction'),
    };
  })()`);
}

async function sliderRect(window, label) {
  const rect = await evaluate(window, `(() => { const value = document.querySelector('[aria-label=${JSON.stringify(label)}]')?.getBoundingClientRect(); return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null; })()`);
  if (!rect) throw new Error(`${label} was not rendered.`);
  return rect;
}

async function pointerDrag(window, startX, startY, endX, endY) {
  await window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(startX), y: Math.round(startY) });
  await window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(startX), y: Math.round(startY), button: 'left', clickCount: 1 });
  await delay(30);
  await window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(endX), y: Math.round(endY), button: 'left' });
  await delay(30);
  await window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(endX), y: Math.round(endY), button: 'left', clickCount: 1 });
  await delay(250);
}

function assertTrimUnchanged(before, after, label) {
  if (before.startMs !== after.startMs || before.endMs !== after.endMs) throw new Error(`${label} changed trim: ${before.startMs}-${before.endMs} -> ${after.startMs}-${after.endMs}`);
}

function assertNear(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) throw new Error(`${label} expected ${expected} ± ${tolerance}, received ${actual}.`);
}

async function openEditor(window) {
  if (await evaluate(window, `Boolean(document.querySelector('[data-testid="clip-editor"]'))`)) return;
  await waitForSelector(window, 'nav button');
  await clickButton(window, 'Capture');
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

async function clickButtonByLabel(window, label) {
  const clicked = await evaluate(window, `(() => {
    const button = document.querySelector('button[aria-label=${JSON.stringify(label)}]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not click button labelled ${label}.`);
}

async function nativeClickButtonByLabel(window, label) {
  const rect = await evaluate(window, `(() => {
    const value = document.querySelector('button[aria-label=${JSON.stringify(label)}]')?.getBoundingClientRect();
    return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
  })()`);
  if (!rect) throw new Error(`Could not find button labelled ${label}.`);
  const x = Math.round(rect.x + rect.width / 2);
  const y = Math.round(rect.y + rect.height / 2);
  window.webContents.sendInputEvent({ type: 'mouseMove', x, y });
  await delay(220);
  window.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
  await delay(40);
  window.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  return { x, y };
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

async function waitForCondition(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function pressKey(window, keyCode) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  await delay(20);
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  await delay(60);
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
