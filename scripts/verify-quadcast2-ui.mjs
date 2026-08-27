import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'quadcast2-state');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-quadcast2-review-'));
app.setName('switchboard-quadcast2-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error(error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await openQuadCast(window);
  const report = [];

  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(window, viewport);
    await openQuadCast(window);
    await paint(window);
    const metrics = await evaluate(window, `(() => {
      const root = document.documentElement;
      const main = document.querySelector('main');
      const lighting = document.querySelector('.microphone-hardware__lighting');
      const rect = lighting?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: root.scrollWidth > root.clientWidth || (main && main.scrollWidth > main.clientWidth),
        lightingVisible: Boolean(rect && rect.top < innerHeight && rect.bottom > 0),
        fixedRed: document.body.textContent.includes('Fixed red'),
        muteState: [...document.querySelectorAll('.microphone-state strong')].some((node) => node.textContent?.trim() === 'Live'),
        maintainedState: document.body.textContent.includes('Lighting maintained'),
        statusDetailVisible: document.body.textContent.includes('Physical touch sensor') || document.body.textContent.includes('No hardware readback'),
        redundantCopyVisible: document.body.textContent.includes('Hear your microphone without software delay.') || document.body.textContent.includes('Audio processing is configured'),
        heroBackground: getComputedStyle(document.querySelector('.device-workbench__hero')).backgroundColor,
        solidSpeedVisible: Boolean(document.querySelector('[role="slider"][aria-label="Effect speed"]')),
        colorInputs: document.querySelectorAll('input[type=color]').length,
        profiles: [...document.querySelectorAll('[aria-label="Lighting profile"] button')].map((node) => node.textContent.trim()),
      };
    })()`);
    const image = await window.webContents.capturePage();
    const name = `${viewport.width}x${viewport.height}-quadcast2.png`;
    await writeFile(join(outputDirectory, name), image.toPNG());
    report.push({ viewport, metrics, name });
  }

  for (const entry of report) {
    if (entry.metrics.horizontalOverflow) throw new Error(`Horizontal overflow at ${entry.viewport.width}x${entry.viewport.height}.`);
    if (!entry.metrics.lightingVisible) throw new Error(`Lighting controls are outside the viewport at ${entry.viewport.width}x${entry.viewport.height}.`);
    if (!entry.metrics.fixedRed || !entry.metrics.muteState || !entry.metrics.maintainedState) throw new Error(`Required hardware metadata is missing at ${entry.viewport.width}x${entry.viewport.height}.`);
    if (entry.metrics.statusDetailVisible || entry.metrics.redundantCopyVisible) throw new Error(`Secondary explanation leaked into the page at ${entry.viewport.width}x${entry.viewport.height}.`);
    if (entry.metrics.heroBackground !== 'rgba(0, 0, 0, 0)') throw new Error(`The product render still has a background panel at ${entry.viewport.width}x${entry.viewport.height}.`);
    if (entry.metrics.solidSpeedVisible) throw new Error(`Effect speed is visible for the solid pattern at ${entry.viewport.width}x${entry.viewport.height}.`);
  }

  if (window.isMaximized()) window.unmaximize();
  window.setContentSize(1420, 900, false);
  await waitForViewport(window, { width: 1420, height: 900 });
  await evaluate(window, `scrollTo(0, 0)`);
  await evaluate(window, `document.querySelector('.microphone-hardware__color')?.focus()`);
  await waitFor(window, `document.querySelector('[role="tooltip"]')?.textContent?.includes('color writes')`);
  const fixedRedTooltip = await evaluate(window, `document.querySelector('[role="tooltip"]')?.textContent?.trim()`);
  await evaluate(window, `document.querySelector('.microphone-hardware__color')?.blur()`);
  await evaluate(window, `scrollTo(0, 0)`);

  await clickButton(window, 'Breathe');
  await waitFor(window, `document.querySelector('[aria-label="Lighting profile"] button[data-state="on"]')?.textContent?.trim() === 'Breathe'`);
  const breathe = await evaluate(window, `(() => ({
    profile: document.querySelector('[aria-label="Lighting profile"] button[data-state="on"]')?.textContent?.trim(),
    pattern: document.querySelector('[aria-label="Lighting pattern"] button[data-state="on"]')?.textContent?.trim(),
    brightness: document.querySelector('[role="slider"][aria-label="Brightness"]')?.getAttribute('aria-valuenow'),
    speedVisible: Boolean(document.querySelector('[role="slider"][aria-label="Effect speed"]')),
  }))()`);
  if (!breathe.speedVisible) throw new Error('Effect speed was not shown for Breathe.');
  await evaluate(window, `scrollTo(0, 0)`);
  await paint(window);
  const breatheImage = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, '1420x900-breathe.png'), breatheImage.toPNG());

  await clickButton(window, 'Pulse');
  await waitFor(window, `document.querySelector('[aria-label="Lighting pattern"] button[data-state="on"]')?.textContent?.trim() === 'Pulse'`);
  const custom = await evaluate(window, `(() => ({
    profile: document.querySelector('[aria-label="Lighting profile"] button[data-state="on"]')?.textContent?.trim(),
    pattern: document.querySelector('[aria-label="Lighting pattern"] button[data-state="on"]')?.textContent?.trim(),
    speedVisible: Boolean(document.querySelector('[role="slider"][aria-label="Effect speed"]')),
    speedDisabled: document.querySelector('[role="slider"][aria-label="Effect speed"]')?.getAttribute('aria-disabled'),
  }))()`);
  if (!custom.speedVisible || custom.speedDisabled === 'true') throw new Error('Effect speed was not available for Pulse.');

  await clickSwitch(window, 'Lighting');
  await waitFor(window, `document.querySelector('[role="switch"][aria-label="Lighting"]')?.getAttribute('aria-checked') === 'false'`);
  const disabledState = await evaluate(window, `(() => ({
    brightness: document.querySelector('[role="slider"][aria-label="Brightness"]')?.closest('.ui-slider')?.hasAttribute('data-disabled'),
    speed: document.querySelector('[role="slider"][aria-label="Effect speed"]')?.closest('.ui-slider')?.hasAttribute('data-disabled'),
    patterns: [...document.querySelectorAll('[aria-label="Lighting pattern"] button')].every((button) => button.disabled),
  }))()`);
  if (!disabledState.brightness || !disabledState.speed || !disabledState.patterns) {
    throw new Error(`Lighting-off controls were not disabled consistently: ${JSON.stringify(disabledState)}`);
  }
  await evaluate(window, `scrollTo(0, 0)`);
  await paint(window);
  const disabledImage = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, '1420x900-lighting-off.png'), disabledImage.toPNG());
  await window.webContents.reload();
  await waitForLoad(window);
  await openQuadCast(window);
  const persistedOff = await evaluate(window, `document.querySelector('[role="switch"][aria-label="Lighting"]')?.getAttribute('aria-checked') === 'false'`);
  await clickSwitch(window, 'Lighting');
  await clickButton(window, 'Broadcast');

  const result = { report, interactions: { fixedRedTooltip, breathe, custom, disabledState, persistedOff } };
  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  app.quit();
}

async function openQuadCast(window) {
  if (await evaluate(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'QuadCast 2'`)) return;
  await waitFor(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Devices')`);
  await clickButton(window, 'Devices');
  await delay(40);
  if (await evaluate(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'All devices')`)) {
    await clickButton(window, 'All devices');
  }
  await waitFor(window, `[...document.querySelectorAll('button')].some((button) => button.getAttribute('aria-label')?.includes('QuadCast 2'))`);
  const open = await evaluate(window, `(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label')?.includes('QuadCast 2'));
    target?.click();
    return Boolean(target);
  })()`);
  if (!open) throw new Error('QuadCast 2 fixture was not found.');
  await waitFor(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'QuadCast 2'`);
}

async function clickButton(window, text) {
  const clicked = await evaluate(window, `(() => {
    const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === ${JSON.stringify(text)});
    button?.click();
    return Boolean(button);
  })()`);
  if (!clicked) throw new Error(`Button not found: ${text}`);
}

async function clickSwitch(window, label) {
  const clicked = await evaluate(window, `(() => {
    const control = document.querySelector('[role="switch"][aria-label=${JSON.stringify(label)}]');
    control?.click();
    return Boolean(control);
  })()`);
  if (!clicked) throw new Error(`Switch not found: ${label}`);
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

async function waitForViewport(window, viewport) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const size = await evaluate(window, `({ width: innerWidth, height: innerHeight })`);
    if (size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2) return;
    await delay(40);
  }
  throw new Error(`Viewport did not reach ${viewport.width}x${viewport.height}.`);
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
  await evaluate(window, `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await delay(80);
}

function evaluate(window, expression) {
  return window.webContents.executeJavaScript(expression, true);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
