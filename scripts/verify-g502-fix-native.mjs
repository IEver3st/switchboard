import { app, BrowserWindow } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'g502-fix-native');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-g502-review-'));
const currentStatePath = process.env.APPDATA
  ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json')
  : null;

if (currentStatePath) {
  const reviewStatePath = join(isolatedUserData, 'switchboard-state.json');
  await copyFile(currentStatePath, reviewStatePath);
  const reviewState = JSON.parse(await readFile(reviewStatePath, 'utf8'));
  reviewState.settings ??= {};
  reviewState.settings.deviceAppearanceOverrides ??= {};
  reviewState.settings.deviceAppearanceOverrides['logitech:receiver-c547'] = {
    variant: 'white',
    colorway: 'White',
  };
  await writeFile(reviewStatePath, `${JSON.stringify(reviewState, null, 2)}\n`);
}

app.setName('switchboard-g502-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';

const viewports = [
  { name: '1080x720', width: 1080, height: 720 },
  { name: '1420x900', width: 1420, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error('G502 native verification failed.', error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await window.webContents.insertCSS(`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    html { scroll-behavior: auto !important; }
  `);
  await openG502(window);
  await waitForCondition(window, `
    (() => {
      const render = document.querySelector('.mouse-stage .device-render');
      const canvas = render?.querySelector('canvas');
      const battery = document.querySelector('.device-workbench__battery');
      return render?.dataset.assetKey === 'logitech-g502-x-plus-white'
        && canvas?.dataset.renderState === 'ready'
        && battery
        && battery.getAttribute('data-charging') !== 'true';
    })()
  `, 'white render and discharging battery state');

  const snapshot = await window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
  const mouse = snapshot.devices.find((device) => device.displayName === 'G502 X Plus');
  if (!mouse) throw new Error('The canonical snapshot did not include G502 X Plus.');
  if (mouse.asset.key !== 'logitech-g502-x-plus-white') throw new Error(`Unexpected asset: ${mouse.asset.key}`);
  if (mouse.capabilities.battery?.charging !== false) throw new Error('The canonical battery state did not report discharging.');
  if (mouse.capabilities.reportRate?.writable) throw new Error('Polling rate was exposed as writable after the physical mouse rejected direct writes.');
  if (!mouse.capabilities.reportRate?.unavailableReason) throw new Error('Read-only polling rate did not explain its hardware limit.');
  if (!mouse.capabilities.dpi?.writable) throw new Error('Direct DPI control was unavailable.');

  const report = [];
  for (const viewport of viewports) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(window, viewport);
    await waitForPaint(window);
    const metrics = await measure(window);
    assertMetrics(metrics, viewport.name);
    const image = await window.webContents.capturePage();
    const filename = `${viewport.name}-g502-white.png`;
    await writeFile(join(outputDirectory, filename), image.toPNG());
    report.push({ viewport, filename, imageSize: image.getSize(), metrics });
  }

  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify({
    device: {
      id: mouse.id,
      asset: mouse.asset,
      variant: mouse.identity.variant,
      battery: mouse.capabilities.battery,
      dpi: mouse.capabilities.dpi.activeDpi,
      reportRate: mouse.capabilities.reportRate.value,
    },
    pollingRateReadOnlyReason: mouse.capabilities.reportRate.unavailableReason,
    captures: report,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, device: mouse.displayName, captures: report.length }, null, 2));
  app.quit();
}

async function openG502(window) {
  await waitForCondition(window, `Boolean(document.querySelector('.device-gallery'))`, 'device gallery');
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.getAttribute('aria-label')?.includes('G502 X Plus'));
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) throw new Error('Could not open the G502 X Plus workbench.');
  await waitForCondition(
    window,
    `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'G502 X Plus'`,
    'G502 X Plus workbench',
  );
}

async function measure(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
      };
      const callouts = [...document.querySelectorAll('[data-callout-id]')].map((callout) => {
        const id = callout.dataset.calloutId;
        const line = callout.querySelector('.mouse-callout__line');
        const hotspot = document.querySelector('[data-hotspot-id="' + CSS.escape(id) + '"]');
        const leader = hotspot.querySelector('.device-hotspot__leader');
        const dot = hotspot.querySelector('.device-hotspot__dot');
        const side = hotspot.dataset.calloutSide;
        const lineRect = rect(line);
        const leaderRect = rect(leader);
        const dotRect = rect(dot);
        const dotCenter = { x: (dotRect.left + dotRect.right) / 2, y: (dotRect.top + dotRect.bottom) / 2 };
        return {
          id,
          side,
          lineJoinGap: side === 'left'
            ? Math.abs(lineRect.right - leaderRect.left)
            : Math.abs(lineRect.left - leaderRect.right),
          hotspotJoinGap: side === 'left'
            ? Math.abs(leaderRect.right - dotCenter.x)
            : Math.abs(leaderRect.left - dotCenter.x),
          verticalGap: Math.abs(((lineRect.top + lineRect.bottom) / 2) - dotCenter.y),
        };
      });
      const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
      const render = document.querySelector('.mouse-stage .device-render');
      const canvas = render.querySelector('canvas');
      const battery = document.querySelector('.device-workbench__battery');
      return {
        innerWidth,
        innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: viewport?.clientWidth ?? null,
        viewportScrollWidth: viewport?.scrollWidth ?? null,
        assetKey: render.dataset.assetKey,
        variantSource: render.dataset.variantSource,
        renderState: canvas.dataset.renderState,
        batteryLabel: battery?.getAttribute('aria-label') ?? null,
        charging: battery?.getAttribute('data-charging') ?? null,
        callouts,
      };
    })()
  `);
}

function assertMetrics(metrics, viewportName) {
  if (metrics.documentWidth > metrics.innerWidth) throw new Error(`${viewportName} has document-level horizontal overflow.`);
  if (metrics.viewportWidth !== null && metrics.viewportScrollWidth > metrics.viewportWidth) {
    throw new Error(`${viewportName} has workbench horizontal overflow.`);
  }
  if (metrics.assetKey !== 'logitech-g502-x-plus-white') throw new Error(`${viewportName} rendered ${metrics.assetKey}.`);
  if (metrics.renderState !== 'ready') throw new Error(`${viewportName} device canvas was not ready.`);
  if (metrics.charging === 'true' || /charging/i.test(metrics.batteryLabel ?? '')) {
    throw new Error(`${viewportName} still asserts that the unplugged mouse is charging.`);
  }
  for (const callout of metrics.callouts) {
    if (callout.lineJoinGap > 1.5 || callout.hotspotJoinGap > 1.5 || callout.verticalGap > 1.5) {
      throw new Error(`${viewportName} ${callout.id} leader is misaligned: ${JSON.stringify(callout)}`);
    }
  }
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
    if (candidate) return candidate;
    await delay(50);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForLoad(window) {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Switchboard renderer did not finish loading.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForViewport(window, viewport) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const size = await window.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight })');
    if (size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2) return;
    await delay(40);
  }
  throw new Error(`Native window did not reach ${viewport.name}.`);
}

async function waitForPaint(window) {
  window.webContents.invalidate();
  await window.webContents.executeJavaScript('new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))');
  await delay(80);
}

async function waitForCondition(window, expression, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
