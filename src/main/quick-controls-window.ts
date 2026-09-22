import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { release } from 'node:os';

export function supportsQuickGlass(): boolean {
  return process.platform === 'win32' && Number(release().split('.')[2]) >= 22621;
}

export class QuickControlsWindow {
  private window: BrowserWindow | null = null;
  private requested = false;
  private surface: 'solid' | 'frosted' = 'frosted';
  setSurface(surface: 'solid' | 'frosted'): void {
    this.surface = surface;
    if (this.window && supportsQuickGlass()) {
      this.window.setBackgroundMaterial(surface === 'frosted' ? 'acrylic' : 'none');
      this.window.setBackgroundColor(surface === 'frosted' ? '#00000000' : '#0e1117');
    }
  }
  getWindow(): BrowserWindow | null { return this.window; }
  toggle(): void { this.setOpen(!this.requested); }
  setOpen(open: boolean): void {
    this.requested = open;
    if (!open) { this.window?.destroy(); this.window = null; return; }
    if (this.window && !this.window.isDestroyed()) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const inset = 12;
    const width = Math.min(460, display.width - inset * 2), height = Math.min(860, display.height - inset * 2);
    const glass = this.surface === 'frosted' && supportsQuickGlass();
    const window = new BrowserWindow({
      width, height, x: display.x + display.width - width - inset, y: display.y + inset,
      show: false, frame: false, resizable: false, maximizable: false, minimizable: false,
      skipTaskbar: true, alwaysOnTop: true, backgroundColor: glass ? '#00000000' : '#0e1117', roundedCorners: true,
      ...(supportsQuickGlass() ? { backgroundMaterial: glass ? 'acrylic' as const : 'none' as const } : {}),
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
    const query = { quickControls: '1', glassSupported: supportsQuickGlass() ? '1' : '0' };
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      void window.loadURL(url.toString());
    } else void window.loadFile(join(__dirname, '../renderer/index.html'), { query });
  }
  dispose(): void { this.requested = false; this.window?.destroy(); this.window = null; }
}
