import { app, BrowserWindow, Menu, nativeImage, net, protocol, session, Tray } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { AppController } from './controller';
import { requestsDemoUpdate } from './development-flags';
import { registerIpc } from './ipc';
import { parseByteRange } from './media-byte-range';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: AppController | null = null;
let cleanupIpc: (() => void) | null = null;
let quitting = false;
let shutdownStarted = false;
let demoUpdateRequested = requestsDemoUpdate(process.argv, app.isPackaged);

protocol.registerSchemesAsPrivileged([{
  scheme: 'switchboard-media',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

const hasSingleInstanceLock = process.env.SWITCHBOARD_NATIVE_REVIEW === '1'
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
  cleanupIpc?.();
  cleanupIpc = null;
  await controller?.dispose();
  controller = null;
  tray?.destroy();
  tray = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  mainWindow = null;
}

if (hasSingleInstanceLock) {
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
      const path = controller?.getClipPath(id, url.hostname === 'thumbnail');
      if (!path) return new Response('Not found', { status: 404 });
      const range = request.headers.get('range');
      if (url.hostname === 'clip') return streamClip(path, range);
      return net.fetch(pathToFileURL(path).toString(), range ? { headers: { Range: range } } : undefined);
    });
    cleanupIpc = registerIpc(controller, () => mainWindow);
    tray = createTray();
    showWindow();
    await initialization;

    app.on('activate', showWindow);
  }).catch((error) => {
    console.error('Switchboard failed to initialize.', error);
    app.exit(1);
  });
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

async function streamClip(path: string, rangeHeader: string | null): Promise<Response> {
  const file = await stat(path);
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': clipContentType(path),
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
