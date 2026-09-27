import { BrowserWindow } from 'electron';
import type { RuntimeHandoffState } from './services/runtime-handoff';

export function runtimeHandoffHtml(name: string, state: RuntimeHandoffState, message?: string): string {
  const title = state === 'standby' ? 'Switchboard Dev is in control'
    : state === 'blocked' ? 'Control could not be handed over' : 'Handing over control';
  const detail = state === 'standby'
    ? 'This instance is paused. Devices, audio, capture and shortcuts will resume here when Dev quits.'
    : state === 'blocked' ? message ?? 'Close the other instance and reopen Switchboard to try again.'
      : 'Waiting for devices, audio, capture and shortcuts to be released.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>${escape(name)}</title><style>
    :root { color-scheme: dark; font: 14px/1.6 'Segoe UI', sans-serif; color: #edf0f3; background: #0d1015; }
    * { box-sizing: border-box; } body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 48px; }
    main { width: min(100%, 560px); } .brand { color: #a1aab7; margin: 0 0 32px; font-size: 13px; }
    h1 { font-size: 28px; line-height: 1.25; font-weight: 600; margin: 0 0 14px; letter-spacing: -.5px; }
    p { color: #a1aab7; margin: 0; overflow-wrap: anywhere; } .note { margin-top: 28px; font-size: 12px; }
    </style></head><body><main><p class="brand">${escape(name)}</p><section role="status" aria-live="polite">
    <h1>${escape(title)}</h1><p>${escape(detail)}</p></section>
    <p class="note">Your settings stay with this instance.</p></main></body></html>`;
}

export class RuntimeHandoffWindow {
  private window: BrowserWindow | null = null;
  private loadGeneration = 0;
  constructor(private readonly onHide: () => void) {}
  show(name: string, state: RuntimeHandoffState, message?: string): void {
    if (!this.window || this.window.isDestroyed()) {
      const window = new BrowserWindow({ width: 1080, height: 720, minWidth: 640, minHeight: 420,
        show: false, title: name, backgroundColor: '#0d1015', autoHideMenuBar: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      this.window = window;
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', event => event.preventDefault());
      window.on('close', event => { event.preventDefault(); window.hide(); this.onHide(); });
      window.once('ready-to-show', () => {
        if (this.window === window && !window.isDestroyed() && process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== '1') window.show();
      });
    }
    const window = this.window;
    const load = ++this.loadGeneration;
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(runtimeHandoffHtml(name, state, message))}`).catch(error => {
      // A fast handoff disposes the window or replaces the status mid-load; only a current load failure matters.
      const superseded = window.isDestroyed() || this.window !== window || load !== this.loadGeneration;
      if (!superseded && (error as { code?: string }).code !== 'ERR_ABORTED') console.warn('Handoff status could not load.', error);
    });
    if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== '1') this.window.show();
  }
  dispose(): void { this.window?.destroy(); this.window = null; }
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
