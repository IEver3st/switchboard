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
  const report = { static: [], interactions: {} };

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
    const active = document.querySelector('.lighting-effect-option[data-active="true"]');
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
  if (changed.capabilities.lighting?.zones?.find((zone) => zone.id === 'zone-2')?.color !== '#12abef') {
    throw new Error('The confirmed zone color did not reach canonical renderer state.');
  }
  if (changed.capabilities.lighting?.color !== '#f472b6' || changed.capabilities.lighting?.brightness !== 64) {
    throw new Error('The confirmed global lighting controls did not reach canonical renderer state.');
  }
  await revealStudio(window);
  report.interactions.zone = await studioMetrics(window);
  await capture(window, '1420x900-static-zone-edited.png');

  window.webContents.reload();
  await waitForLoad(window);
  await openG502(window);
  const refreshed = await mouseSnapshot(window);
  if (refreshed.capabilities.lighting?.brightness !== 64 || refreshed.capabilities.lighting?.color !== '#f472b6') {
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

async function verifyColorPopoverPersistence(window) {
  await waitFor(window, `Boolean(document.querySelector('.lighting-color-trigger:not(:disabled)'))`);
  await delay(150);
  await evaluate(window, `document.querySelector('.lighting-color-trigger').click()`);
  await waitFor(window, `Boolean(document.querySelector('.color-picker input[aria-label="HEX color"]'))`);

  const mouse = await mouseSnapshot(window);
  const nextColor = mouse.capabilities.lighting?.color?.toLowerCase() === '#12abef' ? '#f472b6' : '#12abef';
  await evaluate(window, `(() => {
    const input = document.querySelector('.color-picker input[aria-label="HEX color"]');
    input.focus();
    input.select();
  })()`);
  window.webContents.insertText(nextColor);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await waitFor(window, `(async () => {
    const snapshot = await window.switchboard.getSnapshot();
    return snapshot.devices.find((device) => device.displayName === 'G502 X Plus')
      ?.capabilities.lighting?.color === ${JSON.stringify(nextColor)};
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
  await waitFor(window, `Boolean(document.querySelector('.lighting-studio'))`);
  await evaluate(window, `document.querySelector('.lighting-studio')?.scrollIntoView({ block: 'center' })`);
  await paint(window);
}

function studioMetrics(window) {
  return evaluate(window, `(() => {
    const studio = document.querySelector('.lighting-studio');
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    const rect = studio?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      workspaceWidth: viewport?.clientWidth ?? null,
      workspaceScrollWidth: viewport?.scrollWidth ?? null,
      studio: rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      effects: document.querySelectorAll('.lighting-effect-option').length,
      zones: document.querySelectorAll('.lighting-zone').length,
      horizontalOverflow: studio ? studio.scrollWidth > studio.clientWidth : null,
    };
  })()`);
}

function assertStudio(metrics, label) {
  if (!metrics.studio || metrics.studio.top < 0 || metrics.studio.bottom > metrics.viewport.height + 1) {
    throw new Error(`${label} Lighting Studio is not fully reachable in the review viewport: ${JSON.stringify(metrics)}`);
  }
  if (metrics.documentWidth > metrics.viewport.width || metrics.horizontalOverflow) {
    throw new Error(`${label} Lighting Studio has horizontal overflow.`);
  }
  if (metrics.workspaceWidth !== null && metrics.workspaceScrollWidth > metrics.workspaceWidth) {
    throw new Error(`${label} workspace has horizontal overflow.`);
  }
  if (metrics.effects !== 5 || metrics.zones !== 8) {
    throw new Error(`${label} did not expose the fixture's five effects and eight reported zones.`);
  }
}

async function setViewport(window, viewport) {
  if (window.isMaximized()) window.unmaximize();
  window.setContentSize(viewport.width, viewport.height, false);
  await waitFor(window, `innerWidth === ${viewport.width} && Math.abs(innerHeight - ${viewport.height}) <= 2`, 5_000);
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

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
