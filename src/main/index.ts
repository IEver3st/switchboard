import { app, BrowserWindow, Menu, nativeImage, net, protocol, session, Tray } from 'electron';
import { createReadStream, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { AppController } from './controller';
import { requestsDemoUpdate } from './development-flags';
import { registerIpc } from './ipc';
import { parseByteRange } from './media-byte-range';
import { loadDefaultAppUpdaterClient, type AppUpdaterClient } from './services/app-update-service';
import { registerMontageV2Ipc } from './montage-v2-ipc';
import { disposeMontageV2Service, getMontageV2Service } from './services/montage-v2';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: AppController | null = null;
let cleanupIpc: (() => void) | null = null;
let cleanupMontageV2Ipc: (() => void) | null = null;
let quitting = false;
let shutdownStarted = false;
let demoUpdateRequested = requestsDemoUpdate(process.argv, app.isPackaged);
const packagedUpdaterVerdictPath = process.env.SWITCHBOARD_PACKAGED_UPDATER_VERDICT;
const packagedUpdaterTargetVersion = process.env.SWITCHBOARD_PACKAGED_UPDATER_TARGET_VERSION?.trim();
const verifyPackagedUpdater = app.isPackaged
  && process.platform === 'win32'
  && process.env.SWITCHBOARD_VERIFY_PACKAGED_UPDATER === '1'
  && typeof packagedUpdaterVerdictPath === 'string'
  && isAbsolute(packagedUpdaterVerdictPath);

protocol.registerSchemesAsPrivileged([{
  scheme: 'switchboard-media',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

const hasSingleInstanceLock = verifyPackagedUpdater
  || process.env.SWITCHBOARD_NATIVE_REVIEW === '1'
  || app.requestSingleInstanceLock({ demoUpdate: demoUpdateRequested });
if (!hasSingleInstanceLock) app.quit();

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
    title: 'Switchboard',
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
  window.once('ready-to-show', () => {
    if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== '1') window.show();
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
    console.error('Switchboard renderer exited.', details.reason);
  });
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`Failed to load renderer (${code}): ${description}`, url);
  });

  window.on('close', (event) => {
    if (quitting || !controller?.getSnapshot().settings.closeToTray) return;
    event.preventDefault();

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
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  else {
    controller?.setRendererActive(true);
    mainWindow.show();
  }
  void controller?.initialize().then(() => controller?.refreshAudioDevices()).catch(() => undefined);
  mainWindow.focus();
}

function requestQuit(): void {
  quitting = true;
  app.quit();
}

function createTray(): Tray {
  const icon = nativeImage.createFromPath(getBrandIconPath());
  if (icon.isEmpty()) throw new Error('Switchboard brand icon could not be loaded.');
  const created = new Tray(icon.resize({ width: 18, height: 18, quality: 'best' }));
  created.setToolTip('Switchboard');
  created.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Switchboard', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: requestQuit },
    ]),
  );
  created.on('double-click', showWindow);
  return created;
}

async function shutdown(): Promise<void> {
  if (protocol.isProtocolHandled('switchboard-media')) await protocol.unhandle('switchboard-media');
  cleanupMontageV2Ipc?.();
  cleanupMontageV2Ipc = null;
  cleanupIpc?.();
  cleanupIpc = null;
  disposeMontageV2Service();
  await controller?.dispose();
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
    showWindow();
  });

  void app.whenReady().then(async () => {
    app.setAppUserModelId('dev.switchboard.prototype');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    controller = new AppController({
      demoUpdate: demoUpdateRequested,
      onUpdateInstallRequested: (installing) => {
        quitting = installing;
      },
    });
    const initialization = controller.initialize();
    await protocol.handle('switchboard-media', async (request) => {
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
      const path = controller?.getClipPath(id, url.hostname === 'thumbnail');
      if (!path) return new Response('Not found', { status: 404 });
      if (url.hostname === 'clip') return streamMedia(path, range, clipContentType(path));
      return net.fetch(pathToFileURL(path).toString(), range ? { headers: { Range: range } } : undefined);
    });
    cleanupIpc = registerIpc(controller, () => mainWindow);
    cleanupMontageV2Ipc = registerMontageV2Ipc(controller, () => mainWindow);
    tray = createTray();
    showWindow();
    await initialization;

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
  if (process.platform !== 'darwin' && !controller?.getSnapshot().settings.closeToTray) requestQuit();
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

async function streamMedia(path: string, rangeHeader: string | null, contentType: string): Promise<Response> {
  const file = await stat(path);
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  const range = parseByteRange(rangeHeader, file.size);
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
