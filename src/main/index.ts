import { app, BrowserWindow, Menu, nativeImage, session, Tray } from 'electron';
import { join } from 'node:path';
import { AppController } from './controller';
import { registerIpc } from './ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: AppController | null = null;
let cleanupIpc: (() => void) | null = null;
let quitting = false;
let shutdownStarted = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
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

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: '#0d0f12',
    title: 'Switchboard',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d0f12',
      symbolColor: '#9ca3af',
      height: 38,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  controller?.setRendererActive(true);
  window.once('ready-to-show', () => window.show());
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
  else mainWindow.show();
  mainWindow.focus();
}

function requestQuit(): void {
  quitting = true;
  app.quit();
}

function createTray(): Tray {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#171a1f"/>
      <path d="M9 11h8.5a4.5 4.5 0 010 9H14" fill="none" stroke="#f2f3f5" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M14 16H9v7" fill="none" stroke="#ff5f85" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  const created = new Tray(icon.resize({ width: 18, height: 18 }));
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
  app.on('second-instance', showWindow);

  void app.whenReady().then(async () => {
    app.setAppUserModelId('dev.switchboard.prototype');
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    controller = new AppController();
    await controller.initialize();
    cleanupIpc = registerIpc(controller, () => mainWindow);
    tray = createTray();
    showWindow();

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
    .finally(() => app.exit(0));
});
