import { app, BrowserWindow } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const count = Number(process.argv[2]);
if (![0, 1, 15, 20, 240].includes(count)) throw new Error('Clip count must be 0, 1, 15, 20, or 240.');
const requestedWidth = Number(process.argv[3] ?? 1420);
const requestedHeight = Number(process.argv[4] ?? 900);
if (!Number.isFinite(requestedWidth) || !Number.isFinite(requestedHeight) || requestedWidth < 1080 || requestedHeight < 720) {
  throw new Error('Viewport must be at least 1080x720.');
}
const reviewMode = process.argv.includes('--new-clips-review');
const manualNoReview = process.argv.includes('--manual-no-review');
const reviewDeleteConfirmation = process.argv.includes('--confirm-delete');
const reviewViewAll = process.argv.includes('--view-all');
const reviewOpenCard = process.argv.includes('--open-card');
const reviewReplayPopover = process.argv.includes('--replay-popover');
const reviewActiveControls = process.argv.includes('--active-controls');
const reviewListView = process.argv.includes('--list-view');
const reviewDeleteDialog = process.argv.includes('--delete-dialog');
const reviewThumbnailLoading = process.argv.includes('--thumbnail-loading');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'scale');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-capture-scale-'));
const sourceStatePath = join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json');
const state = JSON.parse(await readFile(sourceStatePath, 'utf8'));
const baseClip = state.clips[0];
if (count > 0 && !baseClip) throw new Error('A real clip is required to seed the scale review.');

await mkdir(outputDirectory, { recursive: true });
await mkdir(join(isolatedUserData, 'Clips'), { recursive: true });
await mkdir(join(isolatedUserData, 'cache', 'thumbnails'), { recursive: true });

const games = ['FiveM', 'War Thunder', 'Desktop', 'Battlefield 6'];
const now = Date.now();
state.clips = [];
for (let index = 0; index < count; index += 1) {
  const id = 'scale-qa-' + String(index).padStart(3, '0');
  const game = games[index % games.length];
  const thumbnailPath = join(isolatedUserData, 'cache', 'thumbnails', id + '.v2.jpg');
  await copyFile(baseClip.thumbnailPath, thumbnailPath);
  state.clips.push({
    ...baseClip,
    id,
    name: game + ' clip',
    game: game === 'Desktop' ? undefined : game,
    createdAt: now - index * 3_600_000,
    durationMs: 30_000 + index % 90 * 1_000,
    fileSize: baseClip.fileSize + index * 65_536,
    favorite: index % 7 === 0,
    titleEdited: false,
    thumbnailPath,
    audioChannels: index % 3 === 0 ? ['game', 'microphone'] : ['game'],
    autoCapture: reviewMode ? {
      autoCaptured: true,
      providerId: 'scale-qa-provider',
      gameId: game.toLowerCase().replaceAll(' ', '-'),
      events: [{ id: `${id}-event`, type: 'highlight', timestampMs: 10_000 }],
    } : undefined,
  });
}
if (reviewThumbnailLoading) {
  state.clips.slice(0, 8).forEach((clip) => { clip.thumbnailPath = ''; });
}
state.capture.config.enabled = false;
state.audio.enabled = false;
state.capture.config.clipsDirectory = join(isolatedUserData, 'Clips');
state.capture.runtime = {
  ...state.capture.runtime,
  state: 'stopped',
  bufferedSeconds: 0,
  segmentCount: 0,
  replayCacheBytes: 0,
  observedBitrateBps: 0,
  activeSource: null,
  saveQueueDepth: 0,
  error: undefined,
  warning: undefined,
};
state.capture.storage.clipsDirectory = join(isolatedUserData, 'Clips');
state.capture.storage.cacheDirectory = join(isolatedUserData, 'cache', 'replay');
state.capture.storage.clipsBytes = state.clips.reduce((total, clip) => total + clip.fileSize, 0);
state.capture.storage.replayCacheBytes = 0;
if (state.capture.autoCapture?.runtime) state.capture.autoCapture.runtime.activeGameId = null;
state.clipReview = { reviewedThrough: reviewMode || manualNoReview ? 0 : now };
const replayModule = state.modules.find((module) => module.id === 'capability.replay');
if (replayModule) replayModule.enabled = false;
await writeFile(join(isolatedUserData, 'switchboard-state.json'), JSON.stringify(state, null, 2));

app.setName('switchboard-capture-scale-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.stdout.write(`scale ${count}: importing main\n`);
await import('../out/main/index.js');
process.stdout.write(`scale ${count}: waiting for ready\n`);
void app.whenReady().then(runReview).catch((error) => {
  console.error(error);
  app.exit(1);
});

async function runReview() {
  process.stdout.write(`scale ${count}: waiting for window\n`);
  const window = await waitForWindow();
  process.stdout.write(`scale ${count}: window found\n`);
  if (window.webContents.isLoading()) {
    await new Promise((resolveLoad) => window.webContents.once('did-finish-load', resolveLoad));
  }
  window.setContentSize(requestedWidth, requestedHeight, false);
  await waitForApp(window);
  let manualReviewOpened = null;
  if (manualNoReview) {
    await window.webContents.executeJavaScript("window.dispatchEvent(new Event('focus'))");
    await delay(180);
    manualReviewOpened = await window.webContents.executeJavaScript("Boolean(document.querySelector('[data-testid=\"new-clips-review\"]'))");
    if (manualReviewOpened) throw new Error('A manual shortcut clip incorrectly opened the post-game review.');
  }
  if (reviewMode) {
    await window.webContents.executeJavaScript("window.dispatchEvent(new Event('focus'))");
    await waitFor(window, `document.querySelectorAll('.new-clips-review__card').length === ${count}`);
    if (reviewDeleteConfirmation) {
      await clickButton(window, `Delete ${count} clips`);
      await waitFor(window, `document.body.textContent.includes('Move ${count} clips to the Recycle Bin?')`);
    }
  }
  else {
    await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Capture')?.click()");
    await waitForLibrary(window, count);
    await window.webContents.executeJavaScript("document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach((element) => element.scrollTo(0, 0))");
    if (reviewActiveControls) {
      await clickButton(window, 'Favorites');
      await waitFor(window, `document.querySelector('.capture-tool-control--favorites')?.getAttribute('aria-pressed') === 'true'`);
      await selectGame(window, 'FiveM');
      await waitFor(window, `document.querySelector('[aria-label="Filter clips by game"]')?.textContent.includes('FiveM')`);
    }
    if (reviewListView) {
      await window.webContents.executeJavaScript("document.querySelector('[aria-label=\"List view\"]')?.click()");
      await waitFor(window, `document.querySelectorAll('.capture-clip-list__item').length === ${count}`);
    }
    if (reviewReplayPopover) {
      await window.webContents.executeJavaScript("document.querySelector('.capture-recorder-settings-trigger')?.click()");
      await waitFor(window, "Boolean(document.querySelector('.capture-replay-popover'))");
      await window.webContents.executeJavaScript("document.querySelector('.capture-replay-advanced__trigger')?.click()");
    }
    if (reviewDeleteDialog) {
      await window.webContents.executeJavaScript(`(() => {
        const card = document.querySelector('.capture-clip-card');
        const bounds = card?.getBoundingClientRect();
        if (!card || !bounds) return false;
        return card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: bounds.left + 20, clientY: bounds.top + 20 }));
      })()`);
      await waitFor(window, "Boolean(document.querySelector('.ui-context-menu'))");
      await window.webContents.executeJavaScript("[...document.querySelectorAll('.ui-context-menu__item')].find((item) => item.textContent.trim() === 'Delete…')?.click()");
      await waitFor(window, "Boolean(document.querySelector('[role=alertdialog]'))");
    }
  }
  await delay(250);

const metricsExpression = [
  '(() => {',
  "const grid = document.querySelector('.capture-clip-grid');",
  "const cards = [...document.querySelectorAll('.capture-clip-card')];",
  "const images = [...document.querySelectorAll('.capture-clip-card img')];",
  "const library = document.querySelector('.capture-library');",
  "const tools = document.querySelector('.capture-library__tools');",
  "const commandHeader = document.querySelector('.capture-command-header');",
  "const commandTop = document.querySelector('.capture-command-header__capture-rail');",
  "const search = document.querySelector('.capture-library__search');",
  'return {',
  'viewport: { width: window.innerWidth, height: window.innerHeight },',
  'requestedClips: ' + count + ',',
  'cards: cards.length,',
  "rows: document.querySelectorAll('tbody tr').length,",
  "columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,",
  "cardWidths: cards.length ? { minimum: Math.min(...cards.map((card) => card.getBoundingClientRect().width)), maximum: Math.max(...cards.map((card) => card.getBoundingClientRect().width)) } : null,",
  "libraryBounds: library ? { left: library.getBoundingClientRect().left, right: library.getBoundingClientRect().right, width: library.getBoundingClientRect().width } : null,",
  "toolbarBounds: tools ? { left: tools.getBoundingClientRect().left, right: tools.getBoundingClientRect().right, width: tools.getBoundingClientRect().width } : null,",
  "commandHeaderBounds: commandHeader ? { top: commandHeader.getBoundingClientRect().top, bottom: commandHeader.getBoundingClientRect().bottom, height: commandHeader.getBoundingClientRect().height } : null,",
  "commandTopBounds: commandTop ? { height: commandTop.getBoundingClientRect().height } : null,",
  "searchBounds: search ? { width: search.getBoundingClientRect().width } : null,",
  "toolbarOverflow: tools ? tools.scrollWidth > tools.clientWidth : null,",
  "activeControls: { favorites: document.querySelector('.capture-tool-control--favorites')?.getAttribute('aria-pressed'), game: document.querySelector('[aria-label=\"Filter clips by game\"]')?.textContent?.trim(), filter: document.querySelector('.capture-tool-control--date')?.textContent?.trim(), view: document.querySelector('.capture-tool-control--view [data-state=\"on\"]')?.getAttribute('aria-label') },",
  "emptyState: document.body.textContent.includes('No clips yet'),",
  "dateGroups: [...document.querySelectorAll('[id^=clip-group-]')].map((node) => node.textContent.trim()),",
  "lazyImages: images.filter((image) => image.loading === 'lazy').length,",
  'decodedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,',
  'horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,',
  '};',
  '})()',
].join('\n');
  const metrics = reviewMode
    ? await window.webContents.executeJavaScript(`(() => {
        const dialog = document.querySelector('[data-testid="new-clips-review"]');
        const viewport = document.querySelector('[data-new-clips-scroll]');
        const cards = [...document.querySelectorAll('.new-clips-review__card')];
        const firstCard = cards[0]?.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          reviewCards: cards.length,
          dialogBounds: dialog ? { width: dialog.getBoundingClientRect().width, height: dialog.getBoundingClientRect().height } : null,
          columns: document.querySelector('.new-clips-review__grid') ? getComputedStyle(document.querySelector('.new-clips-review__grid')).gridTemplateColumns.split(' ').length : 0,
          firstCard: firstCard ? { width: firstCard.width, height: firstCard.height } : null,
          scrollOwned: Boolean(viewport && viewport.scrollHeight > viewport.clientHeight),
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          title: document.querySelector('.new-clips-review__title')?.textContent?.trim(),
        };
      })()`)
    : await window.webContents.executeJavaScript(metricsExpression);
  window.webContents.invalidate();
  await window.webContents.executeJavaScript('new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))');
  await delay(80);
  const image = await window.webContents.capturePage();
  const viewportSuffix = process.argv[3] ? '-' + requestedWidth + 'x' + requestedHeight : '';
  const stateSuffix = reviewReplayPopover ? '-replay' : reviewActiveControls ? '-active' : reviewListView ? '-list' : reviewDeleteDialog ? '-delete' : reviewThumbnailLoading ? '-loading' : '';
  const reviewSuffix = reviewDeleteConfirmation ? '-delete-confirm' : reviewViewAll ? '-view-all' : reviewOpenCard ? '-open-card' : '';
  const imagePath = join(outputDirectory, (reviewMode ? 'new-clips-review-' + count + reviewSuffix : 'capture-' + count + '-clips') + viewportSuffix + stateSuffix + '.png');
  await writeFile(imagePath, image.toPNG());
  if (reviewReplayPopover) {
    await window.webContents.executeJavaScript("document.querySelector('.capture-recorder-settings-trigger')?.click()");
    await waitFor(window, "!document.querySelector('.capture-replay-popover')");
  }
  if (reviewActiveControls) {
    await clickButton(window, 'Favorites');
    await selectGame(window, 'All games');
    await waitForLibrary(window, count);
  }
  if (reviewListView) {
    await window.webContents.executeJavaScript("document.querySelector('[aria-label=\"Grid view\"]')?.click()");
    await waitFor(window, `document.querySelectorAll('.capture-clip-card').length === ${count}`);
  }
  if (reviewDeleteDialog) {
    await clickButton(window, 'Cancel');
    await waitFor(window, "!document.querySelector('[role=alertdialog]')");
  }
  const interactions = reviewMode ? await verifyReviewDismissal(window) : count > 1 ? await verifyLibraryInteractions(window, count) : null;
  const resizeTransitions = process.argv[5] === 'resize-sequence' ? await verifyResizeTransitions(window) : null;
  const report = { ...metrics, manualReviewOpened, interactions, resizeTransitions, imagePath, imageSize: image.getSize() };
  await writeFile(join(outputDirectory, 'capture-' + count + '-clips' + viewportSuffix + stateSuffix + '.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
  app.quit();
}

async function verifyReviewDismissal(window) {
  let mode = 'escape';
  let openedClipId = null;
  if (reviewDeleteConfirmation) {
    mode = 'delete-cancel-then-escape';
    await clickButton(window, 'Cancel');
    await waitFor(window, `!document.body.textContent.includes('Move ${count} clips to the Recycle Bin?')`);
  }
  if (reviewViewAll) {
    mode = 'view-all';
    await clickButton(window, 'View all clips');
  } else if (reviewOpenCard) {
    mode = 'open-card';
    openedClipId = await window.webContents.executeJavaScript(`(() => {
      const target = document.querySelector('[data-testid="new-clips-review"] [data-clip-id]');
      const id = target?.getAttribute('data-clip-id') ?? null;
      target?.click();
      return id;
    })()`);
  } else {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  }
  await waitFor(window, "!document.querySelector('[data-testid=\"new-clips-review\"]')");
  if (openedClipId) await delay(100);
  const reviewedThrough = await window.webContents.executeJavaScript('window.switchboard.getSnapshot().then((snapshot) => snapshot.clipReview.reviewedThrough)');
  const activeClipId = await window.webContents.executeJavaScript("document.activeElement?.getAttribute('data-clip-id') ?? null");
  const editorOpen = await window.webContents.executeJavaScript("Boolean(document.querySelector('[data-testid=\"clip-editor\"], .clip-editor'))");
  const hash = await window.webContents.executeJavaScript('location.hash');
  await window.webContents.executeJavaScript("window.dispatchEvent(new Event('blur'))");
  await delay(80);
  await window.webContents.executeJavaScript("window.dispatchEvent(new Event('focus'))");
  await delay(180);
  const reopened = await window.webContents.executeJavaScript("Boolean(document.querySelector('[data-testid=\"new-clips-review\"]'))");
  return { mode, reviewedThrough, reopened, hash, openedClipId, activeClipId, editorOpen };
}

async function verifyResizeTransitions(window) {
  const results = [];
  window.webContents.debugger.attach('1.3');
  try {
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160], [1440, 900]]) {
      await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: width,
        screenHeight: height,
      });
      await waitFor(window, `innerWidth === ${width} && innerHeight === ${height}`);
      await delay(80);
      results.push(await window.webContents.executeJavaScript(`(() => {
        const grid = document.querySelector('.capture-clip-grid');
        return {
          viewport: { width: innerWidth, height: innerHeight },
          columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      })()`));
    }
    await window.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
  } finally {
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
  }
  return results;
}

async function verifyLibraryInteractions(window, expectedCount) {
  const searchFocused = await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('input[placeholder="Search clips"]');
    input?.focus();
    return document.activeElement === input;
  })()`);

  await setSearch(window, 'Battlefield 6');
  await waitFor(window, `document.querySelectorAll('.capture-clip-card').length > 0 && document.querySelectorAll('.capture-clip-card').length < ${expectedCount}`);
  const searchMatches = await window.webContents.executeJavaScript("document.querySelectorAll('.capture-clip-card').length");
  await setSearch(window, '');
  await waitFor(window, `document.querySelectorAll('.capture-clip-card').length === ${expectedCount}`);

  await clickButton(window, 'Favorites');
  await waitFor(window, `document.querySelectorAll('.capture-clip-card').length > 0 && document.querySelectorAll('.capture-clip-card').length < ${expectedCount}`);
  const favoriteMatches = await window.webContents.executeJavaScript("document.querySelectorAll('.capture-clip-card').length");
  await clickButton(window, 'Favorites');
  await waitFor(window, `document.querySelectorAll('.capture-clip-card').length === ${expectedCount}`);

  await selectGame(window, 'FiveM');
  await waitFor(window, `document.querySelectorAll('.capture-clip-card').length > 0 && document.querySelectorAll('.capture-clip-card').length < ${expectedCount}`);
  const gameMatches = await window.webContents.executeJavaScript("document.querySelectorAll('.capture-clip-card').length");
  await selectGame(window, 'All games');
  await waitFor(window, `document.querySelectorAll('.capture-clip-card').length === ${expectedCount}`);

  await openDateFilter(window);
  await waitFor(window, "[...document.querySelectorAll('[role=menuitem]')].some((item) => item.textContent?.trim() === 'Today')");
  await selectMenuItem(window, 'Today');
  await waitFor(window, "document.querySelector('.capture-tool-control--date')?.textContent.includes('Filter · 1')");
  const dateFilterApplied = await window.webContents.executeJavaScript("document.querySelector('.capture-tool-control--date')?.getAttribute('aria-pressed') === 'true'");
  await openDateFilter(window);
  await waitFor(window, "[...document.querySelectorAll('[role=menuitem]')].some((item) => item.textContent?.trim() === 'Any date')");
  await selectMenuItem(window, 'Any date');
  await waitFor(window, "document.querySelector('.capture-tool-control--date')?.textContent.trim() === 'Filter'");

  const newestFirst = await window.webContents.executeJavaScript("document.querySelector('[data-clip-id]')?.getAttribute('data-clip-id')");
  await selectToolbarOption(window, 'Sort clips', 'Oldest');
  await waitFor(window, "document.querySelector('[aria-label=\"Sort clips\"]')?.textContent.includes('Oldest')");
  const oldestFirst = await window.webContents.executeJavaScript("document.querySelector('[data-clip-id]')?.getAttribute('data-clip-id')");
  await selectToolbarOption(window, 'Sort clips', 'Newest');

  await window.webContents.executeJavaScript("document.querySelector('[aria-label=\"List view\"]')?.click()");
  await waitFor(window, `document.querySelectorAll('.capture-clip-list__item').length === ${expectedCount}`);
  const listItems = await window.webContents.executeJavaScript("document.querySelectorAll('.capture-clip-list__item').length");
  await window.webContents.executeJavaScript("document.querySelector('[aria-label=\"Grid view\"]')?.click()");
  await waitFor(window, `document.querySelectorAll('.capture-clip-card').length === ${expectedCount}`);

  await window.webContents.executeJavaScript(`(() => {
    const trigger = document.querySelector('.capture-clip-card button[aria-label^="Actions for"]');
    if (!trigger) return false;
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse' }));
    return true;
  })()`);
  await waitFor(window, "Boolean(document.querySelector('[role=menu]'))");
  const overflowMenuActions = await window.webContents.executeJavaScript("[...document.querySelectorAll('[role=menuitem]')].map((item) => item.textContent.trim())");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(window, "!document.querySelector('[role=menu]')");

  await window.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('.capture-clip-card');
    const bounds = card?.getBoundingClientRect();
    if (!card || !bounds) return false;
    return card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: bounds.left + 20, clientY: bounds.top + 20 }));
  })()`);
  await waitFor(window, "Boolean(document.querySelector('.ui-context-menu'))");
  const contextMenuActions = await window.webContents.executeJavaScript("[...document.querySelectorAll('.ui-context-menu__item')].map((item) => item.textContent.trim())");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('.ui-context-menu__item')].find((item) => item.textContent.trim() === 'Delete…')?.click()");
  await waitFor(window, "Boolean(document.querySelector('[role=alertdialog]'))");
  const deleteDialogText = await window.webContents.executeJavaScript("document.querySelector('[role=alertdialog]')?.textContent.replace(/\\s+/g, ' ').trim()");
  await clickButton(window, 'Cancel');
  await waitFor(window, "!document.querySelector('[role=alertdialog]')");

  await clickButton(window, 'Create Montage');
  await waitFor(window, "Boolean(document.querySelector('[data-testid=\"montage-selection-toolbar\"]'))");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button[data-clip-id]')].slice(0, 2).forEach((button) => button.click())");
  await waitFor(window, "document.querySelector('[data-testid=\"montage-selection-toolbar\"]')?.textContent.includes('2 selected')");
  const montageSelection = await window.webContents.executeJavaScript("document.querySelector('[data-testid=\"montage-selection-toolbar\"]')?.textContent.includes('Create Montage · 2 clips') === true");
  await clickButton(window, 'Create Montage · 2 clips');
  await waitFor(window, "Boolean(document.querySelector('.montage-v2-shell'))");
  const montageOpened = await window.webContents.executeJavaScript("document.querySelector('.montage-v2-shell')?.textContent.includes('Montage') === true");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(window, "!document.querySelector('.montage-v2-shell')");

  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await delay(80);
  const replayTriggerFocused = await window.webContents.executeJavaScript("(() => { const trigger = document.querySelector('.capture-recorder-settings-trigger'); trigger?.focus(); return document.activeElement === trigger; })()");
  await waitFor(window, "document.activeElement?.classList.contains('capture-recorder-settings-trigger') === true");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await waitFor(window, "Boolean(document.querySelector('button[aria-label=\"Encoder\"]'))");
  const replayFocusInside = await window.webContents.executeJavaScript("document.querySelector('.capture-replay-popover')?.contains(document.activeElement) === true");
  await window.webContents.executeJavaScript("document.querySelector('.capture-replay-popover .capture-source-trigger')?.focus()");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await waitFor(window, "Boolean(document.querySelector('.capture-source-popover'))");
  const sourceOptions = await window.webContents.executeJavaScript("[...document.querySelectorAll('.capture-source-option')].map((option) => option.textContent.trim())");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(window, "!document.querySelector('.capture-source-popover')");
  await waitFor(window, "document.activeElement?.classList.contains('capture-source-trigger') === true");
  const sourceFocusAfter = await window.webContents.executeJavaScript("({ tag: document.activeElement?.tagName, className: document.activeElement?.className, label: document.activeElement?.getAttribute('aria-label') })");
  const sourceFocusRestored = Boolean(sourceFocusAfter?.className?.includes?.('capture-source-trigger'));
  if (!await window.webContents.executeJavaScript("Boolean(document.querySelector('.capture-replay-popover'))")) {
    await window.webContents.executeJavaScript("document.querySelector('.capture-recorder-settings-trigger')?.click()");
    await waitFor(window, "Boolean(document.querySelector('.capture-replay-popover'))");
  }
  await window.webContents.executeJavaScript("document.querySelector('.capture-replay-advanced__trigger')?.click()");
  await waitFor(window, "Boolean(document.querySelector('.capture-replay-advanced__content'))");
  const replayControls = await window.webContents.executeJavaScript(`(() => ({
    source: Boolean(document.querySelector('button[aria-label^="Capture source:"]')),
    fields: ['Replay length', 'Capture quality', 'Capture resolution', 'Capture frame rate', 'Encoder', 'Codec', 'Game audio', 'Microphone', 'Capture cursor']
      .filter((label) => document.querySelector('[aria-label="' + label + '"]')).length,
    shortcut: Boolean(document.querySelector('[aria-label^="Save replay shortcut:"]')),
  }))()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(window, "!document.querySelector('.capture-replay-popover')");
  await delay(160);
  const replayFocusAfter = await window.webContents.executeJavaScript("({ tag: document.activeElement?.tagName, className: document.activeElement?.className, label: document.activeElement?.getAttribute('aria-label') })");
  const replayFocusRestored = Boolean(replayFocusAfter?.className?.includes?.('capture-recorder-settings-trigger'));

  const openedClipId = await window.webContents.executeJavaScript(`(() => {
    const target = document.querySelector('button[data-clip-id]');
    const id = target?.getAttribute('data-clip-id') ?? null;
    target?.click();
    return id;
  })()`);
  await waitFor(window, "Boolean(document.querySelector('[data-testid=\"clip-editor\"]'))");
  const clipOpened = Boolean(openedClipId) && await window.webContents.executeJavaScript("Boolean(document.querySelector('[data-testid=\"clip-editor\"]'))");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(window, "!document.querySelector('[data-testid=\"clip-editor\"]')");

  return { searchFocused, searchMatches, favoriteMatches, gameMatches, dateFilterApplied, sortChangedOrder: newestFirst !== oldestFirst, listItems, overflowMenuActions, contextMenuActions, deleteDialogText, montageSelection, montageOpened, openedClipId, clipOpened, replayControls, replayKeyboard: { replayTriggerFocused, replayFocusInside, sourceOptions, sourceFocusRestored, sourceFocusAfter, replayFocusRestored, replayFocusAfter } };
}

async function setSearch(window, value) {
  const changed = await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('input[placeholder="Search clips"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!changed) throw new Error('Capture search input was unavailable.');
}

async function clickButton(window, label) {
  const clicked = await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
    button?.click();
    return Boolean(button);
  })()`);
  if (!clicked) throw new Error(`Button was unavailable: ${label}`);
}

async function selectGame(window, label) {
  const opened = await window.webContents.executeJavaScript("(() => { const trigger = document.querySelector('[aria-label=\\\"Filter clips by game\\\"]'); trigger?.click(); return Boolean(trigger); })()");
  if (!opened) throw new Error('Game filter was unavailable.');
  await waitFor(window, "document.querySelectorAll('[role=option]').length > 0");
  const selected = await window.webContents.executeJavaScript("(() => { const label = " + JSON.stringify(label) + "; const option = [...document.querySelectorAll('[role=option]')].find((candidate) => candidate.textContent?.trim() === label); option?.click(); return Boolean(option); })()");
  if (!selected) throw new Error(`Game filter option was unavailable: ${label}`);
}

async function selectToolbarOption(window, triggerLabel, optionLabel) {
  const opened = await window.webContents.executeJavaScript("(() => { const label = " + JSON.stringify(triggerLabel) + "; const trigger = [...document.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === label); trigger?.click(); return Boolean(trigger); })()");
  if (!opened) throw new Error(`Toolbar select was unavailable: ${triggerLabel}`);
  await waitFor(window, "document.querySelectorAll('[role=option]').length > 0");
  const selected = await window.webContents.executeJavaScript("(() => { const label = " + JSON.stringify(optionLabel) + "; const option = [...document.querySelectorAll('[role=option]')].find((candidate) => candidate.textContent?.trim() === label); option?.click(); return Boolean(option); })()");
  if (!selected) throw new Error(`Toolbar option was unavailable: ${optionLabel}`);
}

async function selectMenuItem(window, label) {
  const selected = await window.webContents.executeJavaScript("(() => { const label = " + JSON.stringify(label) + "; const item = [...document.querySelectorAll('[role=menuitem]')].find((candidate) => candidate.textContent?.trim() === label); item?.click(); return Boolean(item); })()");
  if (!selected) throw new Error(`Menu item was unavailable: ${label}`);
}

async function openDateFilter(window) {
  const focused = await window.webContents.executeJavaScript("(() => { const trigger = document.querySelector('.capture-tool-control--date'); trigger?.focus(); return document.activeElement === trigger; })()");
  if (!focused) throw new Error('Date filter was unavailable.');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
}

async function waitFor(window, expression, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${expression}.`);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
    if (candidate) return candidate;
    await delay(50);
  }
  throw new Error('Switchboard main window was not created.');
}

async function waitForLibrary(target, expected) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await target.webContents.executeJavaScript(
      expected === 0
        ? "document.body.textContent.includes('No clips yet')"
        : "document.querySelectorAll('.capture-clip-card').length === " + expected,
    );
    if (ready) return;
    await delay(50);
  }
  const debug = await target.webContents.executeJavaScript("({ hash: location.hash, cards: document.querySelectorAll('.capture-clip-card').length, text: document.body.textContent.slice(0, 500) })");
  throw new Error('Capture library did not render ' + expected + ' clips: ' + JSON.stringify(debug));
}

async function waitForApp(target) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await target.webContents.executeJavaScript("[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Capture')");
    if (ready) return;
    await delay(50);
  }
  const debug = await target.webContents.executeJavaScript("({ url: location.href, text: document.body.textContent.slice(0, 800), html: document.body.innerHTML.slice(0, 800), switchboard: typeof window.switchboard })");
  throw new Error('Switchboard renderer did not finish initializing: ' + JSON.stringify(debug));
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
