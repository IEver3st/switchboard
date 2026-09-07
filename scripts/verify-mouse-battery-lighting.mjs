import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.switchboard', `battery-lighting-review-${Date.now()}`);
const profile = await mkdtemp(join(tmpdir(), 'switchboard-battery-lighting-'));
await mkdir(output, { recursive: true });
app.setName('switchboard-battery-lighting-review');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-prefers-reduced-motion');
app.setAppPath(root);
app.setPath('userData', profile);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
// Synchronous constructor event precedes loadFile/first render. Never show/focus.
app.on('browser-window-created', (_event, window) => {
  window.setPosition(-10000, -10000, false);
  window.setMinimumSize(1, 1);
  window.webContents.setBackgroundThrottling(false);
});
await import('../out/main/index.js');
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
const evaluate = (window, expression) => window.webContents.executeJavaScript(expression, true);

async function waitFor(window, expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await evaluate(window, expression)) return;
    await delay(50);
  }
  throw new Error(`Timed out: ${expression}`);
}
async function openMouse(window) {
  await waitFor(window, 'Boolean(window.switchboard)');
  if (await evaluate(window, `Boolean(document.querySelector('[aria-label="Battery lighting settings"]'))`)) return;
  await waitFor(window, `[...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Devices')`);
  await evaluate(window, `[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Devices').click()`);
  await delay(150);
  await evaluate(window, `[...document.querySelectorAll('button')].find(button => button.textContent?.trim() === 'All devices')?.click()`);
  await waitFor(window, `Boolean(document.querySelector('[aria-label*="G502 X Plus"]'))`);
  await evaluate(window, `document.querySelector('[aria-label*="G502 X Plus"]').click()`);
  await waitFor(window, `Boolean(document.querySelector('[aria-label="Battery lighting settings"]'))`);
}
async function setNumber(window, label, value) {
  await waitFor(window, `document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)})?.disabled === false`);
  await evaluate(window, `(() => {
    const input = document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)});
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(String(value))} }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await delay(150);
  console.log('input', label, await evaluate(window, `({ active: document.activeElement?.getAttribute('aria-label'), value: document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}).value })`));
  await evaluate(window, `document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)}).dispatchEvent(new FocusEvent('focusout', { bubbles: true }))`);
  await paint(window);
}
async function paint(window) {
  window.webContents.invalidate();
  await delay(150);
}
async function capture(window, name) {
  await paint(window);
  if (window.isVisible()) throw new Error('Review window must remain hidden');
  const png = await window.webContents.capturePage();
  if (png.isEmpty()) throw new Error('Empty native capture');
  await writeFile(join(output, `${name}.png`), png.toPNG());
}
async function setViewport(window, width, height) {
  window.setContentSize(width, height, false);
  // Windows can include the hidden title-bar inset in offscreen DPI conversion.
  // Correct against measured renderer dimensions, without ever showing the window.
  for (let attempt = 0; attempt < 12; attempt++) {
    await delay(150);
    const size = await evaluate(window, '({ width: innerWidth, height: innerHeight })');
    if (Math.abs(size.width - width) <= 1 && Math.abs(size.height - height) <= 1) return;
    const bounds = window.getBounds();
    window.setBounds({ ...bounds, width: bounds.width + width - size.width, height: bounds.height + height - size.height }, false);
  }
  throw new Error('Could not size the hidden native renderer');
}

void app.whenReady().then(async () => {
  let window;
  for (let i = 0; i < 300; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoading()) break;
    await delay(50);
  }
  if (!window) throw new Error('No review window');
  window.setMinimumSize(1, 1);
  await waitFor(window, 'Boolean(window.switchboard)');
  await evaluate(window, 'window.switchboard.updateSettings({ uiScalePercent: 100, onboardingCompleted: true })');
  await openMouse(window);
  const mouseId = await evaluate(window, `(async () => (await window.switchboard.getSnapshot()).devices.find(device => device.kind === 'mouse').id)()`);
  const report = { output, profile, sizes: [], interactions: [], proof: 'Hidden native Electron with fixture hardware; no physical device writes.' };
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    await setViewport(window, width, height);
    await capture(window, `${width}x${height}-mouse`);
    await evaluate(window, `document.querySelector('[aria-label="Battery lighting settings"]').click()`);
    await waitFor(window, `Boolean(document.querySelector('.mouse-battery-lighting__popover'))`);
    const metrics = await evaluate(window, `(() => {
      const rect = document.querySelector('.mouse-battery-lighting__popover').getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        overflow: document.documentElement.scrollWidth > innerWidth };
    })()`);
    if (metrics.overflow || metrics.left < 0 || metrics.top < 0 || metrics.right > metrics.width + 1 || metrics.bottom > metrics.height + 1) {
      throw new Error(`Battery settings overflow: ${JSON.stringify(metrics)}`);
    }
    await capture(window, `${width}x${height}-settings`);
    report.sizes.push(metrics);
    console.log('viewport', metrics);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await waitFor(window, `!document.querySelector('.mouse-battery-lighting__popover')`);
  }
  await setViewport(window, 1080, 720);
  await evaluate(window, `document.querySelector('[aria-label="Battery lighting settings"]').click()`);
  await waitFor(window, `Boolean(document.querySelector('.mouse-battery-lighting__popover'))`);
  await setNumber(window, 'Warn at or below (%)', 25);
  await setNumber(window, 'Repeat every (minutes)', 7);
  await setNumber(window, 'Turn off at or below (%)', 8);
  const saved = await evaluate(window, `(async () => (await window.switchboard.getSnapshot()).settings.mouseBatteryLighting[${JSON.stringify(mouseId)}])()`);
  if (saved.warningPercentage !== 25 || saved.flashIntervalMinutes !== 7 || saved.cutoffPercentage !== 8) throw new Error(`Settings not saved: ${JSON.stringify(saved)}`);
  await setNumber(window, 'Turn off at or below (%)', 101);
  const rejected = await evaluate(window, `document.querySelector('[aria-label="Turn off at or below (%)"]').value`);
  if (rejected !== '8') throw new Error('Invalid cutoff was not restored');
  for (const id of ['mouse-battery-flash', 'mouse-battery-cutoff']) {
    await evaluate(window, `document.getElementById(${JSON.stringify(id)}).click()`);
    await waitFor(window, `document.getElementById(${JSON.stringify(id)}).getAttribute('aria-checked') === 'false'`);
    await delay(100);
  }
  await waitFor(window, `[...document.querySelectorAll('.mouse-battery-lighting__popover input')].every(input => input.disabled)`);
  await capture(window, '1080x720-disabled');
  for (const id of ['mouse-battery-flash', 'mouse-battery-cutoff']) {
    await evaluate(window, `document.getElementById(${JSON.stringify(id)}).click()`);
    await waitFor(window, `document.getElementById(${JSON.stringify(id)}).getAttribute('aria-checked') === 'true'`);
    await delay(100);
  }
  window.webContents.reload();
  await delay(350);
  await openMouse(window);
  await evaluate(window, `document.querySelector('[aria-label="Battery lighting settings"]').click()`);
  await waitFor(window, `document.querySelector('[aria-label="Turn off at or below (%)"]')?.value === '8'`);
  await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evaluate(window, `document.querySelector('[aria-label="Warn at or below (%)"]').focus()`);
  await capture(window, '1080x720-reloaded-focus-reduced-motion');
  const disconnected = await evaluate(window, 'window.switchboard.getSnapshot()');
  disconnected.devices.find(device => device.id === mouseId).connected = false;
  window.webContents.send('system:snapshot-updated', disconnected);
  await delay(200);
  if (!await evaluate(window, `Boolean(document.querySelector('.mouse-battery-lighting__popover'))`)) {
    await evaluate(window, `document.querySelector('[aria-label="Battery lighting settings"]').click()`);
  }
  await waitFor(window, `document.querySelector('[aria-label="Warn at or below (%)"]')?.disabled === true`);
  await capture(window, '1080x720-disconnected');
  disconnected.devices.find(device => device.id === mouseId).connected = true;
  const lighting = disconnected.devices.find(device => device.id === mouseId).capabilities.lighting;
  lighting.batteryStatus = 'error';
  lighting.batteryStatusReason = 'Battery lighting could not be applied: mouse did not acknowledge the command.';
  window.webContents.send('system:snapshot-updated', disconnected);
  await delay(200);
  if (!await evaluate(window, `Boolean(document.querySelector('.mouse-battery-lighting__popover'))`)) {
    await evaluate(window, `document.querySelector('[aria-label="Battery lighting settings"]').click()`);
  }
  await waitFor(window, `document.querySelector('.mouse-battery-lighting__popover')?.textContent.includes('did not acknowledge')`);
  await capture(window, '1080x720-command-error');
  const persisted = JSON.parse(await readFile(join(profile, 'switchboard-state.json'), 'utf8'));
  if (persisted.settings.mouseBatteryLighting[mouseId]?.cutoffPercentage !== 8) throw new Error('Preferences not written to disk');
  report.interactions.push('thresholds + interval saved', 'invalid cutoff rejected', 'independent toggles', 'renderer reload + disk persistence', 'disconnected and error snapshot fixtures', 'focus + reduced motion');
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  app.quit();
}).catch(async error => {
  console.error(error);
  const window = BrowserWindow.getAllWindows()[0];
  if (window) {
    console.log('window', window.getBounds(), window.getContentSize(), await evaluate(window, '({width:innerWidth,height:innerHeight,ratio:devicePixelRatio})'));
    console.log(await evaluate(window, 'document.body.innerText.slice(0, 5000)'));
    await capture(window, 'failed');
  }
  console.log(output);
  app.exit(1);
});
