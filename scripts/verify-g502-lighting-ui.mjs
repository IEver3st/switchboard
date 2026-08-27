import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'g502-lighting-state');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-g502-lighting-review-'));

app.setName('switchboard-g502-lighting-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error('G502 lighting UI verification failed.', error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await openG502(window);
  const original = await mouseSnapshot(window);
  const report = { gallery: [], states: [] };

  await setLighting(
    window,
    false,
    original.capabilities.lighting?.color ?? '#ff1744',
    original.capabilities.lighting?.brightness ?? 100,
  );
  await openGallery(window);
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await setViewport(window, viewport);
    await openGallery(window);
    await waitForRender(
      window,
      '.device-gallery',
      false,
      original.capabilities.lighting?.color ?? '#ff1744',
      original.capabilities.lighting?.brightness ?? 100,
    );
    await paint(window);
    const metrics = await layoutMetrics(window, '.device-gallery');
    assertNoHorizontalOverflow(metrics, `${viewport.width}x${viewport.height} gallery`);
    const filename = `${viewport.width}x${viewport.height}-gallery-off.png`;
    await capture(window, filename);
    report.gallery.push({ state: 'off', viewport, filename, metrics });
  }

  const cyanState = { enabled: true, color: '#00d8ff', brightness: 100 };
  await setLighting(window, cyanState.enabled, cyanState.color, cyanState.brightness);
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await setViewport(window, viewport);
    await openGallery(window);
    await waitForRender(window, '.device-gallery', cyanState.enabled, cyanState.color, cyanState.brightness);
    await paint(window);
    const metrics = await layoutMetrics(window, '.device-gallery');
    assertNoHorizontalOverflow(metrics, `${viewport.width}x${viewport.height} cyan gallery`);
    const filename = `${viewport.width}x${viewport.height}-gallery-cyan.png`;
    await capture(window, filename);
    report.gallery.push({ state: 'cyan', viewport, filename, metrics });
  }

  await setViewport(window, { width: 1420, height: 900 });
  await openG502(window);
  for (const state of [
    { name: 'off', enabled: false, color: '#ff1744', brightness: 75 },
    { name: 'red', enabled: true, color: '#ff1744', brightness: 100 },
    { name: 'red-dim', enabled: true, color: '#ff1744', brightness: 25 },
    { name: 'green', enabled: true, color: '#00ff00', brightness: 75 },
    { name: 'cyan', ...cyanState },
  ]) {
    await setLighting(window, state.enabled, state.color, state.brightness);
    await waitForRender(window, '.mouse-stage', state.enabled, state.color, state.brightness);
    await paint(window);
    const metrics = await layoutMetrics(window, '.mouse-stage');
    const pixels = await lightingPixelMetrics(window);
    assertNoHorizontalOverflow(metrics, `${state.name} workbench`);
    const filename = `1420x900-workbench-${state.name}.png`;
    await capture(window, filename);
    report.states.push({ ...state, filename, metrics, pixels });
  }

  const [off, red, redDim, green, cyan] = report.states;
  if (!off || !red || !redDim || !green || !cyan) throw new Error('Lighting state evidence was incomplete.');
  if (red.pixels.redDominant <= off.pixels.redDominant + 100) {
    throw new Error('The red canonical state did not materially recolor the mouse render.');
  }
  if (green.pixels.greenDominant <= off.pixels.greenDominant + 100) {
    throw new Error('The green canonical state did not materially recolor the mouse render.');
  }
  if (redDim.pixels.redMeanMaximum >= red.pixels.redMeanMaximum) {
    throw new Error('The lower canonical brightness did not dim the mouse render.');
  }
  if (cyan.pixels.saturated <= off.pixels.saturated + 100) {
    throw new Error('The cyan canonical state did not materially recolor the mouse render.');
  }

  await setLighting(
    window,
    original.capabilities.lighting?.enabled ?? false,
    original.capabilities.lighting?.color ?? '#ff1744',
    original.capabilities.lighting?.brightness ?? 100,
  );
  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, ...report }, null, 2));
  app.quit();
}

async function setLighting(window, enabled, color, brightness) {
  const mouse = await mouseSnapshot(window);
  await evaluate(window, `window.switchboard.setDeviceControl(${JSON.stringify({
    deviceId: mouse.id,
    change: { type: 'lighting-color', color },
  })})`);
  await evaluate(window, `window.switchboard.setDeviceControl(${JSON.stringify({
    deviceId: mouse.id,
    change: { type: 'lighting-brightness', brightness },
  })})`);
  await evaluate(window, `window.switchboard.setDeviceControl(${JSON.stringify({
    deviceId: mouse.id,
    change: { type: 'lighting-enabled', enabled },
  })})`);
}

async function mouseSnapshot(window) {
  const snapshot = await evaluate(window, 'window.switchboard.getSnapshot()');
  const mouse = snapshot.devices.find((device) => device.displayName === 'G502 X Plus');
  if (!mouse) throw new Error('The G502 X Plus fixture was not found.');
  return mouse;
}

async function openGallery(window) {
  await waitFor(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Devices')`);
  await clickButton(window, 'Devices');
  if (await evaluate(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'All devices')`)) {
    await clickButton(window, 'All devices');
  }
  await waitFor(window, `Boolean(document.querySelector('.device-gallery'))`);
}

async function openG502(window) {
  if (await evaluate(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'G502 X Plus'`)) return;
  await openGallery(window);
  const opened = await evaluate(window, `(() => {
    const target = [...document.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label')?.includes('G502 X Plus'));
    target?.click();
    return Boolean(target);
  })()`);
  if (!opened) throw new Error('The G502 X Plus gallery item was not found.');
  await waitFor(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'G502 X Plus'`);
}

async function waitForRender(window, scope, enabled, color, brightness) {
  const expectedColor = color?.toLowerCase();
  await waitFor(window, `(() => {
    const render = document.querySelector(${JSON.stringify(`${scope} .device-render`)});
    const canvas = render?.querySelector('canvas');
    return render?.dataset.assetKey === 'logitech-g502-x-plus-white'
      && render.dataset.lightingEnabled === ${JSON.stringify(String(enabled))}
      && (!${JSON.stringify(Boolean(expectedColor))} || render.dataset.lightingColor === ${JSON.stringify(expectedColor)})
      && render.dataset.lightingBrightness === ${JSON.stringify(String(brightness))}
      && canvas?.dataset.renderState === 'ready';
  })()`);
}

function layoutMetrics(window, scope) {
  return evaluate(window, `(() => {
    const scope = document.querySelector(${JSON.stringify(scope)});
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: viewport?.clientWidth ?? null,
      viewportScrollWidth: viewport?.scrollWidth ?? null,
      scopeVisible: Boolean(scope && scope.getBoundingClientRect().bottom > 0),
    };
  })()`);
}

function lightingPixelMetrics(window) {
  return evaluate(window, `(() => {
    const canvas = document.querySelector('.mouse-stage .device-render canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return null;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    let saturated = 0;
    let redDominant = 0;
    let greenDominant = 0;
    let redMaximumTotal = 0;
    let greenMaximumTotal = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3] <= 4) continue;
      visible += 1;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      if (maximum > 54 && maximum - minimum > 18 && (maximum - minimum) / maximum > 0.15) saturated += 1;
      if (red - Math.max(green, blue) > 28) {
        redDominant += 1;
        redMaximumTotal += maximum;
      }
      if (green - Math.max(red, blue) > 28) {
        greenDominant += 1;
        greenMaximumTotal += maximum;
      }
    }
    return {
      width: canvas.width,
      height: canvas.height,
      visible,
      saturated,
      redDominant,
      greenDominant,
      redMeanMaximum: redDominant > 0 ? redMaximumTotal / redDominant : 0,
      greenMeanMaximum: greenDominant > 0 ? greenMaximumTotal / greenDominant : 0,
    };
  })()`);
}

async function setViewport(window, viewport) {
  if (window.isMaximized()) window.unmaximize();
  window.setContentSize(viewport.width, viewport.height, false);
  await waitFor(window, `innerWidth === ${viewport.width} && Math.abs(innerHeight - ${viewport.height}) <= 2`, 5_000);
}

function assertNoHorizontalOverflow(metrics, label) {
  if (!metrics.scopeVisible) throw new Error(`${label} was outside the visible viewport.`);
  if (metrics.documentWidth > metrics.viewport.width) throw new Error(`${label} has document-level horizontal overflow.`);
  if (metrics.viewportWidth !== null && metrics.viewportScrollWidth > metrics.viewportWidth) {
    throw new Error(`${label} has workspace horizontal overflow.`);
  }
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
