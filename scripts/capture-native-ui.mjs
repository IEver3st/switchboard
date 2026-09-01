import { app, BrowserWindow } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = process.env.SWITCHBOARD_REVIEW_OUTPUT
  ? resolve(projectRoot, process.env.SWITCHBOARD_REVIEW_OUTPUT)
  : join(projectRoot, '.impeccable', 'review', 'native');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-native-review-'));
const reviewStatePath = join(isolatedUserData, 'switchboard-state.json');
const currentStatePath = process.env.APPDATA ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json') : null;
if (currentStatePath) {
  try {
    await copyFile(currentStatePath, reviewStatePath);
    const reviewState = JSON.parse(await readFile(reviewStatePath, 'utf8'));
    if (reviewState.clips?.[0]) {
      reviewState.clips[0].audioChannels = ['game', 'chat', 'media', 'microphone'];
      if (process.env.SWITCHBOARD_REVIEW_AUTOCAPTURE === '1') {
        const duration = Math.max(1_000, reviewState.clips[0].durationMs ?? 30_000);
        reviewState.capture.config.enabled = true;
        reviewState.capture.config.replaySeconds = Math.max(60, reviewState.capture.config.replaySeconds ?? 60);
        reviewState.capture.autoCapture = {
          settings: {
            enabled: true,
            preRollSeconds: 20,
            postRollSeconds: 10,
            mergeNearbyEvents: true,
            mergeThresholdSeconds: 15,
            notifyWhenSaved: false,
            games: {},
            dismissedAvailability: {},
          },
          providers: [],
          runtime: {
            state: 'idle', activeGameId: null, activeProviderId: null, pendingCapture: null,
            eventsReceived: 0, eventsDeduplicated: 0, eventsIgnored: 0, clipsCreated: 0,
            lastEvent: null, lastError: null,
          },
        };
        reviewState.clips[0].game = 'Counter-Strike 2';
        reviewState.clips[0].name = 'Counter-Strike 2 - 3 Kills';
        reviewState.clips[0].autoCapture = {
          autoCaptured: true,
          providerId: 'cs2-gsi',
          gameId: 'cs2',
          events: [
            { id: 'review-kill-1', type: 'kill', timestampMs: Math.round(duration * 0.28), label: 'Kill' },
            { id: 'review-headshot', type: 'headshot', timestampMs: Math.round(duration * 0.52), label: 'Headshot' },
            { id: 'review-multi', type: 'multi_kill', timestampMs: Math.round(duration * 0.74), label: 'Triple Kill', metadata: { count: 3, derived: true } },
          ],
        };
      }
      await writeFile(reviewStatePath, `${JSON.stringify(reviewState, null, 2)}\n`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
app.setName('switchboard-native-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES ??= '1';
const verifyAudioNoise = process.argv.includes('--verify-audio-noise');
if (verifyAudioNoise) process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

const viewports = [
  { name: '1080x720', width: 1080, height: 720 },
  { name: '1420x900', width: 1420, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
];

const screens = [
  { name: 'devices', prepare: () => openDeviceGallery() },
  { name: 'g502-x-plus', prepare: () => openDevice('G502 X Plus') },
  { name: 'quadcast-2', prepare: () => openDevice('QuadCast 2') },
  { name: 'huntsman-v2-analog', prepare: () => openDevice('Huntsman V2 Analog') },
  { name: 'wh-1000xm6', prepare: () => openDevice('WH-1000XM6') },
  { name: 'audio-mixer', prepare: () => openAudioTab('mixer') },
  { name: 'audio-game', prepare: () => openAudioTab('game') },
  { name: 'audio-chat', prepare: () => openAudioTab('chat') },
  { name: 'audio-media', prepare: () => openAudioTab('media') },
  { name: 'audio-microphone', prepare: () => openAudioTab('microphone') },
  { name: 'capture', prepare: () => openPage('Capture', '.capture-command-header') },
  { name: 'clip-editor', prepare: () => openClipEditor() },
  { name: 'modules', prepare: () => openSettingsCategory('Modules') },
  { name: 'settings', prepare: () => openSettingsCategory('General') },
  { name: 'settings-capture', prepare: () => openSettingsCategory('Capture') },
  { name: 'settings-autocapture-provider', prepare: () => openAutoCaptureProvider() },
  { name: 'settings-diagnostics', prepare: () => openSettingsCategory('Diagnostics') },
  { name: 'settings-noise-diagnostics', prepare: () => openNoiseDiagnostics() },
  { name: 'settings-clips', prepare: () => openSettingsCategory('Clips') },
  { name: 'settings-search', prepare: () => openSettingsSearch('check') },
];
const requestedScreens = new Set((process.env.SWITCHBOARD_REVIEW_SCREENS ?? '').split(',').filter(Boolean));
const reviewScreens = requestedScreens.size > 0 ? screens.filter((screen) => requestedScreens.has(screen.name)) : screens;

await mkdir(outputDirectory, { recursive: true });
console.log('Native review: starting Switchboard main process.');
await import('../out/main/index.js');
console.log('Native review: waiting for Electron readiness.');
let window;
void app.whenReady().then(runReview).catch((error) => {
  console.error('Native review failed.', error);
  app.exit(1);
});

async function runReview() {
  console.log('Native review: waiting for the main window.');
  window = await waitForWindow();
  console.log('Native review: waiting for the renderer.');
  await waitForLoad(window);
  console.log('Native review: renderer ready.');
  await waitForCondition(`!document.querySelector('.startup-screen')`, 'startup sequence');
  if (verifyAudioNoise) {
    const workflow = await verifyAudioNoiseWorkflow();
    await writeFile(join(outputDirectory, 'audio-noise-workflow-report.json'), `${JSON.stringify(workflow, null, 2)}\n`);
    console.log(JSON.stringify({ audioNoiseWorkflow: workflow }, null, 2));
    app.quit();
    return;
  }
  await installReviewStyles(window);

  if (process.env.SWITCHBOARD_VERIFY_AUTOCAPTURE_MARKER === '1') {
    window.setContentSize(1420, 900, false);
    await waitForViewport({ name: '1420x900', width: 1420, height: 900 });
    const interaction = await verifyAutoCaptureMarker();
    await writeFile(join(outputDirectory, 'autocapture-marker-workflow-report.json'), `${JSON.stringify(interaction, null, 2)}\n`);
    console.log(JSON.stringify({ autoCaptureMarkerWorkflow: interaction }, null, 2));
  }

  if (process.env.SWITCHBOARD_VERIFY_SETTINGS_BACK === '1') {
    window.setContentSize(1080, 720, false);
    await waitForViewport({ name: '1080x720', width: 1080, height: 720 });
    const interaction = await verifySettingsBackControl();
    await writeFile(join(outputDirectory, 'settings-back-workflow-report.json'), `${JSON.stringify(interaction, null, 2)}\n`);
    console.log(JSON.stringify({ settingsBackWorkflow: interaction }, null, 2));
  }

  if (process.env.SWITCHBOARD_VERIFY_CLIP_SETTINGS === '1') {
    window.setContentSize(1420, 900, false);
    await waitForViewport({ name: '1420x900', width: 1420, height: 900 });
    const interaction = await verifyClipSettingsControls();
    await writeFile(join(outputDirectory, 'settings-workflow-report.json'), `${JSON.stringify(interaction, null, 2)}\n`);
    console.log(JSON.stringify({ settingsWorkflow: interaction }, null, 2));
  }

  const report = [];
  for (const viewport of viewports) {
    for (const screen of reviewScreens) {
      if (window.isMaximized()) window.unmaximize();
      window.setContentSize(viewport.width, viewport.height, false);
      await waitForViewport(viewport);
      console.log(`Native review: ${viewport.name} ${screen.name}.`);
      await screen.prepare();
      const currentViewport = await getViewportSize();
      if (window.isMaximized() || currentViewport.width !== viewport.width || Math.abs(currentViewport.height - viewport.height) > 2) {
        if (window.isMaximized()) window.unmaximize();
        window.setContentSize(viewport.width, viewport.height, false);
        await waitForViewport(viewport);
      }
      await waitForPaint();
      const metrics = await getLayoutMetrics(window);
      const image = await window.webContents.capturePage();
      const imageSize = image.getSize();
      const filename = `${viewport.name}-${screen.name}.png`;
      await writeFile(join(outputDirectory, filename), image.toPNG());
      report.push({ viewport, screen: screen.name, metrics, imageSize, filename });
    }
  }

  const reportName = requestedScreens.size > 0
    ? `report-${[...requestedScreens].sort().join('-')}.json`
    : 'report.json';
  await writeFile(join(outputDirectory, reportName), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, captures: report.length, report }, null, 2));
  app.quit();
}

async function waitForViewport(viewport) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const size = await getViewportSize();
    if (size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2) return;
    await delay(40);
  }
  throw new Error(`Native window did not reach ${viewport.name}.`);
}

function getViewportSize() {
  return window.webContents.executeJavaScript(`({ width: innerWidth, height: innerHeight })`);
}

async function waitForPaint() {
  window.webContents.invalidate();
  await window.webContents.executeJavaScript(`
    new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))
  `);
  await delay(80);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
    if (candidate) return candidate;
    await delay(50);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForLoad(target) {
  if (!target.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Switchboard renderer did not finish loading.')), 20_000);
    target.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function installReviewStyles(target) {
  await target.webContents.insertCSS(`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    html { scroll-behavior: auto !important; }
  `);
}

async function openDeviceGallery() {
  await window.webContents.executeJavaScript(`window.location.hash = 'devices'`);
  await window.webContents.executeJavaScript(`
    (() => {
      const back = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'All devices');
      back?.click();
      return true;
    })()
  `);
  try {
    await waitForSelector('.device-gallery');
  } catch (error) {
    const diagnostic = await window.webContents.executeJavaScript(`({ hash: window.location.hash, title: document.title, body: document.body?.innerText?.slice(0, 500), workbench: Boolean(document.querySelector('.device-workbench')), settings: Boolean(document.querySelector('.settings-page')) })`);
    throw new Error(`Device gallery did not open: ${JSON.stringify(diagnostic)}`, { cause: error });
  }
  await scrollMainToTop();
}

async function openDevice(name) {
  await openDeviceGallery();
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const name = ${JSON.stringify(name)};
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label')?.includes(name));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) throw new Error(`Could not open ${name}.`);
  await waitForCondition(`
    (() => document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === ${JSON.stringify(name)})()
  `, name);
  await scrollMainToTop();
}

async function openAudioTab(tab) {
  await clickButton('Audio');
  if (tab !== 'mixer' && tab !== 'microphone') {
    await window.webContents.executeJavaScript(`
      window.switchboard.getSnapshot().then((snapshot) => {
        const bus = snapshot.audio.buses.find((candidate) => candidate.id === ${JSON.stringify(tab)});
        return bus?.enabled
          ? snapshot
          : window.switchboard.setAudioChannelEnabled({ busId: ${JSON.stringify(tab)}, enabled: true });
      })
    `);
    await waitForCondition(
      `window.switchboard.getSnapshot().then((snapshot) => snapshot.audio.buses.find((candidate) => candidate.id === ${JSON.stringify(tab)})?.enabled === true)`,
      `${tab} audio channel`,
    );
  }
  await window.webContents.executeJavaScript(`
    (() => {
      window.location.hash = ${JSON.stringify(`audio/${tab}`)};
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return true;
    })()
  `);
  await waitForSelector(`#audio-tab-${tab}[aria-selected="true"]`);
  await waitForSelector(`#audio-panel-${tab}`);
  await scrollMainToTop();
}

async function openPage(label, selector) {
  await clickButton(label);
  await waitForSelector(selector);
  await scrollMainToTop();
}

async function openClipEditor() {
  await openPage('Capture', '.capture-command-header');
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.capture-clip-card button, table tbody button');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) throw new Error('Could not open a clip for editor review.');
  await waitForSelector('#clip-editor-title');
}

async function openSettings() {
  await waitForCondition(
    `Boolean(document.querySelector('.settings-page') || document.querySelector('button[aria-label="Settings"]'))`,
    'Settings entry point',
  );
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      if (document.querySelector('.settings-page')) return true;
      const button = document.querySelector('button[aria-label="Settings"]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error('Could not find the Settings button.');
  await waitForSelector('.settings-page');
  await scrollMainToTop();
}

async function openSettingsCategory(label) {
  await openSettings();
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll('[data-settings-category]')]
        .find((candidate) => candidate.textContent?.trim() === label);
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Could not find the ${label} Settings category.`);
  await waitForCondition(`document.querySelector('[data-settings-category][aria-current="page"]')?.textContent?.trim() === ${JSON.stringify(label)}`, `${label} Settings category`);
  await scrollMainToTop();
}

async function openAutoCaptureProvider() {
  await openSettingsCategory('Capture');
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('[aria-controls="autocapture-provider-cs2-gsi"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      if (button.getAttribute('aria-expanded') !== 'true') button.click();
      button.closest('.autocapture-provider')?.scrollIntoView({ block: 'center' });
      return true;
    })()
  `);
  if (!opened) throw new Error('Could not open the CS2 Auto Capture provider settings.');
  await waitForSelector('#autocapture-provider-cs2-gsi');
}

async function verifyAutoCaptureMarker() {
  await openClipEditor();
  await waitForCondition(`document.querySelector('.clip-editor-preview video')?.readyState >= 1`, 'Auto Capture review clip metadata');
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const snapshot = await window.switchboard.getSnapshot();
      const marker = snapshot.clips[0]?.autoCapture?.events[1];
      const buttons = [...document.querySelectorAll('.clip-editor-event-marker')];
      const button = buttons[1];
      const video = document.querySelector('.clip-editor-preview video');
      if (!marker || !(button instanceof HTMLButtonElement) || !(video instanceof HTMLVideoElement)) return null;
      button.focus();
      button.click();
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 500);
        video.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true });
      });
      return {
        markerCount: buttons.length,
        label: button.getAttribute('aria-label'),
        expectedMs: marker.timestampMs,
        actualMs: Math.round(video.currentTime * 1000),
        focused: document.activeElement === button,
      };
    })()
  `);
  if (!result || result.markerCount < 3 || !result.focused || Math.abs(result.actualMs - result.expectedMs) > 100) {
    throw new Error(`Auto Capture marker did not seek the native video element: ${JSON.stringify(result)}`);
  }
  return result;
}

async function openSettingsSearch(query) {
  await openSettings();
  const entered = await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('.settings-search__input');
      if (!(input instanceof HTMLInputElement)) return false;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
  if (!entered) throw new Error('Could not enter the Settings search query.');
  await waitForSelector('[data-settings-result]');
  const selected = await window.webContents.executeJavaScript(`
    (() => {
      const result = [...document.querySelectorAll('[data-settings-result]')]
        .find((candidate) => candidate.textContent?.includes('Always keep Switchboard up to date'));
      if (!(result instanceof HTMLButtonElement)) return false;
      result.click();
      return true;
    })()
  `);
  if (!selected) throw new Error('Could not select the Settings search result.');
  await waitForSelector('#setting-about\\.automaticAppUpdates.settings-row--highlighted');
  await window.webContents.executeJavaScript(`
    (() => {
      const row = document.getElementById('setting-about.automaticAppUpdates');
      if (!(row instanceof HTMLElement) || row.dataset.reviewHighlightPinned === 'true') return;
      row.dataset.reviewHighlightPinned = 'true';
      new MutationObserver(() => {
        if (!row.classList.contains('settings-row--highlighted')) row.classList.add('settings-row--highlighted');
      })
        .observe(row, { attributes: true, attributeFilter: ['class'] });
    })()
  `);
}

async function openNoiseDiagnostics() {
  await openSettingsCategory('Diagnostics');
  await waitForSelector('[data-setting-id="diagnostics.noise-suppression"]');
  await window.webContents.executeJavaScript(`
    (() => {
      document.querySelector('[data-setting-id="diagnostics.noise-suppression"]')?.scrollIntoView({ block: 'center' });
      return true;
    })()
  `);
}

async function verifyAudioNoiseWorkflow() {
  const before = await getNativeAudioSnapshot();
  if (!before.audio.enabled) {
    await window.webContents.executeJavaScript(`window.switchboard.setAudioEnabled(true)`);
  }
  await waitForCondition(
    `window.switchboard.getSnapshot().then((snapshot) => {
      const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
      return snapshot.audio.enabled && engine?.state === 'running' && Boolean(engine.pid) && snapshot.audio.host?.noiseSuppression.state === 'ready';
    })`,
    'native microphone noise suppression',
  );
  const initial = await getNativeAudioSnapshot();
  const initialEngine = initial.engines.find((engine) => engine.kind === 'audio');
  assertReview(initialEngine?.state === 'running' && initialEngine.pid, `Audio.Host did not report a running native process: ${JSON.stringify(initialEngine)}`);
  assertReview(initial.audio.host?.noiseSuppression.backend === 'RNNoise' || initial.audio.host?.noiseSuppression.backend === 'DeepFilterNet3', 'No production noise backend was active.');

  const light = await window.webContents.executeJavaScript(`window.switchboard.setMicProcessor({ processorId: 'noise-suppression', enabled: true, parameters: { amount: 25 } })`);
  const lightProcessor = light.audio.micProcessors.find((processor) => processor.id === 'noise-suppression');
  assertReview(lightProcessor?.enabled && lightProcessor.parameters.amount === 25, 'Canonical microphone strength did not mutate to Light.');
  assertReview(Math.abs((light.audio.host?.noiseSuppression.attenuationLimitDb ?? -1) - 9) < 0.01, 'Audio.Host did not apply the 9 dB Light target.');
  await delay(300);
  const persisted = JSON.parse(await readFile(reviewStatePath, 'utf8'));
  const persistedProcessor = persisted.audio?.micProcessors?.find((processor) => processor.id === 'noise-suppression');
  assertReview(persistedProcessor?.enabled && persistedProcessor.parameters?.amount === 25, 'Noise strength was not persisted by Electron main.');

  const reloaded = new Promise((resolveReload) => window.webContents.once('did-finish-load', resolveReload));
  window.webContents.reload();
  await reloaded;
  await waitForCondition(`!document.querySelector('.startup-screen')`, 'renderer refresh');
  const refreshed = await getNativeAudioSnapshot();
  const refreshedProcessor = refreshed.audio.micProcessors.find((processor) => processor.id === 'noise-suppression');
  assertReview(refreshedProcessor?.enabled && refreshedProcessor.parameters.amount === 25, 'Renderer refresh lost the canonical noise strength.');

  await window.webContents.executeJavaScript(`window.switchboard.setAudioEnabled(false)`);
  await waitForCondition(
    `window.switchboard.getSnapshot().then((snapshot) => snapshot.engines.find((engine) => engine.kind === 'audio')?.state === 'stopped' && snapshot.audio.host === null)`,
    'orderly Audio.Host stop',
  );
  await window.webContents.executeJavaScript(`window.switchboard.setAudioEnabled(true)`);
  await waitForCondition(
    `window.switchboard.getSnapshot().then((snapshot) => snapshot.engines.find((engine) => engine.kind === 'audio')?.state === 'running' && snapshot.audio.host?.noiseSuppression.attenuationLimitDb === 9)`,
    'orderly Audio.Host restart',
  );
  const orderlyRestart = await getNativeAudioSnapshot();
  const orderlyPid = orderlyRestart.engines.find((engine) => engine.kind === 'audio')?.pid;
  assertReview(orderlyPid && orderlyPid !== initialEngine.pid, 'Orderly restart did not create a fresh Audio.Host process.');

  await window.webContents.executeJavaScript(`window.switchboard.testMicrophone()`);

  const killedAt = Date.now();
  process.kill(orderlyPid);
  await waitForCondition(
    `window.switchboard.getSnapshot().then((snapshot) => {
      const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
      return engine?.state === 'running' && engine.pid && engine.pid !== ${JSON.stringify(orderlyPid)} && snapshot.audio.host?.noiseSuppression.state === 'ready';
    })`,
    'automatic Audio.Host recovery',
  );
  const recovered = await getNativeAudioSnapshot();
  const recoveredEngine = recovered.engines.find((engine) => engine.kind === 'audio');
  const recoveredNoise = recovered.audio.host?.noiseSuppression;
  assertReview(recoveredNoise?.captureOverruns === 0, 'Recovered Audio.Host reported capture overruns.');

  return {
    initialPid: initialEngine.pid,
    backend: initial.audio.host.noiseSuppression.backend,
    canonicalStrength: lightProcessor.parameters.amount,
    attenuationLimitDb: light.audio.host.noiseSuppression.attenuationLimitDb,
    persistedStrength: persistedProcessor.parameters.amount,
    refreshedStrength: refreshedProcessor.parameters.amount,
    orderlyRestartPid: orderlyPid,
    microphoneTest: 'completed',
    killedPid: orderlyPid,
    recoveredPid: recoveredEngine?.pid ?? null,
    recoveryMs: Date.now() - killedAt,
    recoveredState: recoveredNoise?.state ?? null,
    recoveredCaptureOverruns: recoveredNoise?.captureOverruns ?? null,
    recoveredDroppedOrBypassedFrames: recoveredNoise?.droppedOrBypassedFrames ?? null,
  };
}

function getNativeAudioSnapshot() {
  return window.webContents.executeJavaScript(`window.switchboard.getSnapshot()`);
}

function assertReview(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyClipSettingsControls() {
  await openSettingsCategory('Clips');
  const original = await window.webContents.executeJavaScript(`window.switchboard.getSnapshot().then((value) => value.capture.config)`);
  if (original.enabled) {
    await window.webContents.executeJavaScript(`window.switchboard.setCaptureConfig({ enabled: false })`);
    await waitForCondition(`window.switchboard.getSnapshot().then((value) => !value.capture.config.enabled)`, 'Capture engine to stop');
  }

  const expected = {
    replaySeconds: original.replaySeconds === 30 ? 45 : 30,
    quality: original.quality === 3 ? 4 : 3,
    resolution: original.resolution === '1080p' ? '1440p' : '1080p',
    fps: original.fps === 30 ? 60 : 30,
  };
  await chooseSettingsOption('capture.duration', expected.replaySeconds === 45 ? '45 seconds' : '30 seconds');
  await waitForCaptureConfig('replaySeconds', expected.replaySeconds);
  await chooseSettingsOption('capture.quality', expected.quality === 4 ? 'High (Default)' : 'Good');
  await waitForCaptureConfig('quality', expected.quality);
  await chooseSettingsOption('capture.resolution', expected.resolution === '1440p' ? '1440p (Default)' : '1080p');
  await waitForCaptureConfig('resolution', expected.resolution);
  await chooseSettingsOption('capture.frameRate', `${expected.fps} FPS`);
  await waitForCaptureConfig('fps', expected.fps);

  const controls = await window.webContents.executeJavaScript(`
    (() => ({
      storageButtons: [...(document.getElementById('setting-capture.storage')?.querySelectorAll('button') ?? [])].map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      settingsOverflow: document.querySelector('[data-settings-content-scroll]')?.scrollWidth > document.querySelector('[data-settings-content-scroll]')?.clientWidth,
    }))()
  `);
  if (controls.storageButtons.length !== 2 || controls.storageButtons.some((button) => button.disabled)) {
    throw new Error(`Clip storage actions were not available: ${JSON.stringify(controls.storageButtons)}`);
  }
  if (controls.horizontalOverflow || controls.settingsOverflow) throw new Error('Clip Settings introduced horizontal overflow.');

  const reload = new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Settings reload timed out.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
  window.webContents.reload();
  await reload;
  await waitForSelector('.clip-settings');
  const persisted = await window.webContents.executeJavaScript(`window.switchboard.getSnapshot().then((value) => value.capture.config)`);
  for (const [key, value] of Object.entries(expected)) {
    if (persisted[key] !== value) throw new Error(`Clip setting ${key} did not persist through reload.`);
  }

  await window.webContents.executeJavaScript(`document.querySelector('.settings-back')?.click()`);
  await waitForCondition(`!document.querySelector('.settings-page')`, 'Settings takeover to close');
  const closedHash = await window.webContents.executeJavaScript('location.hash');
  if (closedHash !== '#devices') throw new Error(`Settings returned to ${closedHash} instead of the previous workspace.`);

  return { expected, persisted: true, storageButtons: controls.storageButtons, closedHash };
}

async function verifySettingsBackControl() {
  await openSettingsCategory('General');
  const layout = await window.webContents.executeJavaScript(`
    (() => {
      const back = document.querySelector('.settings-back');
      const sidebar = document.querySelector('.settings-sidebar');
      if (!(back instanceof HTMLButtonElement) || !(sidebar instanceof HTMLElement)) return null;
      const backRect = back.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      return {
        text: back.textContent?.trim(),
        title: back.title,
        hasHeaderClose: Boolean(document.querySelector('.settings-close, button[aria-label="Close settings"]')),
        backRect: { left: backRect.left, top: backRect.top, right: backRect.right, bottom: backRect.bottom },
        sidebarRect: { left: sidebarRect.left, top: sidebarRect.top, right: sidebarRect.right, bottom: sidebarRect.bottom },
        bottomInset: sidebarRect.bottom - backRect.bottom,
        leftInset: backRect.left - sidebarRect.left,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()
  `);
  assertReview(layout?.text === 'Back', 'Settings Back control was not rendered with the expected label.');
  assertReview(layout.title === 'Back (Esc)', 'Settings Back control did not expose its Escape shortcut.');
  assertReview(!layout.hasHeaderClose, 'The legacy Settings header close control is still present.');
  assertReview(layout.bottomInset >= 0 && layout.bottomInset <= 20, `Settings Back control was not anchored to the sidebar footer: ${layout.bottomInset}px.`);
  assertReview(layout.leftInset >= 0 && layout.leftInset <= 20, `Settings Back control was not aligned to the sidebar left edge: ${layout.leftInset}px.`);
  assertReview(!layout.horizontalOverflow, 'Settings Back control introduced horizontal overflow.');

  await window.webContents.executeJavaScript(`document.querySelector('.settings-back')?.click()`);
  await waitForCondition(`!document.querySelector('.settings-page')`, 'Settings Back pointer activation');
  const pointerHash = await window.webContents.executeJavaScript('location.hash');
  assertReview(pointerHash === '#devices', `Settings Back pointer activation returned to ${pointerHash}.`);

  await openSettingsCategory('General');
  const focused = await window.webContents.executeJavaScript(`
    (() => {
      const back = document.querySelector('.settings-back');
      if (!(back instanceof HTMLButtonElement)) return false;
      back.focus();
      return document.activeElement === back;
    })()
  `);
  assertReview(focused, 'Settings Back control could not receive keyboard focus.');
  window.show();
  window.focus();
  window.webContents.focus();
  await delay(80);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'SPACE' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'SPACE' });
  await waitForCondition(`!document.querySelector('.settings-page')`, 'Settings Back keyboard activation');
  const keyboardHash = await window.webContents.executeJavaScript('location.hash');
  assertReview(keyboardHash === '#devices', `Settings Back keyboard activation returned to ${keyboardHash}.`);

  return { ...layout, pointerHash, keyboardHash, keyboardFocus: true };
}

async function chooseSettingsOption(settingId, label) {
  const elementId = `setting-${settingId}`;
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const trigger = document.getElementById(${JSON.stringify(elementId)})?.querySelector('[role="combobox"]');
      if (!(trigger instanceof HTMLElement) || trigger.matches(':disabled')) return false;
      trigger.click();
      return true;
    })()
  `);
  if (!opened) throw new Error(`Could not open ${settingId}.`);
  await waitForSelector('[role="option"]');
  const selected = await window.webContents.executeJavaScript(`
    (() => {
      const option = [...document.querySelectorAll('[role="option"]')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
      if (!(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    })()
  `);
  if (!selected) throw new Error(`Could not choose ${label} for ${settingId}.`);
}

async function waitForCaptureConfig(key, value) {
  await waitForCondition(
    `window.switchboard.getSnapshot().then((snapshot) => snapshot.capture.config[${JSON.stringify(key)}] === ${JSON.stringify(value)})`,
    `Clip setting ${key}`,
  );
}

async function clickButton(label) {
  const settingsOpen = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.settings-page'))`);
  if (settingsOpen && label !== 'Settings') {
    await window.webContents.executeJavaScript(`document.querySelector('.settings-back')?.click()`);
    await waitForCondition(`!document.querySelector('.settings-page')`, 'Settings to close');
  }
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label);
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Could not find the ${label} button.`);
}

async function waitForSelector(selector) {
  return waitForCondition(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, selector);
}

async function waitForCondition(expression, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = await window.webContents.executeJavaScript(expression);
    if (found) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function scrollMainToTop() {
  await window.webContents.executeJavaScript(`
    (() => {
      document.scrollingElement?.scrollTo(0, 0);
      document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach((element) => element.scrollTo(0, 0));
      document.querySelectorAll('[data-settings-content-scroll], .settings-sidebar').forEach((element) => element.scrollTo(0, 0));
      return true;
    })()
  `);
}

async function getLayoutMetrics(target) {
  return target.webContents.executeJavaScript(`
    (() => {
      const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
      return {
        innerWidth,
        innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: viewport?.clientWidth ?? null,
        viewportScrollWidth: viewport?.scrollWidth ?? null,
        viewportHeight: viewport?.clientHeight ?? null,
        viewportScrollHeight: viewport?.scrollHeight ?? null,
        documentScrollTop: document.scrollingElement?.scrollTop ?? null,
        settingsScrollTop: document.querySelector('[data-settings-content-scroll]')?.scrollTop ?? null,
        settingsSidebarScrollTop: document.querySelector('.settings-sidebar')?.scrollTop ?? null,
        settingsTop: document.querySelector('.settings-page')?.getBoundingClientRect().top ?? null,
        page: location.hash,
      };
    })()
  `);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
