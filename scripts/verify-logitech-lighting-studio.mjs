import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'logitech-lighting-studio');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-logitech-lighting-studio-'));

app.setName('switchboard-logitech-lighting-studio-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error('Logitech Lighting Studio verification failed.', error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await openG502(window);
  const original = (await mouseSnapshot(window)).capabilities.lighting;
  if (!original) throw new Error('The G502 X Plus fixture has no lighting capability.');
  const report = { off: [], static: [], interactions: {} };

  if (process.argv.includes('--off-option-only')) {
    await verifyLightingOffOption(window);
    console.log('Logitech lighting Off option verification passed.');
    app.quit();
    return;
  }

  await verifyLightingOffOption(window);
  await setControl(window, { type: 'lighting-enabled', enabled: true });
  await setControl(window, { type: 'lighting-effect', effectId: 'static' });
  if (process.argv.includes('--interaction-only')) {
    for (const viewport of [
      { width: 1080, height: 720 },
      { width: 1420, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await setViewport(window, viewport);
      await revealStudio(window);
      await verifyColorPopoverPersistence(window);
    }
    console.log('Device popover interaction verification passed.');
    app.quit();
    return;
  }
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await setViewport(window, viewport);
    await setControl(window, { type: 'lighting-enabled', enabled: false });
    await revealStudio(window);
    const offMetrics = await studioMetrics(window);
    assertStudio(offMetrics, `${viewport.width}x${viewport.height} Off`);
    const offFilename = `${viewport.width}x${viewport.height}-off.png`;
    await capture(window, offFilename);
    report.off.push({ viewport, filename: offFilename, metrics: offMetrics });

    await setControl(window, { type: 'lighting-effect', effectId: 'static' });
    await revealStudio(window);
    const metrics = await studioMetrics(window);
    assertStudio(metrics, `${viewport.width}x${viewport.height}`);
    const filename = `${viewport.width}x${viewport.height}-static.png`;
    await capture(window, filename);
    report.static.push({ viewport, filename, metrics });
  }

  await setViewport(window, { width: 1420, height: 900 });
  await setControl(window, { type: 'lighting-effect', effectId: 'wave' });
  await setControl(window, { type: 'lighting-speed', speed: 78 });
  await setControl(window, { type: 'lighting-direction', direction: 'left' });
  await waitFor(window, `(() => {
    const active = document.querySelector('[aria-label="Lighting effect"]');
    const speed = document.querySelector('[aria-label="Lighting effect speed"]');
    const direction = document.querySelector('[aria-label="Lighting effect direction"]');
    return active?.textContent?.trim() === 'Color wave'
      && speed?.getAttribute('aria-valuenow') === '78'
      && direction?.textContent?.trim() === 'Left'
      && !document.querySelector('.lighting-zones');
  })()`);
  await revealStudio(window);
  report.interactions.wave = await studioMetrics(window);
  await capture(window, '1420x900-wave-left.png');

  await setControl(window, { type: 'lighting-effect', effectId: 'static' });
  await setControl(window, { type: 'lighting-zone-color', zoneId: 'zone-2', color: '#12abef' });
  await setControl(window, { type: 'lighting-color', color: '#f472b6' });
  await setControl(window, { type: 'lighting-brightness', brightness: 64 });
  const changed = await mouseSnapshot(window);
  if (changed.capabilities.lighting?.zones?.find((zone) => zone.id === 'zone-2')?.color.toLowerCase() !== '#12abef') {
    throw new Error('The confirmed zone color did not reach canonical renderer state.');
  }
  if (changed.capabilities.lighting?.color?.toLowerCase() !== '#f472b6' || changed.capabilities.lighting?.brightness !== 64) {
    throw new Error('The confirmed global lighting controls did not reach canonical renderer state.');
  }
  await revealStudio(window);
  report.interactions.zone = await studioMetrics(window);
  await capture(window, '1420x900-static-zone-edited.png');

  window.webContents.reload();
  await waitForLoad(window);
  await openG502(window);
  const refreshed = await mouseSnapshot(window);
  if (refreshed.capabilities.lighting?.brightness !== 64 || refreshed.capabilities.lighting?.color?.toLowerCase() !== '#f472b6') {
    throw new Error('Lighting state did not survive a renderer refresh round trip.');
  }

  await setControl(window, { type: 'lighting-effect', effectId: original.activeEffectId });
  if (original.color) await setControl(window, { type: 'lighting-color', color: original.color });
  if (original.brightness !== undefined) {
    await setControl(window, { type: 'lighting-brightness', brightness: original.brightness });
  }
  if (original.speed !== undefined) await setControl(window, { type: 'lighting-speed', speed: original.speed });
  if (original.direction) await setControl(window, { type: 'lighting-direction', direction: original.direction });
  for (const zone of original.zones ?? []) {
    await setControl(window, { type: 'lighting-zone-color', zoneId: zone.id, color: zone.color });
  }
  await setControl(window, { type: 'lighting-enabled', enabled: original.enabled });

  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, ...report }, null, 2));
  app.quit();
}

async function verifyLightingOffOption(window) {
  await revealStudio(window);
  const opened = await evaluate(window, `(() => {
    const trigger = document.querySelector('[aria-label="Lighting effect"]');
    trigger?.click();
    return Boolean(trigger);
  })()`);
  if (!opened) throw new Error('The lighting effect selector was not found.');
  await waitFor(window, `Boolean(document.querySelector('[role="listbox"]'))`, 2_000);
  const options = await evaluate(window, `[...document.querySelectorAll('[role="option"]')]
    .map((option) => option.textContent?.trim())
    .filter(Boolean)`);
  if (!options.includes('Off')) {
    throw new Error(`The Logitech lighting effect selector does not expose Off: ${JSON.stringify(options)}`);
  }
  const selectedOff = await evaluate(window, `(() => {
    const option = [...document.querySelectorAll('[role="option"]')]
      .find((candidate) => candidate.textContent?.trim() === 'Off');
    option?.click();
    return Boolean(option);
  })()`);
  if (!selectedOff) throw new Error('The Logitech lighting Off option could not be selected.');
  await waitFor(window, `(async () => {
    const snapshot = await window.switchboard.getSnapshot();
    const lighting = snapshot.devices.find((device) => device.displayName === 'G502 X Plus')?.capabilities.lighting;
    const trigger = document.querySelector('[aria-label="Lighting effect"]');
    const power = document.querySelector('[aria-label="Mouse lighting"]');
    return lighting?.enabled === false
      && trigger?.textContent?.trim() === 'Off'
      && trigger?.hasAttribute('disabled') === false
      && power?.getAttribute('aria-checked') === 'false';
  })()`);

  await evaluate(window, `document.querySelector('[aria-label="Lighting effect"]')?.click()`);
  await waitFor(window, `Boolean(document.querySelector('[role="listbox"]'))`, 2_000);
  const selectedStatic = await evaluate(window, `(() => {
    const option = [...document.querySelectorAll('[role="option"]')]
      .find((candidate) => candidate.textContent?.trim() === 'Static');
    option?.click();
    return Boolean(option);
  })()`);
  if (!selectedStatic) throw new Error('Static could not be selected after turning Logitech lighting off.');
  await waitFor(window, `(async () => {
    const snapshot = await window.switchboard.getSnapshot();
    const lighting = snapshot.devices.find((device) => device.displayName === 'G502 X Plus')?.capabilities.lighting;
    return lighting?.enabled === true
      && lighting.activeEffectId === 'static'
      && document.querySelector('[aria-label="Lighting effect"]')?.textContent?.trim() === 'Static';
  })()`);

  await evaluate(window, `document.querySelector('[aria-label="Lighting effect"]')?.focus()`);
  pressKey(window, 'Enter');
  await waitFor(window, `Boolean(document.querySelector('[role="listbox"]'))`, 2_000);
  pressKey(window, 'Escape');
  await waitFor(window, `!document.querySelector('[role="listbox"]')
    && document.activeElement?.getAttribute('aria-label') === 'Lighting effect'`, 2_000);
}

async function verifyColorPopoverPersistence(window) {
  await waitFor(window, `Boolean(document.querySelector('.lighting-color-trigger:not(:disabled)'))`);
  await delay(150);
  await evaluate(window, `document.querySelector('.lighting-color-trigger').click()`);
  await waitFor(window, `Boolean(document.querySelector('.color-picker input[aria-label="HEX color"]'))`);

  const mouse = await mouseSnapshot(window);
  const nextColor = mouse.capabilities.lighting?.color?.toLowerCase() === '#12abef' ? '#f472b6' : '#12abef';
  const entered = await evaluate(window, `(() => {
    const input = document.querySelector('.color-picker input[aria-label="HEX color"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!input || !setter) return false;
    input.focus();
    setter.call(input, ${JSON.stringify(nextColor.slice(1).toUpperCase())});
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(nextColor.slice(1).toUpperCase())} }));
    return true;
  })()`);
  if (!entered) throw new Error('The lighting HEX input could not be edited.');
  await paint(window);
  await evaluate(window, `document.querySelector('.color-picker input[aria-label="HEX color"]')?.blur()`);
  await waitFor(window, `(async () => {
    const snapshot = await window.switchboard.getSnapshot();
    return snapshot.devices.find((device) => device.displayName === 'G502 X Plus')
      ?.capabilities.lighting?.color?.toLowerCase() === ${JSON.stringify(nextColor.toLowerCase())};
  })()`);
  await delay(100);

  const result = await evaluate(window, `({
    popoverOpen: Boolean(document.querySelector('.color-picker')),
    focusOnBackButton: document.activeElement?.classList.contains('device-workbench__back') ?? false,
  })`);
  if (!result.popoverOpen || result.focusOnBackButton) {
    throw new Error(`The lighting color popover did not survive its canonical state update: ${JSON.stringify(result)}`);
  }
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitFor(window, `!document.querySelector('.color-picker')`);
}

async function setControl(window, change) {
  const mouse = await mouseSnapshot(window);
  await evaluate(window, `window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change })})`);
}

async function mouseSnapshot(window) {
  const snapshot = await evaluate(window, 'window.switchboard.getSnapshot()');
  const mouse = snapshot.devices.find((device) => device.displayName === 'G502 X Plus');
  if (!mouse) throw new Error('The G502 X Plus fixture was not found.');
  return mouse;
}

async function openG502(window) {
  if (await evaluate(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'G502 X Plus'`)) return;
  await waitFor(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Devices')`);
  await clickButton(window, 'Devices');
  if (await evaluate(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'All devices')`)) {
    await clickButton(window, 'All devices');
  }
  await waitFor(window, `Boolean(document.querySelector('.device-gallery'))`);
  const opened = await evaluate(window, `(() => {
    const target = [...document.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label')?.includes('G502 X Plus'));
    target?.click();
    return Boolean(target);
  })()`);
  if (!opened) throw new Error('The G502 X Plus gallery item was not found.');
  await waitFor(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'G502 X Plus'`);
}

async function revealStudio(window) {
  await waitFor(window, `Boolean(document.querySelector('.lighting-editor'))`);
  await evaluate(window, `document.querySelector('.lighting-editor')?.scrollIntoView({ block: 'center' })`);
  await paint(window);
}

function studioMetrics(window) {
  return evaluate(window, `(() => {
    const studio = document.querySelector('.lighting-editor');
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    const rect = studio?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      workspaceWidth: viewport?.clientWidth ?? null,
      workspaceScrollWidth: viewport?.scrollWidth ?? null,
      studio: rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      effectControl: Boolean(document.querySelector('[aria-label="Lighting effect"]')),
      zones: document.querySelectorAll('.lighting-zone').length,
      horizontalOverflow: studio ? studio.scrollWidth > studio.clientWidth : null,
    };
  })()`);
}

function assertStudio(metrics, label) {
  if (!metrics.studio || metrics.studio.top < 0 || metrics.studio.bottom > metrics.viewport.height + 1) {
    throw new Error(`${label} lighting editor is not fully reachable in the review viewport: ${JSON.stringify(metrics)}`);
  }
  if (metrics.documentWidth > metrics.viewport.width || metrics.horizontalOverflow) {
    throw new Error(`${label} lighting editor has horizontal overflow.`);
  }
  if (metrics.workspaceWidth !== null && metrics.workspaceScrollWidth > metrics.workspaceWidth) {
    throw new Error(`${label} workspace has horizontal overflow.`);
  }
  if (!metrics.effectControl || metrics.zones !== 8) {
    throw new Error(`${label} did not expose the effect selector and eight reported zones.`);
  }
}

async function setViewport(window, viewport) {
  if (window.isMaximized()) {
    window.unmaximize();
    const deadline = Date.now() + 5_000;
    while (window.isMaximized() && Date.now() < deadline) await delay(40);
    if (window.isMaximized()) throw new Error('The native review window did not leave its maximized state.');
  }
  window.setContentSize(viewport.width, viewport.height, false);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const [width, height] = window.getContentSize();
    if (width === viewport.width && Math.abs(height - viewport.height) <= 2) return;
    await delay(40);
  }
  const renderer = await evaluate(window, `({ width: innerWidth, height: innerHeight, devicePixelRatio })`);
  throw new Error(`Viewport resize failed: ${JSON.stringify({
    requested: viewport,
    renderer,
    bounds: window.getBounds(),
    contentSize: window.getContentSize(),
    maximized: window.isMaximized(),
    fullScreen: window.isFullScreen(),
    resizable: window.isResizable(),
  })}`);
}

async function capture(window, filename) {
  const image = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, filename), image.toPNG());
}

async function clickButton(window, text) {
  const clicked = await evaluate(window, `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)});
    button?.click();
    return Boolean(button);
  })()`);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await delay(40);
  }
  throw new Error('Switchboard did not create a window.');
}

async function waitForLoad(window) {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timer = setTimeout(() => rejectLoad(new Error('Renderer load timed out.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolveLoad();
    });
  });
}

async function waitFor(window, expression, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(window, expression)) return;
    await delay(40);
  }
  throw new Error(`Condition timed out: ${expression}`);
}

async function paint(window) {
  window.webContents.invalidate();
  await evaluate(window, 'new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))');
  await delay(80);
}

function evaluate(window, expression) {
  return window.webContents.executeJavaScript(expression, true);
}

function pressKey(window, keyCode) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
