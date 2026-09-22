import { BrowserWindow, screen, type Display } from 'electron';
import type { VerticalGuideLayout } from '../shared/contracts';
import { verticalGuideFrame, verticalGuideColors, type VerticalGuidePreferences } from '../shared/vertical-guide';

/** Static click-through framing and dimming. No preload, scripts, IPC or timers. */
export class VerticalGuideWindow {
  private window: BrowserWindow | null = null;
  private displayId: number | null = null;
  private preferences: VerticalGuidePreferences | null = null;
  private stopped = false;
  private style: string | null = null;
  private renderQueue: Promise<unknown> = Promise.resolve();
  constructor(private readonly onUnexpectedClose: () => void) {}

  private display(preferences: VerticalGuidePreferences, fallback = false): Display {
    const id = preferences.displayId ?? this.displayId;
    if (id !== null) {
      const selected = screen.getAllDisplays().find(item => item.id === id);
      if (selected) return selected;
      if (!fallback) throw new Error('The guide display is no longer available. Choose another display.');
    }
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  getLayout(preferences: VerticalGuidePreferences): VerticalGuideLayout {
    const display = this.display(preferences, !preferences.enabled);
    const describe = (item: Display) => ({ id: item.id, name: item.label || `Display ${screen.getAllDisplays().findIndex(candidate => candidate.id === item.id) + 1}`, width: Math.round(item.bounds.width * item.scaleFactor), height: Math.round(item.bounds.height * item.scaleFactor) });
    const description = describe(display);
    let frame;
    try { frame = verticalGuideFrame(description, preferences); }
    catch (error) { if (preferences.enabled) throw error; frame = verticalGuideFrame(description, { ...preferences, frame: null }); }
    return { display: description, displays: screen.getAllDisplays().map(describe), frame };
  }

  private async paint(window: BrowserWindow, display: Display, preferences: VerticalGuidePreferences): Promise<void> {
    const frame = verticalGuideFrame({ width: Math.round(display.bounds.width * display.scaleFactor), height: Math.round(display.bounds.height * display.scaleFactor) }, preferences);
    const scale = display.scaleFactor;
    const css = `#frame{left:${frame.x / scale}px;top:${frame.y / scale}px;width:${frame.width / scale}px;height:${frame.height / scale}px;border-color:${verticalGuideColors[preferences.color]} !important;box-shadow:0 0 0 100vmax rgb(0 0 0 / ${preferences.dim / 100}),inset 0 0 0 1px #0006}`;
    const operation = this.renderQueue.then(async () => {
      if (this.window !== window) throw new Error('The framing guide closed before it was ready.');
      const style = await window.webContents.insertCSS(css);
      if (this.style) await window.webContents.removeInsertedCSS(this.style);
      this.style = style;
      // Apply after creation: Windows initially constrains windows to the work area.
      window.setBounds(display.bounds, false);
    });
    this.renderQueue = operation.catch(() => undefined);
    await operation;
  }

  private readonly reposition = () => {
    if (!this.window || !this.preferences) return;
    const window = this.window;
    try {
      const display = this.display(this.preferences);
      void this.paint(window, display, this.preferences).catch(() => this.failed(window));
    } catch { this.failed(window); }
  };
  private failed(window: BrowserWindow): void {
    if (this.window === window) { this.dispose(); this.onUnexpectedClose(); }
  }

  async configure(preferences: VerticalGuidePreferences): Promise<void> {
    if (this.stopped) throw new Error('Switchboard is shutting down.');
    if (!preferences.enabled) { this.dispose(); return; }
    const display = this.display(preferences);
    // Validate before changing the last confirmed window or preferences.
    this.getLayout(preferences);
    if (this.window) {
      const previous = this.preferences, previousDisplay = this.displayId;
      this.displayId = display.id; this.preferences = preferences;
      try { await this.paint(this.window, display, preferences); }
      catch (error) {
        if (this.window) { this.preferences = previous; this.displayId = previousDisplay; }
        throw error;
      }
      return;
    }
    const window = new BrowserWindow({
      ...display.bounds, title: 'Switchboard vertical guide', show: false, frame: false, transparent: true,
      roundedCorners: false, thickFrame: false, hasShadow: false, resizable: false,
      maximizable: false, minimizable: false, focusable: false, skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
    });
    this.window = window;
    window.setIgnoreMouseEvents(true);
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setContentProtection(true);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.once('render-process-gone', () => this.failed(window));
    window.on('closed', () => this.failed(window));
    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none}#frame{position:absolute;box-sizing:border-box;border:2px solid white}</style></head><body><div id="frame"></div></body></html>`)}`);
      await this.paint(window, display, preferences);
      if (this.window !== window) throw new Error('The framing guide closed before it was ready.');
      this.displayId = display.id; this.preferences = preferences;
      screen.on('display-metrics-changed', this.reposition);
      screen.on('display-removed', this.reposition);
      if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== '1') window.showInactive();
    } catch (error) { if (this.window === window) this.dispose(); throw error; }
  }

  dispose(): void {
    const window = this.window;
    this.window = null; this.preferences = null; this.displayId = null; this.style = null;
    screen.removeListener('display-metrics-changed', this.reposition);
    screen.removeListener('display-removed', this.reposition);
    if (window && !window.isDestroyed()) window.destroy();
  }
  shutdown(): void { this.stopped = true; this.dispose(); }
}
