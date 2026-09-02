import { execFile } from 'node:child_process';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-clip-editor-qa-'));
const outputDirectory = await mkdtemp(join(tmpdir(), 'switchboard-clip-editor-images-'));
const sourceState = process.env.APPDATA ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json') : null;
if (!sourceState) throw new Error('APPDATA is required for native clip editor verification.');
await copyFile(sourceState, join(isolatedUserData, 'switchboard-state.json'));

const copiedState = JSON.parse(await readFile(join(isolatedUserData, 'switchboard-state.json'), 'utf8'));
if (!copiedState.clips?.some((clip) => clip.path)) throw new Error('Native clip editor verification requires one indexed clip.');
const reviewClipIndex = await findReviewClipIndex(copiedState.clips);
if (reviewClipIndex < 0) throw new Error('Native clip editor verification requires one indexed clip at least 10 seconds long.');
copiedState.clips = [copiedState.clips[reviewClipIndex]];
const reviewDurationMs = copiedState.clips[0].durationMs;
copiedState.clips[0].autoCapture = {
  autoCaptured: true,
  providerId: 'native-review-events',
  gameId: 'native-review',
  events: [
    { id: 'native-review-kill', type: 'kill', timestampMs: Math.round(reviewDurationMs * 0.18), label: 'Kill' },
    { id: 'native-review-reaction', type: 'highlight', timestampMs: Math.round(reviewDurationMs * 0.54), label: 'Reaction', metadata: { code: 'voice-reaction' } },
    { id: 'native-review-clip', type: 'custom', timestampMs: reviewDurationMs, label: 'Clip saved' },
  ],
};
copiedState.audio.enabled = false;
copiedState.capture.config.enabled = false;
copiedState.capture.config.clipsDirectory = join(isolatedUserData, 'review-clips');
copiedState.settings.uiScalePercent = 100;
if (copiedState.capture.runtime.reactionClipping) {
  copiedState.capture.runtime.reactionClipping.analyzedFrames ??= 0;
  copiedState.capture.runtime.reactionClipping.analysisAverageMs ??= 0;
}
for (const module of copiedState.modules ?? []) {
  if (module.id?.startsWith('device.')) module.enabled = false;
}
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
const nativeDragCalls = [];
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
  window.webContents.startDrag = (options) => {
    nativeDragCalls.push({ file: options.file, iconEmpty: options.icon?.isEmpty?.() ?? true });
  };
  await waitForLoad(window);
  await waitForMissingSelector(window, '.startup-screen');
  if (process.argv.includes('--microphone-only')) {
    await openEditor(window);
    const microphonePreview = await verifyMicrophonePreviewLevel(window);
    process.stdout.write(`${JSON.stringify({ microphonePreview }, null, 2)}\n`);
    app.quit();
    return;
  }
  if (process.argv.includes('--performance-only')) {
    await openEditor(window);
    const playbackPerformance = await measureTimelinePlayback(window);
    process.stdout.write(`${JSON.stringify({ playbackPerformance }, null, 2)}\n`);
    app.quit();
    return;
  }
  if (process.argv.includes('--interactions-only')) {
    await openEditor(window);
    const interactionEvidence = await verifyTimelineInteractions(window);
    process.stdout.write(`${JSON.stringify({ interactionEvidence }, null, 2)}\n`);
    app.quit();
    return;
  }
  const results = [];
  const timelineOnly = process.argv.includes('--timeline-only');
  const allViewports = process.argv.includes('--all-viewports');

  const reviewViewports = timelineOnly && !allViewports
    ? [{ width: 1420, height: 900 }]
    : [
        { width: 1080, height: 720 },
        { width: 1420, height: 900 },
        { width: 1920, height: 1080 },
      ];
  for (const viewport of reviewViewports) {
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
      const titleRect = editor?.querySelector('.clip-editor-header__rename')?.getBoundingClientRect();
      const actionsRect = editor?.querySelector('.clip-editor-header__actions')?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        editor: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
        header: headerRect ? { top: headerRect.top, bottom: headerRect.bottom } : null,
        headerSections: {
          title: titleRect ? { left: titleRect.left, right: titleRect.right, width: titleRect.width } : null,
          actions: actionsRect ? { left: actionsRect.left, right: actionsRect.right, width: actionsRect.width } : null,
        },
        backNoDrag: back ? getComputedStyle(back).webkitAppRegion === 'no-drag' : false,
        metadataInHeader: editor.querySelector('.clip-editor-header > .clip-editor-metadata') !== null,
        workspaceTop: editor.querySelector('.clip-editor-layout')?.getBoundingClientRect().top ?? null,
        metadata: [...editor.querySelectorAll('.clip-editor-details > div')].map((item) => ({
          label: item.querySelector('dt')?.textContent?.trim(),
          value: item.querySelector('dd')?.textContent?.trim(),
        })),
        locationAction: editor.querySelector('.clip-editor-metadata__path')?.getAttribute('aria-label'),
        timelineSliders: [...editor.querySelectorAll('[role="slider"], input[type="range"]')].map((slider) => ({
          label: slider.getAttribute('aria-label'), value: slider.getAttribute('aria-valuenow'),
        })),
        audioTracks: [...editor.querySelectorAll('.clip-editor-timeline__audio-track')].map((track) => ({
          channel: track.getAttribute('data-channel'),
          height: track.getBoundingClientRect().height,
          backgroundColor: getComputedStyle(track).backgroundColor,
          waveformFill: track.querySelector('path') ? getComputedStyle(track.querySelector('path')).fill : null,
          waveformStroke: track.querySelector('path') ? getComputedStyle(track.querySelector('path')).stroke : null,
          waveformArea: track.querySelector('path')?.getAttribute('d')?.endsWith('Z') ?? false,
          waveform: track.querySelector('path')?.getAttribute('d')?.length ?? 0,
        })),
        clipTrack: (() => {
          const track = editor.querySelector('.clip-editor-timeline__clip-track');
          const bounds = track?.getBoundingClientRect();
          return bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } : null;
        })(),
        eventMarkers: [...editor.querySelectorAll('.clip-editor-event-marker')].map((marker) => {
          const glyph = marker.querySelector('span');
          const bounds = glyph?.getBoundingClientRect();
          const style = glyph ? getComputedStyle(glyph) : null;
          return {
            label: marker.getAttribute('aria-label'),
            type: marker.getAttribute('data-event-type'),
            bounds: bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } : null,
            backgroundColor: style?.backgroundColor,
            transform: style?.transform,
          };
        }),
        audioLevelLabels: [...editor.querySelectorAll('.clip-editor-track-control [role="slider"]')].map((slider) => slider.getAttribute('aria-label')),
        audioInspectorLabels: [...editor.querySelectorAll('.clip-editor-audio-tracks li')].map((item) => item.textContent?.trim()),
        waveformState: editor.querySelector('.clip-editor-timeline__desk')?.getAttribute('data-waveform-state'),
        interaction: editor.querySelector('.clip-editor-timeline')?.getAttribute('data-interaction'),
      };
    })()`);
    if (metrics.document.scrollWidth !== metrics.document.clientWidth) throw new Error(`Horizontal overflow at ${viewport.width}x${viewport.height}.`);
    if (metrics.editor?.left !== 68 || metrics.editor?.top !== 38 || metrics.editor.right !== metrics.viewport.width || metrics.editor.bottom !== metrics.viewport.height) {
      throw new Error(`Editor does not respect native chrome at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics.editor)}`);
    }
    if (metrics.header?.top !== 38 || !metrics.backNoDrag) throw new Error('Editor controls overlap or participate in the native drag region.');
    if (metrics.metadataInHeader || metrics.workspaceTop !== metrics.header?.bottom) throw new Error(`The compact editor header or workspace boundary is incorrect: ${JSON.stringify(metrics)}`);
    if (!metrics.headerSections.title || metrics.headerSections.title.width < 80 || metrics.headerSections.title.right > metrics.headerSections.actions?.left) {
      throw new Error(`Clip toolbar sections are clipped or overlapping: ${JSON.stringify(metrics.headerSections)}`);
    }
    if (metrics.metadata.map((item) => item.label).join(',') !== 'Game,Duration,Created,Video quality,Size,Location') throw new Error(`Clip inspector details are incomplete: ${JSON.stringify(metrics.metadata)}`);
    if (metrics.metadata.some((item) => !item.value) || !metrics.locationAction?.startsWith('Show ')) throw new Error(`Clip metadata values or location action are missing: ${JSON.stringify(metrics)}`);
    const timelineLabels = metrics.timelineSliders.map((item) => item.label);
    if (!['Playback volume', 'Playhead', 'Trim start', 'Trim end'].every((label) => timelineLabels.includes(label))) throw new Error('The accessible volume, playhead, and both trim handles were not rendered.');
    if (metrics.waveformState !== 'ready' || metrics.audioTracks.length < 2 || metrics.audioLevelLabels.length !== metrics.audioTracks.length) {
      throw new Error(`Separate audio tracks did not load: ${JSON.stringify({ waveformState: metrics.waveformState, audioTracks: metrics.audioTracks, audioLevelLabels: metrics.audioLevelLabels })}`);
    }
    if (metrics.audioInspectorLabels.join(',') !== 'Game,Microphone') {
      throw new Error(`Capture stream identities were not restored from embedded MP4 metadata: ${JSON.stringify(metrics.audioInspectorLabels)}`);
    }
    if (metrics.audioTracks.some((track) => track.height < 38 || track.height > 54 || track.waveform < 100)) {
      throw new Error(`Audio lanes are not correctly sized or waveform-backed: ${JSON.stringify(metrics.audioTracks)}`);
    }
    if (metrics.audioTracks.some((track) => track.waveformFill === 'none' || track.waveformStroke !== 'none' || !track.waveformArea)) {
      throw new Error(`Audio lanes lost their channel-aware filled waveform treatment: ${JSON.stringify(metrics.audioTracks)}`);
    }
    const eventLabels = metrics.eventMarkers.map((marker) => marker.label?.replace(/ at .*$/, ''));
    if (eventLabels.join(',') !== 'Kill,Reaction,Clip saved' || !metrics.clipTrack) {
      throw new Error(`The canonical event markers are incomplete: ${JSON.stringify(metrics.eventMarkers)}`);
    }
    if (metrics.eventMarkers.some((marker) => !marker.bounds
      || marker.bounds.left < metrics.clipTrack.left
      || marker.bounds.right > metrics.clipTrack.right
      || marker.bounds.top < metrics.clipTrack.top
      || marker.bounds.bottom > metrics.clipTrack.bottom
      || marker.backgroundColor !== 'rgb(76, 169, 232)'
      || marker.transform === 'none')) {
      throw new Error(`Event diamonds are not blue, diamond-shaped, and contained by the event lane: ${JSON.stringify({ clipTrack: metrics.clipTrack, eventMarkers: metrics.eventMarkers })}`);
    }
    if (metrics.interaction !== 'idle') throw new Error(`Timeline did not begin idle: ${metrics.interaction}`);

    const reactionMarkerLabel = metrics.eventMarkers.find((marker) => marker.label?.startsWith('Reaction at '))?.label;
    if (!reactionMarkerLabel) throw new Error('The Reaction event marker has no accessible seek action.');
    await clickButtonByLabel(window, reactionMarkerLabel);
    await waitForCondition(async () => {
      const state = await timelineState(window);
      return Math.abs(state.currentMs - state.durationMs * 0.54) <= 180;
    }, 'Reaction event marker seek');
    metrics.eventSeek = await timelineState(window);

    await evaluate(window, `document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
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
    if (dialogMetrics.title !== 'Share clip') throw new Error(`Share dialog title is missing: ${JSON.stringify(dialogMetrics)}`);
    if (!dialogMetrics.rect || dialogMetrics.rect.width > 520.5 || dialogMetrics.centerDelta.x > 1 || dialogMetrics.centerDelta.y > 1) {
      throw new Error(`Share dialog is not centered at ${viewport.width}x${viewport.height}: ${JSON.stringify(dialogMetrics)}`);
    }
    if (!dialogMetrics.overlay || dialogMetrics.overlay.backgroundColor === 'rgba(0, 0, 0, 0)') {
      throw new Error(`Share backdrop is incomplete: ${JSON.stringify(dialogMetrics.overlay)}`);
    }
    if (!dialogMetrics.focusInside) throw new Error('Initial dialog focus escaped the modal.');

    const presets = await evaluate(window, `[...document.querySelectorAll('[data-share-clip-dialog] [data-share-preset]')].map((item) => item.dataset.sharePreset)`);
    if (presets.join(',') !== 'original,10mb,25mb,50mb') throw new Error(`Share presets were incomplete: ${presets.join(',')}`);
    if (viewport.width === 1080) {
      await evaluate(window, `document.querySelector('[data-share-clip-dialog] [data-share-preset][data-state="on"]')?.focus()`);
      await evaluate(window, `(() => {
        window.__shareDialogKey = null;
        document.activeElement?.addEventListener('keydown', (event) => { window.__shareDialogKey = { key: event.key, code: event.code }; }, { once: true });
      })()`);
      await pressKey(window, 'Down');
      const keyEvidence = await evaluate(window, `window.__shareDialogKey`);
      if (keyEvidence?.key !== 'ArrowDown') throw new Error(`Native ArrowDown was not delivered correctly: ${JSON.stringify(keyEvidence)}`);
      await evaluate(window, `document.querySelector('[data-share-clip-dialog] [data-share-preset="25mb"]')?.click()`);
      await waitForSelector(window, '[data-share-clip-dialog] [data-share-preset="25mb"][data-state="on"]');
      const expectedOutput = await evaluate(window, `document.querySelector('[data-share-clip-dialog] footer')?.textContent?.replace(/\\s+/g, ' ').trim()`);
      if (!expectedOutput.includes('Expected output') || !expectedOutput.includes('Up to 25 MB')) throw new Error(`Keyboard radio selection did not update output: ${expectedOutput}`);
      await evaluate(window, `document.querySelector('[data-share-clip-dialog] [data-share-preset="50mb"]')?.click()`);
      await waitForSelector(window, '[data-share-clip-dialog] [data-share-preset="50mb"][data-state="on"]');
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
    await delay(120);
  }

  if (timelineOnly && allViewports) {
    process.stdout.write(`${JSON.stringify({ outputDirectory, results }, null, 2)}\n`);
    app.quit();
    return;
  }

  window.setContentSize(1420, 900, false);
  await waitForViewport(window, { width: 1420, height: 900 });
  const workspaceEvidence = await verifyEditorWorkspace(window);
  if (timelineOnly) {
    process.stdout.write(`${JSON.stringify({ outputDirectory, workspaceEvidence }, null, 2)}\n`);
    app.quit();
    return;
  }

  await openEditor(window);
  await clickButton(window, 'Share');
  await evaluate(window, `document.querySelector('[data-share-clip-dialog] [data-share-preset="25mb"]')?.click()`);
  await waitForSelector(window, '[data-share-clip-dialog] [data-share-preset="25mb"][data-state="on"]');
  const saveDialogCallCount = saveDialogCalls.length;
  await clickButton(window, 'Prepare clip');
  await waitForCondition(() => evaluate(window, `['preparing', 'ready'].includes(document.querySelector('[data-share-clip-dialog]')?.dataset.shareState)`), 'share preparation');
  const pendingState = await evaluate(window, `(() => {
    const presets = [...document.querySelectorAll('[data-share-clip-dialog] [data-share-preset]')];
    const state = document.querySelector('[data-share-clip-dialog]')?.dataset.shareState;
    return {
      state,
      presetsDisabled: state !== 'preparing' || (presets.length === 4 && presets.every((item) => item.matches(':disabled'))),
      preparingStatus: state !== 'preparing' || Boolean(document.querySelector('[data-share-clip-dialog] [data-share-progress][role="status"] [role="progressbar"]')),
    };
  })()`);
  if (!pendingState.presetsDisabled || !pendingState.preparingStatus) {
    throw new Error(`Pending export state was not disabled: ${JSON.stringify(pendingState)}`);
  }
  await waitForCondition(() => evaluate(window, `document.querySelector('[data-share-clip-dialog]')?.dataset.shareState === 'ready'`), 'prepared share ready', 120_000);
  if (saveDialogCalls.length !== saveDialogCallCount) throw new Error('Preparing a draggable clip opened a save dialog.');
  const readyState = await evaluate(window, `(() => {
    const source = document.querySelector('[data-share-clip-dialog] [draggable="true"]');
    return {
      draggable: Boolean(source),
      instruction: source?.textContent?.includes('Drag clip into Discord') ?? false,
      summary: document.querySelector('[data-share-clip-dialog] footer')?.textContent?.replace(/\\s+/g, ' ').trim(),
    };
  })()`);
  if (!readyState.draggable || !readyState.instruction || !readyState.summary?.includes('Ready to drag')) {
    throw new Error(`Prepared share surface is incomplete: ${JSON.stringify(readyState)}`);
  }
  const readyScreenshot = join(outputDirectory, '1420x900-clip-editor-share-ready.png');
  await writeFile(readyScreenshot, (await window.webContents.capturePage()).toPNG());
  await clickButton(window, 'Show in folder');
  await waitForCondition(() => revealCalls.length > 0, 'prepared share reveal');
  const preparedPath = revealCalls.at(-1);
  const preparedFile = await stat(preparedPath);
  if (preparedFile.size > 25 * 1_024 * 1_024) throw new Error(`Prepared share file exceeded its target: ${preparedFile.size} bytes.`);
  await evaluate(window, `document.querySelector('[data-share-clip-dialog] [draggable="true"]')?.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }))`);
  await waitForCondition(() => nativeDragCalls.length > 0, 'native prepared file drag');
  const nativeDrag = nativeDragCalls.at(-1);
  if (nativeDrag.file !== preparedPath || nativeDrag.iconEmpty) throw new Error(`Native drag did not carry the prepared file: ${JSON.stringify(nativeDrag)}`);
  await clickButton(window, 'Done');
  await waitForMissingSelector(window, '[data-share-clip-dialog]');

  const interactionEvidence = await verifyTimelineInteractions(window);
  await clickButtonByLabel(window, 'Reset timeline edits');
  const originalEnd = Number(await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.getAttribute('aria-valuenow')`));
  await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'LEFT' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'LEFT' });
  await delay(80);
  const adjustedEnd = Number(await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.getAttribute('aria-valuenow')`));
  if (!(adjustedEnd < originalEnd)) throw new Error('Keyboard trimming did not move the end handle.');
  const trackStartBefore = Number(await evaluate(window, `document.querySelector('[data-testid="clip-track-0-trim-start"]')?.getAttribute('aria-valuenow')`));
  const secondTrackStartBefore = Number(await evaluate(window, `document.querySelector('[data-testid="clip-track-1-trim-start"]')?.getAttribute('aria-valuenow')`));
  const independentSurface = await evaluate(window, `(() => { const rect = document.querySelector('[data-testid="clip-timeline-surface"]')?.getBoundingClientRect(); return rect ? { x: rect.x, width: rect.width } : null; })()`);
  if (!independentSurface) throw new Error('Timeline surface was not rendered for independent track trimming.');
  const trackStartRect = await sliderRect(window, 'Game trim start');
  await pointerDrag(
    window,
    trackStartRect.x + trackStartRect.width / 2,
    trackStartRect.y + trackStartRect.height / 2,
    independentSurface.x + independentSurface.width * 0.2,
    trackStartRect.y + trackStartRect.height / 2,
  );
  const trackStartAfter = Number(await evaluate(window, `document.querySelector('[data-testid="clip-track-0-trim-start"]')?.getAttribute('aria-valuenow')`));
  const secondTrackStartAfter = Number(await evaluate(window, `document.querySelector('[data-testid="clip-track-1-trim-start"]')?.getAttribute('aria-valuenow')`));
  const globalEndAfterTrackTrim = Number(await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.getAttribute('aria-valuenow')`));
  if (!(trackStartAfter > trackStartBefore) || secondTrackStartAfter !== secondTrackStartBefore || globalEndAfterTrackTrim !== adjustedEnd) {
    throw new Error(`Audio track trims were not independent: ${JSON.stringify({ trackStartBefore, trackStartAfter, secondTrackStartBefore, secondTrackStartAfter, adjustedEnd, globalEndAfterTrackTrim })}`);
  }
  const independentTrackTrimScreenshot = join(outputDirectory, '1420x900-clip-editor-independent-track-trim.png');
  await writeFile(independentTrackTrimScreenshot, (await window.webContents.capturePage()).toPNG());
  await clickButton(window, 'Save edits');
  await waitForButton(window, 'Saved');
  await clickButton(window, 'Back to clips');
  await waitForMissingSelector(window, '[data-testid="clip-editor"]');
  await openEditor(window);
  const reopenedEnd = Number(await evaluate(window, `document.querySelector('[aria-label="Trim end"]')?.getAttribute('aria-valuenow')`));
  if (reopenedEnd !== adjustedEnd) throw new Error(`Saved trim was not restored: ${adjustedEnd} -> ${reopenedEnd}.`);
  const reopenedTrackStart = Number(await evaluate(window, `document.querySelector('[data-testid="clip-track-0-trim-start"]')?.getAttribute('aria-valuenow')`));
  if (reopenedTrackStart !== trackStartAfter) throw new Error(`Saved audio track trim was not restored: ${trackStartAfter} -> ${reopenedTrackStart}.`);
  await waitForCondition(() => evaluate(window, `Number(document.querySelector('.clip-editor-track-control [role="slider"][aria-label^="Microphone "]')?.getAttribute('aria-valuenow')) === 37`), 'restored microphone track level');
  const reopenedAudioLevel = Number(await evaluate(window, `document.querySelector('.clip-editor-track-control [role="slider"][aria-label^="Microphone "]')?.getAttribute('aria-valuenow')`));
  if (reopenedAudioLevel !== 37) throw new Error(`Audio track level was not restored: 37 -> ${reopenedAudioLevel}.`);

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
  const { stdout: probeOutput } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', exportDestination,
  ], { windowsHide: true });
  const probe = JSON.parse(probeOutput);
  const exportedDuration = Number(probe.format?.duration ?? 0);
  const exportedVideo = probe.streams?.find((stream) => stream.codec_type === 'video');
  const exportedAudioStreams = probe.streams?.filter((stream) => stream.codec_type === 'audio') ?? [];
  if (exportedDuration < 4.8 || exportedDuration > 5.2) throw new Error(`Trimmed export duration was ${exportedDuration}s instead of 5s.`);
  if (!exportedVideo?.width || !exportedVideo?.height || Math.abs(exportedVideo.width / exportedVideo.height - 9 / 16) > 0.01) {
    throw new Error(`Vertical canvas export was not 9:16: ${JSON.stringify(exportedVideo)}`);
  }
  if (exportedAudioStreams.length !== 1) throw new Error(`Adjusted export produced ${exportedAudioStreams.length} audio streams instead of one mixed stream.`);
  const exportEvidence = { sizeBytes: exportedFile.size, targetBytes: 10 * 1_024 * 1_024, durationSeconds: exportedDuration, width: exportedVideo.width, height: exportedVideo.height, audioStreams: exportedAudioStreams.length };
  await rm(exportDestination, { force: true });

  process.stdout.write(`${JSON.stringify({ outputDirectory, results, workspaceEvidence, interactionEvidence, shareDrag: { pendingState, readyState, readyScreenshot, preparedPath, sizeBytes: preparedFile.size, nativeDrag }, persistence: { originalEnd, adjustedEnd, reopenedEnd, trackStartAfter, reopenedTrackStart, reopenedAudioLevel, independentTrackTrimScreenshot }, exportEvidence }, null, 2)}\n`);
  app.quit();
}

async function verifyEditorWorkspace(window) {
  await openEditor(window);
  if (await evaluate(window, `document.querySelector('.clip-editor-layout')?.dataset.inspector !== 'open'`)) {
    await clickButtonByLabel(window, 'Open Inspector');
  }
  await waitForSelector(window, '.clip-editor-layout[data-inspector="open"]');
  await delay(280);
  const expanded = await editorGeometry(window);
  if (expanded.inspectorScrollWidth > expanded.inspectorClientWidth + 1 || expanded.inspectorContentRight > expanded.inspectorRight + 1) {
    throw new Error(`The Inspector has horizontal overflow: ${JSON.stringify(expanded)}`);
  }

  await clickButtonByLabel(window, 'Collapse Inspector');
  await waitForSelector(window, '.clip-editor-layout[data-inspector="closed"]');
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.settings.clipEditorInspectorOpen === false)`), 'collapsed Inspector persistence');
  await delay(280);
  await waitForCondition(async () => (await editorGeometry(window)).viewerWidth > expanded.viewerWidth + 180, 'collapsed Inspector reflow');
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
  await waitForCondition(async () => (await editorGeometry(window)).viewerWidth < collapsed.viewerWidth - 180, 'restored Inspector reflow');

  await evaluate(window, `document.querySelector('label[for="clip-canvas-9-16"]')?.click()`);
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips[0].canvasSize === '9:16')`), 'vertical canvas persistence');
  await waitForSelector(window, '.clip-editor-preview[data-canvas-size="9:16"] .clip-editor-crop-guide');
  const cropGuide = await evaluate(window, `(() => {
    const rect = document.querySelector('.clip-editor-crop-guide')?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height, ratio: rect.width / rect.height } : null;
  })()`);
  if (!cropGuide || Math.abs(cropGuide.ratio - 9 / 16) > 0.01) throw new Error(`Vertical crop guide is not 9:16: ${JSON.stringify(cropGuide)}`);
  const verticalCanvasScreenshot = join(outputDirectory, '1420x900-clip-editor-9x16.png');
  await writeFile(verticalCanvasScreenshot, (await window.webContents.capturePage()).toPNG());

  await clickButton(window, 'Back to clips');
  await waitForMissingSelector(window, '[data-testid="clip-editor"]');
  await openEditor(window);
  await waitForSelector(window, '.clip-editor-preview[data-canvas-size="9:16"] .clip-editor-crop-guide');

  await clickButtonByLabel(window, 'Enter fullscreen');
  await waitForCondition(() => evaluate(window, `document.querySelector('.clip-editor-preview')?.dataset.fullscreen === 'true'`), 'viewer fullscreen entry');
  const fullscreen = await evaluate(window, `(() => {
    const viewer = document.querySelector('.clip-editor-preview[data-fullscreen="true"]');
    const rect = viewer?.getBoundingClientRect();
    return { active: Boolean(viewer), rect: rect ? { width: rect.width, height: rect.height } : null, viewport: { width: innerWidth, height: innerHeight } };
  })()`);
  if (!fullscreen.active || Math.abs(fullscreen.rect.width - fullscreen.viewport.width) > 1 || Math.abs(fullscreen.rect.height - fullscreen.viewport.height) > 1) {
    throw new Error(`Viewer fullscreen did not occupy the display: ${JSON.stringify(fullscreen)}`);
  }
  await pressKey(window, 'ESC');
  await waitForCondition(() => evaluate(window, `document.querySelector('.clip-editor-preview')?.dataset.fullscreen === 'false'`), 'viewer fullscreen exit');
  if (!await evaluate(window, `Boolean(document.querySelector('[data-testid="clip-editor"]'))`)) throw new Error('Escape closed the editor while exiting fullscreen.');

  await evaluate(window, `(() => {
    const video = document.querySelector('video');
    if (!video) throw new Error('Clip preview video is missing.');
    video.pause();
    video.currentTime = 0;
    video.dispatchEvent(new Event('seeked'));
  })()`);
  await delay(100);
  const playbackStart = Number(await evaluate(window, `document.querySelector('video')?.currentTime ?? 0`));
  await clickButtonByLabel(window, 'Play selection');
  await waitForCondition(() => evaluate(window, `document.querySelector('video')?.paused === false`), 'clip playback start');
  const smoothPlayback = await evaluate(window, `new Promise((resolve) => {
    const video = document.querySelector('video');
    const playhead = document.querySelector('.clip-editor-playhead');
    const samples = [];
    const startedAt = performance.now();
    const sample = (now) => {
      samples.push({
        elapsedMs: now - startedAt,
        playheadX: playhead?.getBoundingClientRect().x ?? null,
        videoMs: (video?.currentTime ?? 0) * 1000,
      });
      if (now - startedAt < 650 && video && !video.paused) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  })`);
  const movingSamples = smoothPlayback.filter((sample) => sample.videoMs > playbackStart * 1_000 + 30);
  const distinctPlayheadPositions = new Set(movingSamples.map((sample) => sample.playheadX?.toFixed(2))).size;
  if (movingSamples.length < 8 || distinctPlayheadPositions < Math.min(8, movingSamples.length)) {
    throw new Error(`Timeline playhead did not advance smoothly during playback: ${JSON.stringify({ movingSamples: movingSamples.length, distinctPlayheadPositions, samples: smoothPlayback })}`);
  }
  console.log(`Smooth playhead: ${distinctPlayheadPositions} positions across ${movingSamples.length} moving samples.`);
  await clickButtonByLabel(window, 'Pause');
  await waitForCondition(() => evaluate(window, `document.querySelector('video')?.paused === true`), 'clip playback pause');
  const pausedPlayheadX = Number(await evaluate(window, `document.querySelector('.clip-editor-playhead')?.getBoundingClientRect().x`));
  await delay(120);
  const settledPlayheadX = Number(await evaluate(window, `document.querySelector('.clip-editor-playhead')?.getBoundingClientRect().x`));
  if (Math.abs(settledPlayheadX - pausedPlayheadX) > 0.01) throw new Error(`Timeline playhead kept moving after pause: ${pausedPlayheadX} -> ${settledPlayheadX}.`);

  await evaluate(window, `document.activeElement instanceof HTMLElement && document.activeElement.blur()`);
  const keyboardStart = Number(await evaluate(window, `document.querySelector('video')?.currentTime ?? 0`));
  await pressKey(window, 'SPACE');
  await waitForCondition(() => evaluate(window, `document.querySelector('video')?.paused === false`), 'Space playback start');
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.currentTime ?? 0) > ${keyboardStart + 0.08}`), 'Space playback progress');
  await pressKey(window, 'SPACE');
  await waitForCondition(() => evaluate(window, `document.querySelector('video')?.paused === true`), 'Space playback pause');
  const shortcutStart = Number(await evaluate(window, `document.querySelector('video')?.currentTime ?? 0`));
  await pressKey(window, 'RIGHT');
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.currentTime ?? 0) > ${shortcutStart + 4.8}`), 'ArrowRight seek');
  await pressKey(window, 'LEFT');
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.currentTime ?? 0) < ${shortcutStart + 0.3}`), 'ArrowLeft seek');

  const transportStart = Number(await evaluate(window, `document.querySelector('video')?.currentTime ?? 0`));
  await clickButtonByLabel(window, 'Forward 5 seconds');
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.currentTime ?? 0) > ${transportStart + 4.8}`), 'transport forward seek');
  await clickButtonByLabel(window, 'Back 5 seconds');
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.currentTime ?? 0) < ${transportStart + 0.3}`), 'transport backward seek');
  const frameStart = Number(await evaluate(window, `document.querySelector('video')?.currentTime ?? 0`));
  await clickButtonByLabel(window, 'Next frame');
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.currentTime ?? 0) > ${frameStart}`), 'transport next frame');
  await clickButtonByLabel(window, 'Previous frame');
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.currentTime ?? 0) <= ${frameStart + 0.002}`), 'transport previous frame');

  const volumeBefore = Number(await evaluate(window, `document.querySelector('video')?.volume ?? 0`));
  await evaluate(window, `(() => {
    const input = document.querySelector('.clip-editor-volume__slider');
    if (!input) throw new Error('Playback volume input missing');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Playback volume setter missing');
    setter.call(input, '45');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitForCondition(() => evaluate(window, `(document.querySelector('video')?.volume ?? 0) < ${volumeBefore}`), 'playback volume adjustment');
  const volumeAfter = Number(await evaluate(window, `document.querySelector('video')?.volume ?? 0`));
  if (!(volumeAfter < volumeBefore)) throw new Error(`Playback volume did not respond to the keyboard: ${volumeBefore} -> ${volumeAfter}.`);
  const mutedBefore = Boolean(await evaluate(window, `document.querySelector('button[aria-label="Unmute"]')`));
  await clickButtonByLabel(window, mutedBefore ? 'Unmute' : 'Mute');
  await waitForCondition(() => evaluate(window, `Boolean(document.querySelector('button[aria-label="${mutedBefore ? 'Mute' : 'Unmute'}"]'))`), 'mute toggle');
  await clickButtonByLabel(window, mutedBefore ? 'Mute' : 'Unmute');

  const microphonePreviewVolumeBefore = Number(await evaluate(window, `(() => {
    const preview = document.querySelector('[data-clip-preview-track="microphone"]');
    if (!(preview instanceof HTMLAudioElement)) throw new Error('The microphone preview audio stream is missing.');
    return preview.volume;
  })()`));
  await evaluate(window, `document.querySelector('.clip-editor-track-control [role="slider"][aria-label^="Microphone "]')?.focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'HOME' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'HOME' });
  for (let step = 0; step < 37; step += 1) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'RIGHT' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'RIGHT' });
  }
  await delay(220);
  const audioLevel = await evaluate(window, `(() => {
    const slider = document.querySelector('.clip-editor-track-control [role="slider"][aria-label^="Microphone "]');
    slider?.blur();
    return { label: slider?.getAttribute('aria-label'), value: slider?.getAttribute('aria-valuenow') };
  })()`);
  const microphoneTrackIndex = Number(await evaluate(window, `document.querySelector('[data-clip-preview-track="microphone"]')?.getAttribute('data-track-index') ?? -1`));
  if (microphoneTrackIndex < 0) throw new Error('The microphone preview audio stream has no track index.');
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips[0].audioTrackLevels?.[${microphoneTrackIndex}] === 37)`), 'microphone track level persistence');
  await waitForCondition(() => evaluate(window, `(document.querySelector('[data-clip-preview-track="microphone"]')?.volume ?? 1) < ${microphonePreviewVolumeBefore}`), 'microphone preview volume adjustment');
  const microphonePreviewVolumeAfter = Number(await evaluate(window, `document.querySelector('[data-clip-preview-track="microphone"]')?.volume ?? -1`));
  if (!(microphonePreviewVolumeAfter < microphonePreviewVolumeBefore)) {
    throw new Error(`Microphone preview volume did not respond: ${microphonePreviewVolumeBefore} -> ${microphonePreviewVolumeAfter}.`);
  }

  const clipBefore = await evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips[0])`);
  await clickButtonByLabel(window, clipBefore.favorite ? 'Remove from favorites' : 'Add to favorites');
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips[0].favorite === ${!clipBefore.favorite})`), 'favorite update');

  const revealCount = revealCalls.length;
  await evaluate(window, `document.querySelector('.clip-editor-metadata__path')?.click()`);
  await waitForCondition(() => revealCalls.length === revealCount + 1, 'show in folder action');

  await evaluate(window, `document.querySelector('.clip-editor-header__rename')?.click()`);
  await waitForSelector(window, '[role="dialog"] input');
  const renameSuffix = ` QA ${Date.now()}`;
  await evaluate(window, `document.querySelector('[role="dialog"] input')?.focus()`);
  await window.webContents.insertText(renameSuffix);
  await delay(80);
  const renamedInput = String(await evaluate(window, `document.querySelector('[role="dialog"] input')?.value`));
  if (renamedInput === clipBefore.name) throw new Error('Rename input did not change.');
  await clickButton(window, 'Rename');
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips.find((clip) => clip.id === ${JSON.stringify(clipBefore.id)})?.name !== ${JSON.stringify(clipBefore.name)})`), 'canonical clip rename');
  const renamed = String(await evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips.find((clip) => clip.id === ${JSON.stringify(clipBefore.id)})?.name)`));
  await waitForCondition(() => evaluate(window, `document.querySelector('.clip-editor-header__rename span')?.textContent === ${JSON.stringify(renamed)}`), 'renamed editor title');

  const permanentDelete = await evaluate(window, `[...document.querySelectorAll('.clip-editor-shell > .clip-editor-header button')].some((button) => button.textContent?.trim() === 'Delete clip')`);
  if (permanentDelete) throw new Error('Delete clip remained permanently exposed in the editor toolbar.');
  await nativeClickButtonByLabel(window, 'More clip actions');
  await waitForSelector(window, '[role="menu"]');
  const menuItems = await evaluate(window, `[...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim())`);
  if (menuItems.join(',') !== 'Rename clip,Show in folder,Delete clip') throw new Error(`Overflow actions are incomplete: ${menuItems.join(',')}`);
  await evaluate(window, `[...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent?.trim() === 'Delete clip')?.click()`);
  await waitForSelector(window, '[role="alertdialog"]');
  await clickButton(window, 'Cancel');
  await waitForMissingSelector(window, '[role="alertdialog"]');

  return { expanded, collapsed, cropGuide, verticalCanvasScreenshot, fullscreen, playbackAdvanced: true, smoothPlayback: { movingSamples: movingSamples.length, distinctPlayheadPositions, pausedStable: true }, keyboardShortcuts: true, transportControls: true, volume: { before: volumeBefore, after: volumeAfter }, audioLevel, microphonePreviewVolume: { before: microphonePreviewVolumeBefore, after: microphonePreviewVolumeAfter }, favorite: { before: clipBefore.favorite, after: !clipBefore.favorite }, revealCount: revealCalls.length, renamed, menuItems };
}

async function verifyMicrophonePreviewLevel(window) {
  const initial = await evaluate(window, `(() => {
    const preview = document.querySelector('[data-clip-preview-track="microphone"]');
    return preview instanceof HTMLAudioElement ? { found: true, volume: preview.volume } : { found: false, volume: null };
  })()`);
  if (!initial.found) throw new Error('The microphone preview audio stream is missing.');
  const before = Number(initial.volume);
  await waitForCondition(() => evaluate(window, `(() => {
    const previews = [...document.querySelectorAll('[data-clip-preview-track]')];
    return previews.length > 0 && previews.every((preview) => preview instanceof HTMLAudioElement && preview.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA);
  })()`), 'isolated clip audio previews');
  const playbackStart = Number(await evaluate(window, `document.querySelector('[data-clip-preview-track="microphone"]')?.currentTime ?? 0`));
  await clickButtonByLabel(window, 'Play selection');
  await waitForCondition(() => evaluate(window, `document.querySelector('[data-clip-preview-track="microphone"]')?.paused === false`), 'microphone preview playback');
  await waitForCondition(() => evaluate(window, `(document.querySelector('[data-clip-preview-track="microphone"]')?.currentTime ?? 0) > ${playbackStart + 0.05}`), 'microphone preview playback progress');
  const focused = await evaluate(window, `(() => {
    const slider = document.querySelector('.clip-editor-track-control [role="slider"][aria-label^="Microphone "]');
    slider?.focus();
    return slider === document.activeElement;
  })()`);
  if (!focused) throw new Error('The microphone level slider is missing or could not receive focus.');
  await pressKey(window, 'HOME');
  for (let step = 0; step < 37; step += 1) await pressKey(window, 'RIGHT');
  const trackIndex = Number(await evaluate(window, `document.querySelector('[data-clip-preview-track="microphone"]')?.getAttribute('data-track-index') ?? -1`));
  if (trackIndex < 0) throw new Error('The microphone preview audio stream has no track index.');
  await waitForCondition(() => evaluate(window, `window.switchboard.getSnapshot().then((snapshot) => snapshot.clips[0].audioTrackLevels?.[${trackIndex}] === 37)`), 'microphone track level persistence');
  await waitForCondition(() => evaluate(window, `(document.querySelector('[data-clip-preview-track="microphone"]')?.volume ?? 1) < ${before}`), 'microphone preview volume adjustment');
  const after = Number(await evaluate(window, `document.querySelector('[data-clip-preview-track="microphone"]')?.volume ?? -1`));
  if (!(after < before)) throw new Error(`Microphone preview volume did not respond: ${before} -> ${after}.`);
  const synchronizationErrorMs = Number(await evaluate(window, `Math.abs((document.querySelector('[data-clip-preview-track="microphone"]')?.currentTime ?? 0) - (document.querySelector('video')?.currentTime ?? 0)) * 1000`));
  if (synchronizationErrorMs > 100) throw new Error(`Microphone preview drifted ${synchronizationErrorMs}ms from the video.`);
  await clickButtonByLabel(window, 'Pause');
  return { before, after, trackIndex, synchronizationErrorMs };
}

async function editorGeometry(window) {
  return evaluate(window, `(() => {
    const layout = document.querySelector('.clip-editor-layout');
    const viewer = document.querySelector('.clip-editor-preview')?.getBoundingClientRect();
    const timeline = document.querySelector('[data-testid="clip-timeline-surface"]')?.getBoundingClientRect();
    const inspector = document.querySelector('.clip-editor-inspector');
    const inspectorContent = document.querySelector('.clip-editor-inspector__content');
    const inspectorRect = inspector?.getBoundingClientRect();
    const inspectorContentRect = inspectorContent?.getBoundingClientRect();
    return {
      inspector: layout?.dataset.inspector,
      columns: layout ? getComputedStyle(layout).gridTemplateColumns : null,
      layoutWidth: layout?.getBoundingClientRect().width ?? 0,
      viewerWidth: viewer?.width ?? 0,
      timelineWidth: timeline?.width ?? 0,
      inspectorClientWidth: inspector?.clientWidth ?? 0,
      inspectorScrollWidth: inspector?.scrollWidth ?? 0,
      inspectorRight: inspectorRect?.right ?? 0,
      inspectorContentRight: inspectorContentRect?.right ?? 0,
    };
  })()`);
}

async function measureTimelinePlayback(window, durationMs = 2_000) {
  await evaluate(window, `(() => {
    const reset = document.querySelector('button[aria-label="Reset timeline edits"]');
    if (reset && !reset.disabled) reset.click();
  })()`);
  await evaluate(window, `(() => {
    const video = document.querySelector('video');
    if (!video) throw new Error('Clip preview video is missing.');
    const trimStartMs = Number(document.querySelector('[aria-label="Trim start"]')?.getAttribute('aria-valuenow') ?? 0);
    video.pause();
    video.currentTime = trimStartMs / 1000;
    video.dispatchEvent(new Event('seeked'));
  })()`);
  await delay(100);
  await clickButtonByLabel(window, 'Play selection');
  await waitForCondition(() => evaluate(window, `document.querySelector('video')?.paused === false`), 'clip playback start');
  const samples = await evaluate(window, `new Promise((resolve) => {
    const video = document.querySelector('video');
    const surface = document.querySelector('[data-testid="clip-timeline-surface"]');
    const playhead = document.querySelector('.clip-editor-playhead');
    const duration = Number(document.querySelector('[aria-label="Playhead"]')?.getAttribute('aria-valuemax'));
    const width = surface?.getBoundingClientRect().width ?? 0;
    const values = [];
    const startedAt = performance.now();
    const sample = (now) => {
      const transform = playhead?.style.transform ?? '';
      const match = /translate3d\\(([-+0-9.eE]+)px/.exec(transform);
      values.push({
        elapsedMs: now - startedAt,
        playheadX: match ? Number(match[1]) : null,
        expectedX: duration > 0 ? (video?.currentTime ?? 0) * 1000 / duration * width : 0,
        videoMs: (video?.currentTime ?? 0) * 1000,
        paused: video?.paused ?? true,
        ended: video?.ended ?? false,
      });
      if (now - startedAt < ${durationMs}) requestAnimationFrame(sample);
      else resolve(values);
    };
    requestAnimationFrame(sample);
  })`);
  if (await evaluate(window, `Boolean(document.querySelector('button[aria-label="Pause"]'))`)) await clickButtonByLabel(window, 'Pause');
  const moving = samples.filter((sample) => sample.videoMs > 30 && sample.playheadX !== null);
  const gaps = moving.slice(1).map((sample, index) => sample.elapsedMs - moving[index].elapsedMs);
  const backwards = moving.slice(1).filter((sample, index) => sample.playheadX < moving[index].playheadX - 0.25).length;
  const errors = moving.map((sample) => Math.abs(sample.playheadX - sample.expectedX));
  const metrics = {
    samples: moving.length,
    backwards,
    longFrames: gaps.filter((gap) => gap > 34).length,
    maximumFrameGapMs: Math.max(0, ...gaps),
    maximumTrackingErrorPx: Math.max(0, ...errors),
    p95TrackingErrorPx: percentile(errors, 0.95),
    pausedSamples: samples.filter((sample) => sample.paused).length,
    endedSamples: samples.filter((sample) => sample.ended).length,
  };
  if (metrics.samples < 60 || metrics.backwards > 0 || metrics.maximumFrameGapMs > 50 || metrics.p95TrackingErrorPx > 2 || metrics.pausedSamples > 2 || metrics.endedSamples > 0) {
    throw new Error(`Timeline playback did not meet the smoothness budget: ${JSON.stringify(metrics)}`);
  }
  return metrics;
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
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
  await pointerDrag(window, Math.max(surface.x + 6, startRect.x + startRect.width / 2), startRect.y + startRect.height / 2, surface.x + surface.width * 0.18, trackY);
  const startTrimmed = await timelineState(window);
  if (!(startTrimmed.startMs > initial.startMs)) throw new Error(`Left trim handle did not advance: ${initial.startMs} -> ${startTrimmed.startMs}`);
  assertNear(startTrimmed.currentMs, scrubbed.currentMs, 80, 'Left trim handle unexpectedly sought');

  const endRect = await sliderRect(window, 'Trim end');
  const endPointerX = Math.min(surface.x + surface.width - 6, endRect.x + endRect.width / 2);
  const endPointerY = endRect.y + endRect.height / 2;
  const endHit = await evaluate(window, `(() => {
    const target = document.elementFromPoint(${endPointerX}, ${endPointerY});
    return target?.closest?.('[role="slider"]')?.getAttribute('aria-label') ?? null;
  })()`);
  if (endHit !== 'Trim end') throw new Error(`The trim end handle is obstructed by ${endHit ?? 'another timeline element'}.`);
  await pointerDrag(window, endPointerX, endPointerY, surface.x + surface.width * 0.82, trackY);
  const endTrimmed = await timelineState(window);
  if (!(endTrimmed.endMs < initial.endMs)) throw new Error(`Right trim handle did not retreat: ${initial.endMs} -> ${endTrimmed.endMs}`);
  assertNear(endTrimmed.currentMs, startTrimmed.currentMs, 80, 'Right trim handle unexpectedly sought');
  const trimmedScreenshot = join(outputDirectory, '1920x1080-clip-editor-trimmed.png');
  await writeFile(trimmedScreenshot, (await window.webContents.capturePage()).toPNG());

  const crossedStartRect = await sliderRect(window, 'Trim start');
  await pointerDrag(window, Math.max(surface.x + 6, crossedStartRect.x + crossedStartRect.width / 2), crossedStartRect.y + crossedStartRect.height / 2, surface.x + surface.width, trackY);
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
  for (let step = 1; step <= 4; step += 1) {
    await window.webContents.sendInputEvent({
      type: 'mouseMove',
      x: Math.round(startX + (endX - startX) * (step / 4)),
      y: Math.round(startY + (endY - startY) * (step / 4)),
      button: 'left',
    });
    await delay(20);
  }
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
  if (await evaluate(window, `Boolean(document.querySelector('[data-testid="clip-editor"]'))`)) {
    await waitForStablePreview(window);
    return;
  }
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
  await waitForStablePreview(window);
}

async function waitForStablePreview(window) {
  try {
    await waitForSelector(window, '.clip-editor-preview[data-state="ready"]');
  } catch (error) {
    const diagnostics = await evaluate(window, `(() => {
      const preview = document.querySelector('.clip-editor-preview');
      const video = document.querySelector('video');
      return {
        previewState: preview?.getAttribute('data-state') ?? null,
        readyState: video?.readyState ?? null,
        networkState: video?.networkState ?? null,
        errorCode: video?.error?.code ?? null,
        errorMessage: video?.error?.message ?? null,
        currentSrc: video?.currentSrc ?? null,
      };
    })()`);
    throw new Error(`${error instanceof Error ? error.message : String(error)} ${JSON.stringify(diagnostics)}`);
  }
  await waitForMissingSelector(window, '.clip-editor-preview__status');
  await waitForCondition(() => evaluate(window, `document.querySelector('.clip-editor-timeline__desk')?.getAttribute('data-waveform-state') === 'ready'`), 'audio waveform analysis', 30_000);
  await delay(160);
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
  let measured = null;
  while (Date.now() < deadline) {
    measured = await evaluate(window, `({ width: innerWidth, height: innerHeight })`);
    if (measured.width === viewport.width && Math.abs(measured.height - viewport.height) <= 2) return;
    await delay(40);
  }
  throw new Error(`Window did not reach ${viewport.width}x${viewport.height}; renderer measured ${measured?.width ?? 'unknown'}x${measured?.height ?? 'unknown'}.`);
}

async function evaluate(window, expression) {
  try {
    return await window.webContents.executeJavaScript(expression, true);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)} Expression: ${expression.slice(0, 240)}`);
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function findReviewClipIndex(clips) {
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    if (!clip?.path || clip.durationMs < 10_000) continue;
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error', '-show_entries', 'stream=codec_name,codec_type:stream_tags=title,name', '-of', 'json', clip.path,
      ]);
      const streams = JSON.parse(stdout).streams ?? [];
      const labels = streams
        .filter((stream) => stream.codec_type === 'audio')
        .flatMap((stream) => [stream.tags?.title, stream.tags?.name])
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      const codec = streams.find((stream) => stream.codec_type === 'video')?.codec_name?.toLocaleLowerCase();
      if (
        codec === 'h264'
        && (labels.includes('game') || labels.includes('system'))
        && labels.includes('microphone')
      ) return index;
    } catch { }
  }
  return -1;
}
