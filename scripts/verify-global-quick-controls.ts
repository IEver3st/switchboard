// Bundle with Bun (external: electron), then run in Electron. No global keys are
// injected and no window is shown; native registration and window lifecycle are real.
import assert from 'node:assert/strict';
import { app, BrowserWindow, globalShortcut } from 'electron';
import { DesktopControlsService } from '../src/main/services/desktop-controls';
import { QuickControlsWindow } from '../src/main/quick-controls-window';

process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
delete process.env.SWITCHBOARD_NATIVE_FIXTURES;
app.setAppPath(process.cwd());
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = () => { throw new Error('Review must stay hidden.'); };
// The real renderer and IPC are exercised by verify-quick-controls.mjs.
BrowserWindow.prototype.loadFile = async () => undefined;
const nativeRegister = globalShortcut.register.bind(globalShortcut);
const callbacks = new Map<string, () => void>();
globalShortcut.register = (accelerator, callback) => {
  const registered = nativeRegister(accelerator, callback);
  if (registered) callbacks.set(accelerator, callback);
  return registered;
};
let status = 'disabled', failure: string | null = null;
const panel = new QuickControlsWindow();
const service = new DesktopControlsService({
  toggleQuick: () => panel.toggle(), closeQuick: () => panel.dispose(),
  applications: async () => undefined,
  status: (state, error) => { status = state; failure = error; },
});
const shortcut = 'Control+Alt+Space', conflictShortcut = 'Control+Shift+Space';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function configure(enabled: boolean, accelerator: typeof shortcut | typeof conflictShortcut = shortcut) {
  status = 'waiting';
  service.configure({ quickControlsEnabled: enabled, quickShortcut: accelerator, executables: [] });
  const deadline = Date.now() + 5000;
  while (!['ready', 'disabled', 'error'].includes(status)) {
    assert(Date.now() < deadline, 'Shortcut configuration timed out'); await delay(10);
  }
}
void app.whenReady().then(async () => {
  try {
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    await configure(true);
    assert.equal(status, 'ready', failure ?? undefined);
    assert(globalShortcut.isRegistered(shortcut), 'Shortcut must register without a main renderer');
    assert.deepEqual(service.getResources(), [], 'Shortcut alone must not retain a native host');
    const press = callbacks.get(shortcut)!;
    for (let cycle = 0; cycle < 3; cycle++) {
      press();
      const window = panel.getWindow()!;
      assert(window && !window.isVisible() && window.isAlwaysOnTop());
      await delay(150);
      assert.equal(panel.getWindow(), window, 'A tap stays open after key release');
      press(); assert(window.isDestroyed(), 'Second press closes the panel');
      assert.equal(BrowserWindow.getAllWindows().length, 0);
    }
    press(); const blurred = panel.getWindow()!;
    blurred.emit('blur'); assert(blurred.isDestroyed());
    press(); assert(panel.getWindow(), 'Shortcut must reopen after an outside click');
    panel.dispose();
    press(); press(); assert.equal(panel.getWindow(), null, 'Rapid taps cancel a loading panel');
    assert(nativeRegister(conflictShortcut, () => {}), 'Review conflict shortcut is unavailable');
    await configure(true, conflictShortcut);
    assert.equal(status, 'error'); assert(failure?.includes('already in use'));
    assert(!globalShortcut.isRegistered(shortcut), 'Changing shortcuts releases the previous registration');
    press(); assert.equal(panel.getWindow(), null, 'Stale registration callbacks cannot reopen the panel');
    await configure(false);
    assert.equal(status, 'disabled');
    assert(globalShortcut.isRegistered(conflictShortcut), 'Disabling must not unregister another owner');
    globalShortcut.unregister(conflictShortcut);
    await configure(true);
    callbacks.get(shortcut)!();
    await service.dispose(); await service.dispose();
    assert(!globalShortcut.isRegistered(shortcut));
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    console.log(JSON.stringify({ passed: true, checks: ['native global registration without a main renderer', 'press-toggle lifecycle', 'rapid tap while loading', 'blur then reopen', 'shortcut conflict', 'reconfiguration', 'stale callback ignored', 'disabled shortcut releases resources', 'idempotent disposal'], excluded: ['physical key injection', 'foreground game interaction', 'renderer content (separate UI review)'] }));
  } finally { await service.dispose(); globalShortcut.unregister(conflictShortcut); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
