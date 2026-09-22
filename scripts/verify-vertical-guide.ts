// Bundle with Bun, external:electron, and run with Electron. Never shows UI.
import assert from 'node:assert/strict';
import { app, BrowserWindow, screen } from 'electron';
import { VerticalGuideWindow } from '../src/main/vertical-guide-window';
import { setupPreferencesSchema } from '../src/shared/contracts';


process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
app.on('window-all-closed', () => {});
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = () => { throw Error('Review cannot show windows.'); };
let closed = 0;
const guide = new VerticalGuideWindow(() => closed++);
const base = { ...setupPreferencesSchema.parse({}).verticalGuide, enabled: true };
const window = () => BrowserWindow.getAllWindows()[0]!;
const nativeIgnore = BrowserWindow.prototype.setIgnoreMouseEvents;
const nativeProtection = BrowserWindow.prototype.setContentProtection;
let ignored = false, protectedContent = false;
BrowserWindow.prototype.setIgnoreMouseEvents = function(ignore, ...args) { ignored = ignore; nativeIgnore.call(this, ignore, ...args); };
BrowserWindow.prototype.setContentProtection = function(protect) { protectedContent = protect; nativeProtection.call(this, protect); };
const watchdog = setTimeout(() => app.exit(2), 20000);
void app.whenReady().then(async () => {
try {
  const listeners = screen.listenerCount('display-metrics-changed');
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  await guide.configure(base);
  assert.deepEqual(window().getContentBounds(), display.bounds);
  assert(ignored && protectedContent && !window().isFocusable() && !window().isVisible());
  const custom = { ...base, frame: { x: 80, y: 100, width: 600, height: 1000 }, dim: 20, color: 'lime' as const };
  await guide.configure(custom);
  const confirmed = guide.getLayout(custom);
  assert.deepEqual(confirmed.frame, custom.frame);
  window().webContents.setBackgroundThrottling(false);
  async function pixel(x: number, y: number) {
    await new Promise(resolve => setTimeout(resolve, 150));
    const screenshot = await window().webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    const size = screenshot.getSize();
    const bitmap = screenshot.toBitmap();
    const px = Math.floor(x * size.width / confirmed.display.width), py = Math.floor(y * size.height / confirmed.display.height);
    const offset = (py * size.width + px) * 4;
    return [...bitmap.subarray(offset, offset + 4)];
  }
  assert.deepEqual(await pixel(81, 101), [118, 250, 206, 255], 'Custom frame border must land on exact physical pixels.');
  assert.equal((await pixel(300, 300))[3], 0, 'Inside the frame must stay transparent.');
  assert(Math.abs((await pixel(10, 10))[3]! - 51) <= 1, 'Outside dimming must be 20%.');
  await guide.configure({ ...custom, dim: 0 });
  assert.equal((await pixel(10, 10))[3], 0, 'Zero dimming must be fully transparent.');
  await guide.configure({ ...custom, dim: 80 });
  assert(Math.abs((await pixel(10, 10))[3]! - 204) <= 1, 'Maximum dimming must be 80%.');
  await assert.rejects(guide.configure({ ...custom, frame: { ...custom.frame, width: 32768 } }), /beyond this display/);
  assert.equal(BrowserWindow.getAllWindows().length, 1, 'Rejected geometry must preserve the confirmed guide.');
  await guide.configure(base);
  // Simulated topology payload, real Electron bounds update and disposal.
  const getDisplays = screen.getAllDisplays;
  screen.getAllDisplays = () => [{ ...display, bounds: { x: -1080, y: 0, width: 1080, height: 1920 } }];
  screen.emit('display-metrics-changed');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(guide.getLayout(base).frame.width * 16, guide.getLayout(base).frame.height * 9);
  screen.getAllDisplays = () => [];
  screen.emit('display-removed');
  assert.equal(BrowserWindow.getAllWindows().length, 0);
  assert.equal(closed, 1);
  screen.getAllDisplays = getDisplays;
  for (let i = 0; i < 3; i++) { await guide.configure(base); await guide.configure({ ...base, enabled: false }); }
  assert.equal(screen.listenerCount('display-metrics-changed'), listeners);
  await guide.configure(base);
  const crashed = window();
  const gone = new Promise(resolve => crashed.webContents.once('render-process-gone', resolve));
  crashed.webContents.forcefullyCrashRenderer(); await gone;
  assert.equal(BrowserWindow.getAllWindows().length, 0);
  assert.equal(closed, 2);
  assert.equal(screen.listenerCount('display-metrics-changed'), listeners);
  await guide.configure(base); guide.shutdown(); guide.shutdown();
  await assert.rejects(guide.configure(base), /shutting down/);
  assert.equal(BrowserWindow.getAllWindows().length, 0);
  console.log('PASS: native display bounds, exact physical-pixel border, clear interior, 0/20/80% outside dimming, rejected geometry, input/protection configuration, simulated display changes, repeated lifecycle, renderer crash, shutdown cleanup. All windows hidden.');
  clearTimeout(watchdog); app.exit(0);
} catch (error) { console.error(error); guide.shutdown(); clearTimeout(watchdog); app.exit(1); }
});
