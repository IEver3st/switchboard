import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

export class QuickControlsWindow {
  private window: BrowserWindow | null = null;
  private requested = false;
  getWindow(): BrowserWindow | null { return this.window; }
  toggle(): void { this.setOpen(!this.requested); }
  setOpen(open: boolean): void {
    this.requested = open;
    if (!open) { this.window?.destroy(); this.window = null; return; }
    if (this.window && !this.window.isDestroyed()) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = Math.min(460, display.width), height = display.height;
    const window = new BrowserWindow({
      width, height, x: display.x + display.width - width, y: display.y,
      show: false, frame: false, resizable: false, maximizable: false, minimizable: false,
      skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#0e1117', roundedCorners: false,
      webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    this.window = window;
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.once('ready-to-show', () => {
      if (this.window !== window || !this.requested) return;
      if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== '1') window.show();
    });
    window.on('blur', () => { if (this.window === window) this.setOpen(false); });
    window.on('closed', () => { if (this.window === window) { this.window = null; this.requested = false; } });
    const query = { quickControls: '1' };
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      void window.loadURL(url.toString());
    } else void window.loadFile(join(__dirname, '../renderer/index.html'), { query });
  }
  dispose(): void { this.requested = false; this.window?.destroy(); this.window = null; }
}
