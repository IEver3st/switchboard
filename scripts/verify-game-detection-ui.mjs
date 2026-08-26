import { app, BrowserWindow, dialog } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'game-detection');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-game-detection-user-'));
const fixtureDirectory = await mkdtemp(join(tmpdir(), 'switchboard-game-detection-fixtures-'));
const steamRoot = join(fixtureDirectory, 'Steam');
const epicManifests = join(fixtureDirectory, 'EpicManifests');
const manualExecutable = join(fixtureDirectory, 'Manual Adventure.exe');

await createLauncherFixtures();
await mkdir(outputDirectory, { recursive: true });
app.setName('switchboard-game-detection-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_GAME_SCAN_STEAM_ROOTS = steamRoot;
process.env.SWITCHBOARD_GAME_SCAN_EPIC_MANIFESTS = epicManifests;

dialog.showOpenDialog = async (options) => options?.title === 'Add a game executable'
  ? { canceled: false, filePaths: [manualExecutable] }
  : { canceled: true, filePaths: [] };

await import('../out/main/index.js');
void app.whenReady().then(run).catch((error) => {
  console.error('Game detection native verification failed.', error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await window.webContents.insertCSS(`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    html { scroll-behavior: auto !important; }
  `);
  await openGamesSettings(window);
  await waitForSnapshot(window, (snapshot) => (
    snapshot.gameDetection.scanState === 'idle' && snapshot.gameDetection.games.length === 8
  ), 'initial automatic game scan');

  await clickAutomaticScan(window);
  await waitForSnapshot(window, (snapshot) => snapshot.settings.scanGamesAutomatically === false, 'automatic scan disabled');
  await reloadRenderer(window);
  await openGamesSettings(window);
  await waitForSnapshot(window, (snapshot) => (
    snapshot.settings.scanGamesAutomatically === false && snapshot.gameDetection.games.length === 8
  ), 'disabled automatic scan persisted after reload');

  const beforeScan = await getSnapshot(window);
  await clickButton(window, 'Scan now');
  await waitForSnapshot(window, (snapshot) => (
    snapshot.gameDetection.scanState === 'idle'
      && snapshot.gameDetection.lastScanAt
      && snapshot.gameDetection.lastScanAt !== beforeScan.gameDetection.lastScanAt
  ), 'manual scan completion');

  await focusAndPressEnter(window, 'Add game');
  await waitForSnapshot(window, (snapshot) => (
    snapshot.gameDetection.games.some((game) => game.name === 'Manual Adventure')
  ), 'manual game addition');
  const afterAdd = await getSnapshot(window);
  await clickButton(window, 'Add game');
  await delay(120);
  const afterDuplicate = await getSnapshot(window);
  if (afterDuplicate.gameDetection.games.length !== afterAdd.gameDetection.games.length) {
    throw new Error('Adding the same executable created a duplicate game.');
  }

  await clickAutomaticScan(window);
  await waitForSnapshot(window, (snapshot) => (
    snapshot.settings.scanGamesAutomatically === true
      && snapshot.gameDetection.scanState === 'idle'
      && snapshot.gameDetection.games.some((game) => game.name === 'Manual Adventure')
  ), 'automatic scan enabled and manual game retained');
  await reloadRenderer(window);
  await openGamesSettings(window);
  await waitForSnapshot(window, (snapshot) => (
    snapshot.settings.scanGamesAutomatically === true
      && snapshot.gameDetection.games.some((game) => game.name === 'Manual Adventure')
  ), 'game library persisted after reload');

  const report = [];
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(window, viewport);
    await openGamesSettings(window);
    await window.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-settings-content-scroll]')?.scrollTo(0, 0);
        document.querySelector('[data-game-library-scroll]')?.scrollTo(0, 0);
      })()
    `);
    await waitForPaint(window);
    const metrics = await getMetrics(window);
    assertLayout(metrics, viewport);
    const image = await window.webContents.capturePage();
    const screenshot = join(outputDirectory, `${viewport.width}x${viewport.height}-games.png`);
    await writeFile(screenshot, image.toPNG());
    report.push({ viewport, state: 'populated', metrics, screenshot });
  }

  await window.webContents.executeJavaScript(`window.switchboard.resetSettings('games')`);
  await waitForSnapshot(window, (snapshot) => snapshot.gameDetection.games.length === 0, 'empty game library');
  window.setContentSize(1080, 720, false);
  await waitForViewport(window, { width: 1080, height: 720 });
  await waitForPaint(window);
  const emptyMetrics = await getMetrics(window);
  assertLayout(emptyMetrics, { width: 1080, height: 720 });
  const emptyImage = await window.webContents.capturePage();
  const emptyScreenshot = join(outputDirectory, '1080x720-games-empty.png');
  await writeFile(emptyScreenshot, emptyImage.toPNG());
  report.push({ viewport: { width: 1080, height: 720 }, state: 'empty', metrics: emptyMetrics, screenshot: emptyScreenshot });

  const reducedMotion = await verifyReducedMotion(window);
  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify({ report, reducedMotion }, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, report, reducedMotion }, null, 2));
  app.quit();
}

async function createLauncherFixtures() {
  const steamApps = join(steamRoot, 'steamapps');
  const steamGames = [
    ['1172470', 'Apex Legends'],
    ['1086940', "Baldur's Gate 3"],
    ['730', 'Counter-Strike 2'],
    ['548430', 'Deep Rock Galactic'],
    ['1145350', 'Hades II'],
    ['553850', 'Helldivers 2'],
  ];
  await mkdir(steamApps, { recursive: true });
  for (const [appId, name] of steamGames) {
    await mkdir(join(steamApps, 'common', name), { recursive: true });
    await writeFile(
      join(steamApps, `appmanifest_${appId}.acf`),
      `"AppState"\n{\n  "appid" "${appId}"\n  "name" "${name}"\n  "installdir" "${name}"\n}\n`,
    );
  }

  await mkdir(epicManifests, { recursive: true });
  for (const [file, name, executable] of [
    ['alan-wake-2.item', 'Alan Wake 2', 'AlanWake2.exe'],
    ['fortnite.item', 'Fortnite', 'FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe'],
  ]) {
    const installDirectory = join(fixtureDirectory, 'EpicLibrary', name);
    await mkdir(installDirectory, { recursive: true });
    await writeFile(join(epicManifests, file), JSON.stringify({
      DisplayName: name,
      InstallLocation: installDirectory,
      LaunchExecutable: executable,
      AppName: file.replace('.item', ''),
    }));
  }
  await writeFile(manualExecutable, 'manual game fixture');
}

async function openGamesSettings(window) {
  await waitForSettingsSurface(window);
  const hasSettings = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.settings-page'))`);
  if (!hasSettings) {
    const opened = await window.webContents.executeJavaScript(`
      (() => {
        const button = document.querySelector('button[aria-label="Settings"]');
        if (!button) return false;
        button.click();
        return true;
      })()
    `);
    if (!opened) throw new Error('Could not open Settings.');
    await waitForSelector(window, '.settings-page');
  }
  const selected = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[data-settings-category="games"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!selected) throw new Error('Could not select the Games settings category.');
  await waitForSelector(window, '.settings-game-library');
}

async function waitForSettingsSurface(window) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      Boolean(document.querySelector('.settings-page') || document.querySelector('button[aria-label="Settings"]'))
    `);
    if (ready) return;
    await delay(40);
  }
  throw new Error('Timed out waiting for the application workspace.');
}

async function clickAutomaticScan(window) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const control = document.querySelector('[data-setting-id="games.automaticScan"] [role="switch"]');
      if (!control) return false;
      control.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error('Could not toggle automatic game scanning.');
}

async function focusAndPressEnter(window, label) {
  const focused = await window.webContents.executeJavaScript(`
    (() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label);
      if (!button) return false;
      button.focus();
      return document.activeElement === button;
    })()
  `);
  if (!focused) throw new Error(`Could not focus ${label}.`);
  await window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'SPACE' });
  await window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'SPACE' });
}

async function clickButton(window, label) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label);
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Could not click ${label}.`);
}

async function reloadRenderer(window) {
  const loaded = new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer reload timed out.')), 15_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
  window.webContents.reload();
  await loaded;
}

async function getMetrics(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const content = document.querySelector('[data-settings-content-scroll]');
      const toolbar = document.querySelector('.settings-game-library__toolbar');
      const list = document.querySelector('[data-game-library-scroll]');
      const switchControl = document.querySelector('[data-setting-id="games.automaticScan"] [role="switch"]');
      const buttons = [...document.querySelectorAll('.settings-game-library__actions button')];
      const rect = (element) => element ? (() => {
        const value = element.getBoundingClientRect();
        return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
      })() : null;
      return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        content: {
          clientWidth: content?.clientWidth ?? null,
          scrollWidth: content?.scrollWidth ?? null,
          clientHeight: content?.clientHeight ?? null,
          scrollHeight: content?.scrollHeight ?? null,
        },
        toolbar: rect(toolbar),
        list: { ...rect(list), clientHeight: list?.clientHeight ?? null, scrollHeight: list?.scrollHeight ?? null },
        rows: document.querySelectorAll('.settings-game-row').length,
        empty: Boolean(document.querySelector('.settings-game-library__empty')),
        switchLabel: switchControl?.getAttribute('aria-label'),
        switchChecked: switchControl?.getAttribute('aria-checked'),
        actions: buttons.map((button) => ({ label: button.textContent?.trim(), disabled: button.disabled })),
      };
    })()
  `);
}

function assertLayout(metrics, viewport) {
  if (metrics.document.scrollWidth !== metrics.document.clientWidth) {
    throw new Error(`Document horizontal overflow at ${viewport.width}x${viewport.height}.`);
  }
  if (metrics.content.scrollWidth !== metrics.content.clientWidth) {
    throw new Error(`Settings horizontal overflow at ${viewport.width}x${viewport.height}.`);
  }
  if (metrics.content.scrollHeight > metrics.content.clientHeight + 1) {
    throw new Error(`Routine game controls require page scrolling at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics.content)}`);
  }
  if (!metrics.toolbar || !metrics.list || metrics.list.bottom > viewport.height + 1) {
    throw new Error(`Game library is clipped at ${viewport.width}x${viewport.height}.`);
  }
  if (metrics.switchLabel !== 'Automatically scan for games') throw new Error('The automatic scan switch is missing its accessible name.');
  if (metrics.actions.map((action) => action.label).join(',') !== 'Scan now,Add game') {
    throw new Error(`Game actions are incomplete: ${JSON.stringify(metrics.actions)}`);
  }
}

async function verifyReducedMotion(window) {
  window.webContents.debugger.attach('1.3');
  try {
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    const result = await window.webContents.executeJavaScript(`({
      preference: matchMedia('(prefers-reduced-motion: reduce)').matches,
      categoryAnimation: getComputedStyle(document.querySelector('.settings-content')).animationName,
    })`);
    if (!result.preference || result.categoryAnimation !== 'none') {
      throw new Error(`Reduced-motion styling was not applied: ${JSON.stringify(result)}`);
    }
    return result;
  } finally {
    window.webContents.debugger.detach();
  }
}

async function waitForSnapshot(window, predicate, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const snapshot = await getSnapshot(window);
    if (predicate(snapshot)) return snapshot;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function getSnapshot(window) {
  return window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
}

async function waitForViewport(window, viewport) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const size = await window.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight })');
    if (size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2) return;
    await delay(40);
  }
  throw new Error(`Window did not reach ${viewport.width}x${viewport.height}.`);
}

async function waitForPaint(window) {
  window.webContents.invalidate();
  await window.webContents.executeJavaScript('new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))');
  await delay(80);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
    if (candidate) return candidate;
    await delay(50);
  }
  throw new Error('Switchboard did not create a main window.');
}

async function waitForLoad(window) {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer did not finish loading.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForSelector(window, selector) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${selector}.`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
