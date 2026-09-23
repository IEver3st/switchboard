// bun build ./scripts/verify-quick-shortcut-startup.ts --target=node --format=cjs --packages=external --outfile=./.switchboard/verify-quick-shortcut-startup.cjs
// Run the bundle with Electron. No windows or physical input are used.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, globalShortcut } from 'electron';
import { AppController } from '../src/main/controller';
import { DesktopControlsService } from '../src/main/services/desktop-controls';
import { StateStore } from '../src/main/services/state-store';

const register = globalShortcut.register.bind(globalShortcut);
const callbacks = new Map<string, () => void>();
globalShortcut.register = (key, callback) => {
  const accepted = register(key, callback);
  if (accepted) callbacks.set(key, callback);
  return accepted;
};
const key = 'Control+Alt+Shift+F24';
const watchdog = setTimeout(() => app.exit(2), 15_000);
void app.whenReady().then(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'switchboard-shortcut-startup-'));
  const path = join(directory, 'state.json');
  try {
    const seed = new StateStore(path);
    await seed.load();
    seed.update(state => { state.setup.preferences.quickControlsEnabled = true; state.setup.preferences.quickShortcut = key; });
    await seed.flush();
    for (const [cycle, enabled] of [true, true, false].entries()) {
      const store = new StateStore(path);
      let toggles = 0;
      let releaseStartup!: () => void;
      let reachedStartup!: () => void;
      const startupBlocked = new Promise<void>(resolve => { releaseStartup = resolve; });
      const startupReached = new Promise<void>(resolve => { reachedStartup = resolve; });
      const desktopControls = new DesktopControlsService({
        toggleQuick: () => { toggles++; }, closeQuick: () => {}, applications: async () => {},
        status: (state, error) => store.update(draft => {
          draft.setup.runtime.desktopState = state; draft.setup.runtime.desktopError = error;
        }, { persist: false }),
      });
      // Exercise the real controller startup methods with unrelated hardware/update
      // services isolated. The update gate is never released until teardown.
      const controller = Object.assign(Object.create(AppController.prototype), {
        store, desktopControls, disposed: false, initialization: null, snapshotPreparation: null,
        devices: { removeLegacyFixtures() {} }, syncDeveloperDiagnostics: async () => {},
        performance: { start() {} },
        appUpdates: { initialize: () => { reachedStartup(); return startupBlocked; } },
      });
      const startup = controller.initialize();
      try {
        await startupReached;
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(globalShortcut.isRegistered(key), enabled, 'Saved shortcut must be ready before background startup finishes or the panel is opened.');
        assert.equal(BrowserWindow.getAllWindows().length, 0);
        if (enabled) {
          callbacks.get(key)!();
          callbacks.get(key)!();
          assert.equal(toggles, 2, 'First shortcut press must reach the panel toggle.');
          assert.equal(store.get().setup.runtime.desktopState, 'ready');
        }
      } finally {
        controller.disposed = true;
        releaseStartup();
        await startup;
        await desktopControls.dispose();
        assert.equal(globalShortcut.isRegistered(key), false, 'Shutdown must release the shortcut.');
      }
      // Keep the first restart enabled, then verify a persisted opt-out.
      if (cycle === 1) store.update(state => { state.setup.preferences.quickControlsEnabled = false; });
      await store.flush();
    }
    console.log('PASS: saved shortcut registered before blocked startup, first-press callback, restart, disabled preference, and shutdown cleanup. No windows or physical key injection.');
  } finally {
    globalShortcut.unregisterAll();
    globalShortcut.register = register;
    await rm(directory, { recursive: true, force: true });
  }
}).then(() => { clearTimeout(watchdog); app.exit(0); }, error => { console.error(error); clearTimeout(watchdog); app.exit(1); });
