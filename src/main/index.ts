import { app, BrowserWindow, Menu, nativeImage, net, protocol, session, Tray } from 'electron';
import { createReadStream, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { formatWithOptions } from 'node:util';
import { resolveApplicationIdentity, shouldApplyDevelopmentIdentity } from './application-identity';
import { AppController } from './controller';
import { QuickControlsWindow } from './quick-controls-window';
import { VerticalGuideWindow } from './vertical-guide-window';
import { requestsDemoUpdate } from './development-flags';
import { registerIpc } from './ipc';
import { parseByteRange } from './media-byte-range';
import { loadDefaultAppUpdaterClient, type AppUpdaterClient } from './services/app-update-service';
import { registerMontageV2Ipc } from './montage-v2-ipc';
import { disposeMontageV2Service, getMontageV2Service } from './services/montage-v2';
import { disposePreparedShareService } from './services/prepared-share';
import { consumeBackgroundUpdate, markBackgroundUpdate, readSoftwareRenderingPreference, shouldStartMinimized, WINDOWS_STARTUP_ARGUMENT } from './startup-settings';
import { developerDiagnostics } from './services/developer-diagnostics';
import { debugDiagnostics } from './services/debug-diagnostics';
import { DevelopmentFeedback } from './services/development-feedback';
import { developmentFeedbackEnabled } from '../shared/development-feedback';
import { RuntimeHandoff, runtimeHandoffEndpoint, legacyInstalledSwitchboardRunning, type RuntimeHandoffState } from './services/runtime-handoff';
import { RuntimeHandoffWindow } from './runtime-handoff-window';

process.on('uncaughtExceptionMonitor', (error, origin) => {
  developerDiagnostics.record('main', 'error', 'process.uncaught-exception', {
    origin, error: (error.stack ?? error.message).slice(0, 4096),
  });
});
app.on('child-process-gone', (_event, details) => {
  developerDiagnostics.record('main', 'error', 'process.child-exited', {
    type: details.type, reason: details.reason, exitCode: details.exitCode,
  });
});

let mainWindow: BrowserWindow | null = null;
const quickControls = new QuickControlsWindow();
const verticalGuide = new VerticalGuideWindow(() => controller?.verticalGuideClosed());
let tray: Tray | null = null;
let controller: AppController | null = null;
let cleanupIpc: (() => void) | null = null;
let cleanupMontageV2Ipc: (() => void) | null = null;
let quitting = false;
let gameBackgrounded = false;
let shutdownStarted = false;
let runtimeHandoff: RuntimeHandoff | null = null;
let handoffState: RuntimeHandoffState = 'waiting';
let handoffMessage: string | undefined;
let wantsVisible = !process.argv.includes(WINDOWS_STARTUP_ARGUMENT);
let runtimeStartedOnce = false;
const handoffWindow = new RuntimeHandoffWindow(() => { wantsVisible = false; });
const applicationIdentity = resolveApplicationIdentity({
  appDataPath: app.getPath('appData'),
  isPackaged: app.isPackaged,
});
if (applicationIdentity.userDataPath && shouldApplyDevelopmentIdentity({
  isNativeReview: process.env.SWITCHBOARD_NATIVE_REVIEW === '1',
  isPackaged: app.isPackaged,
})) {
  app.setName(applicationIdentity.displayName);
  app.setPath('userData', applicationIdentity.userDataPath);
}
let demoUpdateRequested = requestsDemoUpdate(process.argv, app.isPackaged);
const backgroundUpdateMarker = join(app.getPath('userData'), 'background-update.json');
const startInTrayAfterUpdate = app.isPackaged
  && consumeBackgroundUpdate(backgroundUpdateMarker, process.argv.includes('--updated'));
const packagedUpdaterVerdictPath = process.env.SWITCHBOARD_PACKAGED_UPDATER_VERDICT;
const packagedUpdaterTargetVersion = process.env.SWITCHBOARD_PACKAGED_UPDATER_TARGET_VERSION?.trim();
const verifyPackagedUpdater = app.isPackaged
  && process.platform === 'win32'
  && process.env.SWITCHBOARD_VERIFY_PACKAGED_UPDATER === '1'
  && typeof packagedUpdaterVerdictPath === 'string'
  && isAbsolute(packagedUpdaterVerdictPath);

const softwareRenderingEnabled = process.env.SWITCHBOARD_DISABLE_HARDWARE_ACCELERATION === '1'
  || readSoftwareRenderingPreference(join(app.getPath('userData'), 'switchboard-state.json'));
if (softwareRenderingEnabled) {
  app.disableHardwareAcceleration();
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'switchboard-media',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}]);

const hasSingleInstanceLock = verifyPackagedUpdater
  || process.env.SWITCHBOARD_NATIVE_REVIEW === '1'
  || app.requestSingleInstanceLock({ demoUpdate: demoUpdateRequested });
if (!hasSingleInstanceLock) app.quit();

const developmentFeedback = hasSingleInstanceLock && developmentFeedbackEnabled(app.isPackaged, process.env)
  ? new DevelopmentFeedback({
    directory: process.env.SWITCHBOARD_DEV_FEEDBACK_DIRECTORY ?? join(app.getAppPath(), '.switchboard', 'dev-feedback'),
    resourceDirectory: join(app.getPath('userData'), 'diagnostics', 'resources'),
    getRenderer: () => mainWindow?.webContents ?? null,
  }) : undefined;
const restoreDevelopmentConsole: Array<() => void> = [];
if (developmentFeedback) {
  developerDiagnostics.setSink(event => developmentFeedback.recordEvent(event));
  developerDiagnostics.setEnabled(true);
  debugDiagnostics.setEnabled(true);
  for (const method of ['warn', 'error'] as const) {
    const original = console[method];
    console[method] = (...args: unknown[]) => {
      developerDiagnostics.record('main', method === 'warn' ? 'warning' : 'error', `console.${method}`, {
        message: formatWithOptions({ depth: 1, maxArrayLength: 5, maxStringLength: 1_000 }, ...args.slice(0, 8)).slice(0, 4096),
      });
      original(...args);
    };
    restoreDevelopmentConsole.push(() => { console[method] = original; });
  }
  void developmentFeedback.start().catch(error => console.warn('Development feedback could not start.', error));
}

function isTrustedNavigation(url: string): boolean {
  try {
    const target = new URL(url);
    const developmentUrl = process.env.ELECTRON_RENDERER_URL;
    if (developmentUrl) return target.origin === new URL(developmentUrl).origin;
    return target.protocol === 'file:';
  } catch {
    return false;
  }
}

function getBrandIconPath(extension: 'ico' | 'png' = 'png'): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'branding', `switchboard-icon.${extension}`)
    : join(app.getAppPath(), 'resources', 'branding', `switchboard-icon.${extension}`);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    icon: getBrandIconPath(process.platform === 'win32' ? 'ico' : 'png'),
    backgroundColor: '#0d1015',
    title: applicationIdentity.displayName,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#a1aab7',
      height: 38,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  controller?.setRendererActive(true);
  if (developmentFeedback) {
    window.webContents.on('console-message', details => {
      if (details.level === 'warning' || details.level === 'error') developerDiagnostics.record('renderer', details.level,
        `console.${details.level}`, { message: details.message.slice(0, 4096), line: details.lineNumber });
    });
    window.webContents.on('preload-error', (_event, _path, error) => developerDiagnostics.record('renderer', 'error',
      'preload.failed', { message: (error.stack ?? error.message).slice(0, 4096) }));
    // Schedule first-window profiling without holding up route loading.
    developmentFeedback.automaticProfile('startup');
  }
  window.once('ready-to-show', () => {
    if (!gameBackgrounded && process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== '1') window.show();
  });
  window.on('focus', () => {
    void controller?.initialize().then(() => controller?.refreshAudioDevices()).catch(() => undefined);
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedNavigation(url)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, details) => {
    developerDiagnostics.record('renderer', 'error', 'renderer.exited', { reason: details.reason, exitCode: details.exitCode });
    console.error('Switchboard renderer exited.', details.reason);
  });
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    developerDiagnostics.record('renderer', 'error', 'renderer.load-failed', { code, description: description.slice(0, 4096) });
    console.error(`Failed to load renderer (${code}): ${description}`, url);
  });
  window.on('hide', () => controller?.setRendererActive(false));
  window.on('minimize', () => controller?.setRendererActive(false));
  window.on('show', () => controller?.setRendererActive(!window.isMinimized()));
  window.on('restore', () => controller?.setRendererActive(true));

  window.on('unresponsive', () => developerDiagnostics.record('renderer', 'warning', 'renderer.unresponsive'));
  window.on('responsive', () => developerDiagnostics.record('renderer', 'info', 'renderer.responsive'));

  window.on('close', (event) => {
    if (quitting || !controller?.getSnapshot().settings.closeToTray) return;
    event.preventDefault();
    wantsVisible = false;

    if (controller.getSnapshot().settings.destroyRendererInTray) {
      controller.setRendererActive(false);
      window.destroy();
    } else {
      controller.setRendererActive(false);
      window.hide();
    }
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
    controller?.setRendererActive(false);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

function showWindow(): void {
  wantsVisible = true;
  if (handoffState !== 'active') {
    handoffWindow.show(applicationIdentity.displayName, handoffState, handoffMessage);
    return;
  }
  gameBackgrounded = false;
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  else {
    controller?.setRendererActive(true);
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== '1') mainWindow.show();
  }
  if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== '1') mainWindow.focus();
}

async function getRendererRuntimeProbe(): Promise<unknown> {
  const window = mainWindow;
  if (!window || window.isDestroyed() || window.webContents.isDestroyed() || window.webContents.isLoading()) return null;
  return window.webContents.executeJavaScript(`(() => {
    const heap = performance.memory;
    const videos = Array.from(document.querySelectorAll('video'));
    const route = document.querySelector('.settings-page') ? 'settings' : location.hash.replace(/^#/, '').split('/')[0] || 'devices';
    return {
      route,
      longTasks: window.switchboardDebugRuntime ?? null,
      jsHeapUsedBytes: Number.isFinite(heap?.usedJSHeapSize) ? heap.usedJSHeapSize : null,
      jsHeapTotalBytes: Number.isFinite(heap?.totalJSHeapSize) ? heap.totalJSHeapSize : null,
      jsHeapLimitBytes: Number.isFinite(heap?.jsHeapSizeLimit) ? heap.jsHeapSizeLimit : null,
      domNodes: document.getElementsByTagName('*').length,
      canvasCount: document.querySelectorAll('canvas').length,
      imageCount: document.images.length,
      videoCount: videos.length,
      playingVideoCount: videos.filter((video) => !video.paused && !video.ended).length,
      resourceEntryCount: performance.getEntriesByType('resource').length,
    };
  })()`, true);
}

function requestQuit(): void {
  quitting = true;
  app.quit();
}

function createTray(): Tray {
  const icon = nativeImage.createFromPath(getBrandIconPath());
  if (icon.isEmpty()) throw new Error('Switchboard brand icon could not be loaded.');
  const created = new Tray(icon.resize({ width: 18, height: 18, quality: 'best' }));
  created.setToolTip(applicationIdentity.displayName);
  created.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${applicationIdentity.displayName}`, click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: requestQuit },
    ]),
  );
  created.on('double-click', showWindow);
  return created;
}

async function startRuntime(): Promise<void> {
  handoffState = 'active';
  handoffWindow.dispose();
  controller = new AppController({
    developmentFeedback,
    onGameLaunched: () => {
      if (quitting || !tray || !mainWindow || mainWindow.isDestroyed()) return;
      gameBackgrounded = true;
      controller?.setRendererActive(false);
      if (controller?.getSnapshot().settings.destroyRendererInTray) mainWindow.destroy();
      else mainWindow.hide();
    },
    onQuickControls: open => { quickControls.setSurface(controller!.getQuickSurface()); quickControls.setOpen(open); },
    onToggleQuickControls: () => { quickControls.setSurface(controller!.getQuickSurface()); quickControls.toggle(); },
    onSetupPreferences: async preferences => {
      await verticalGuide.configure(preferences.verticalGuide);
      quickControls.setSurface(preferences.quickSurface);
      const panel = quickControls.getWindow();
      if (panel?.isVisible()) panel.moveTop();
    },
    getVerticalGuideLayout: preferences => verticalGuide.getLayout(preferences),
    demoUpdate: demoUpdateRequested,
    getRendererRuntime: getRendererRuntimeProbe,
    onUpdateInstallRequested: (installing, background) => {
      markBackgroundUpdate(backgroundUpdateMarker, installing && background);
      quitting = installing;
    },
  });
  const initialization = controller.initialize();
  cleanupIpc = registerIpc(controller, () => mainWindow, () => quickControls.getWindow());
  cleanupMontageV2Ipc = registerMontageV2Ipc(controller, () => mainWindow);
  // Only sign-in launches wait for persisted window policy; manual startup stays fast.
  if (process.argv.includes(WINDOWS_STARTUP_ARGUMENT)) await controller.prepareSnapshot();
  if ((!runtimeStartedOnce && (startInTrayAfterUpdate || shouldStartMinimized(process.argv, controller.getSnapshot().settings.startMinimized))) || !wantsVisible) {
    wantsVisible = false;
    controller.setRendererActive(false);
  } else showWindow();
  await initialization;
  runtimeStartedOnce = true;
}

async function pauseRuntime(): Promise<void> {
  if (!quitting) controller?.assertRuntimeHandoffReady();
  cleanupMontageV2Ipc?.(); cleanupMontageV2Ipc = null;
  cleanupIpc?.(); cleanupIpc = null;
  controller?.setRendererActive(false);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  mainWindow = null;
  quickControls.dispose();
  verticalGuide.dispose();
  disposeMontageV2Service();
  await controller?.dispose();
  await disposePreparedShareService();
  controller = null;
}

async function shutdown(): Promise<void> {
  await developmentFeedback?.dispose();
  for (const restore of restoreDevelopmentConsole) restore();
  if (runtimeHandoff) await runtimeHandoff.dispose();
  else await pauseRuntime();
  handoffWindow.dispose();
  verticalGuide.shutdown();
  quickControls.dispose();
  if (protocol.isProtocolHandled('switchboard-media')) await protocol.unhandle('switchboard-media');
  cleanupMontageV2Ipc?.();
  cleanupMontageV2Ipc = null;
  cleanupIpc?.();
  cleanupIpc = null;
  disposeMontageV2Service();
  await controller?.dispose();
  await disposePreparedShareService();
  controller = null;
  tray?.destroy();
  tray = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  mainWindow = null;
}

if (verifyPackagedUpdater) {
  void app.whenReady().then(async () => {
    const updater = await loadDefaultAppUpdaterClient();
    if (packagedUpdaterTargetVersion) {
      await verifyInstalledUpdate(updater, packagedUpdaterTargetVersion, packagedUpdaterVerdictPath);
      return;
    }
    writeFileSync(packagedUpdaterVerdictPath, JSON.stringify({
      ok: true,
      updater: updater.constructor.name,
    }));
    app.exit(0);
  }).catch((error) => {
    try {
      writeFileSync(packagedUpdaterVerdictPath, JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.stack : String(error),
      }));
    } catch {
      // The verifier treats a missing verdict as a failure too.
    }
    app.exit(1);
  });
} else if (hasSingleInstanceLock) {
  app.on('second-instance', (_event, arguments_, _workingDirectory, additionalData) => {
    if (requestsDemoUpdate(arguments_, app.isPackaged, additionalData)) {
      demoUpdateRequested = true;
      controller?.enableDemoUpdate();
    }
    if (!shouldStartMinimized(arguments_, controller?.getSnapshot().settings.startMinimized ?? true)) showWindow();
  });

  void app.whenReady().then(async () => {
    app.setAppUserModelId(applicationIdentity.appUserModelId);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    await protocol.handle('switchboard-media', async (request) => {
      if (!controller || handoffState !== 'active') return new Response('Switchboard is paused.', { status: 503 });
      const url = new URL(request.url);
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (url.hostname === 'capture-source') {
        const thumbnail = await controller?.getCaptureSourceThumbnail(id);
        if (!thumbnail) return new Response('Not found', { status: 404 });
        return new Response(new Uint8Array(thumbnail), {
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'image/png',
          },
        });
      }
      const range = request.headers.get('range');
      if (url.hostname === 'montage-audio') {
        const path = await getMontageV2Service().resolveAssetPath(id);
        if (!path) return new Response('Not found', { status: 404 });
        return streamMedia(path, range, audioContentType(path));
      }
      if (url.hostname === 'clip-audio') {
        const trackIndex = Number(url.searchParams.get('track'));
        const path = await controller?.getClipAudioPreviewPath(id, trackIndex);
        if (!path) return new Response('Not found', { status: 404 });
        // Web Audio requires a CORS-approved media response, even for local tracks.
        const rendererOrigin = process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : 'null';
        return streamMedia(path, range, audioContentType(path), rendererOrigin);
      }
      const path = controller?.getClipPath(id, url.hostname === 'thumbnail');
      if (!path) return new Response('Not found', { status: 404 });
      if (url.hostname === 'clip') return streamMedia(path, range, clipContentType(path));
      return net.fetch(pathToFileURL(path).toString(), range ? { headers: { Range: range } } : undefined);
    });
    tray = createTray();
    const reviewRole = process.env.SWITCHBOARD_NATIVE_REVIEW === '1'
      ? process.env.SWITCHBOARD_REVIEW_RUNTIME_ROLE : undefined;
    const coordinate = process.platform === 'win32'
      && (process.env.SWITCHBOARD_NATIVE_FIXTURES !== '1' || reviewRole === 'installed' || reviewRole === 'development');
    if (coordinate) {
      runtimeHandoff = new RuntimeHandoff({
        ...await runtimeHandoffEndpoint(app.getPath('appData')),
        role: reviewRole === 'installed' ? 'installed' : app.isPackaged ? 'installed' : 'development',
        acquire: startRuntime,
        release: pauseRuntime,
        legacyOwnerRunning: reviewRole ? undefined : legacyInstalledSwitchboardRunning,
        state: (state, message) => {
          handoffState = state; handoffMessage = message;
          if (state === 'active') handoffWindow.dispose();
          else if (!quitting && wantsVisible) handoffWindow.show(applicationIdentity.displayName, state, message);
          tray?.setToolTip(`${applicationIdentity.displayName}${state === 'active' ? '' : ' · Paused'}`);
        },
      });
      await runtimeHandoff.start();
    } else await startRuntime();

    app.on('activate', showWindow);
  }).catch((error) => {
    console.error('Switchboard failed to initialize.', error);
    app.exit(1);
  });
}

async function verifyInstalledUpdate(
  updater: AppUpdaterClient,
  targetVersion: string,
  verdictPath: string,
): Promise<void> {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(targetVersion)) {
    throw new Error(`Invalid packaged updater target version: ${targetVersion}`);
  }

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;

  let finished = false;
  const fail = (error: unknown): void => {
    if (finished) return;
    finished = true;
    writeFileSync(verdictPath, JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.stack : String(error),
    }));
    app.exit(1);
  };
  const versionFrom = (payload: unknown): string | null => {
    if (!payload || typeof payload !== 'object' || !('version' in payload)) return null;
    const version = (payload as { version?: unknown }).version;
    return typeof version === 'string' ? version : null;
  };
  const assertTarget = (payload: unknown, phase: string): boolean => {
    const version = versionFrom(payload);
    if (version === targetVersion) return true;
    fail(new Error(`${phase} reported ${version ?? 'no version'} instead of ${targetVersion}.`));
    return false;
  };

  updater.on('update-available', (payload) => {
    assertTarget(payload, 'update-available');
  });
  updater.on('update-not-available', (payload) => {
    fail(new Error(`No ${targetVersion} update was available; feed reported ${versionFrom(payload) ?? 'no version'}.`));
  });
  updater.on('error', (payload) => {
    fail(payload instanceof Error ? payload : new Error(String(payload)));
  });
  updater.on('update-downloaded', (payload) => {
    if (finished || !assertTarget(payload, 'update-downloaded')) return;
    finished = true;
    writeFileSync(verdictPath, JSON.stringify({
      ok: true,
      updater: updater.constructor.name,
      version: targetVersion,
    }));
    updater.quitAndInstall(true, false);
  });

  setTimeout(() => fail(new Error(`Timed out downloading Switchboard ${targetVersion}.`)), 5 * 60_000).unref();
  await updater.checkForUpdates();
}

app.on('window-all-closed', () => {
  if (controller && handoffState === 'active' && process.platform !== 'darwin' && !gameBackgrounded && !controller.getSnapshot().settings.closeToTray) requestQuit();
});

app.on('before-quit', (event) => {
  quitting = true;
  if (shutdownStarted) return;
  event.preventDefault();
  shutdownStarted = true;
  void shutdown()
    .catch((error) => console.error('Switchboard shutdown failed.', error))
    .finally(() => {
      const reviewFailed = process.env.SWITCHBOARD_NATIVE_REVIEW === '1'
        && process.env.SWITCHBOARD_REVIEW_EXIT_CODE === '1';
      app.exit(reviewFailed ? 1 : 0);
    });
});

async function streamMedia(path: string, rangeHeader: string | null, contentType: string, rendererOrigin?: string): Promise<Response> {
  const file = await stat(path);
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  const range = parseByteRange(rangeHeader, file.size);
  if (rendererOrigin) headers.set('Access-Control-Allow-Origin', rendererOrigin);
  if (rangeHeader && !range) {
    headers.set('Content-Range', `bytes */${file.size}`);
    return new Response(null, { status: 416, headers });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(0, file.size - 1);
  headers.set('Content-Length', String(Math.max(0, end - start + 1)));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
  const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status: range ? 206 : 200, headers });
}

function clipContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mkv': return 'video/x-matroska';
    case '.webm': return 'video/webm';
    default: return 'video/mp4';
  }
}

function audioContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    case '.flac': return 'audio/flac';
    case '.ogg': return 'audio/ogg';
    case '.opus': return 'audio/ogg';
    default: return 'application/octet-stream';
  }
}
