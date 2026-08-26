import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'native');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-source-picker-'));
const viewports = [
  { width: 1080, height: 720 },
  { width: 1420, height: 900 },
  { width: 1920, height: 1080 },
];

await mkdir(outputDirectory, { recursive: true });
app.setName('switchboard-source-picker-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error(error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await window.webContents.insertCSS('* { animation-duration: 0s !important; transition-duration: 0s !important; }');
  await clickByText(window, 'Capture');
  await waitFor(window, 'document.querySelector(\'button[aria-label^="Capture source:"]\')');

  await openPicker(window);
  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('.capture-source-popover button')]
      .find((button) => button.textContent?.trim() === 'Refresh')?.click()
  `);
  await waitFor(window, `
    document.querySelectorAll('.capture-source-option').length > 1
    && ![...document.querySelectorAll('.capture-source-popover button')]
      .some((button) => button.textContent?.includes('Refreshing'))
  `, 20_000);

  const selectedDisplay = await window.webContents.executeJavaScript(`
    (() => {
      const option = [...document.querySelectorAll('.capture-source-option')]
        .find((button) => button.querySelector('.capture-source-option__type')?.textContent?.startsWith('Display'));
      if (!option) return null;
      const label = option.querySelector('.capture-source-option__name')?.textContent?.trim() ?? null;
      option.click();
      return label;
    })()
  `);
  if (!selectedDisplay) throw new Error('No display source was available for selection.');
  await waitFor(window, `document.querySelector('button[aria-label="Capture source: ${escapeForExpression(selectedDisplay)}"]')`);

  await reload(window);
  await waitFor(window, `document.querySelector('button[aria-label="Capture source: ${escapeForExpression(selectedDisplay)}"]')`);

  await openPicker(window);
  await window.webContents.executeJavaScript("document.querySelector('.capture-source-option[aria-pressed=\"true\"]')?.focus()");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'TAB' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'TAB' });
  await waitFor(window, "document.activeElement?.classList.contains('capture-source-option')");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESCAPE' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ESCAPE' });
  await waitFor(window, "!document.querySelector('.capture-source-popover')");
  await waitFor(window, "document.activeElement?.matches('button[aria-label^=\"Capture source:\"]')");

  const report = [];
  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(window, viewport);
    await openPicker(window);
    await waitFor(window, `[...document.images].filter((image) => image.src.includes('capture-source')).every((image) => image.complete)`);
    await paint(window);
    const metrics = await window.webContents.executeJavaScript(`
      (() => {
        const popover = document.querySelector('.capture-source-popover');
        const rect = popover?.getBoundingClientRect();
        const options = [...document.querySelectorAll('.capture-source-option')];
        return {
          documentWidth: document.documentElement.scrollWidth,
          innerWidth,
          optionCount: options.length,
          windowOptionCount: options.filter((option) => option.querySelector('.capture-source-option__type')?.textContent?.startsWith('Window')).length,
          nonDisplayOptionCount: options.filter((option) => !option.querySelector('.capture-source-option__type')?.textContent?.startsWith('Display')).length,
          selectedCount: options.filter((option) => option.getAttribute('aria-pressed') === 'true').length,
          previewCount: document.querySelectorAll('.capture-source-option img').length,
          previewLoadedCount: [...document.querySelectorAll('.capture-source-option img')]
            .filter((image) => image.complete && image.naturalWidth > 0).length,
          popover: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
        };
      })()
    `);
    if (!metrics.popover || metrics.popover.left < 0 || metrics.popover.right > viewport.width || metrics.popover.bottom > viewport.height) {
      throw new Error(`Source picker overflowed at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)}`);
    }
    if (metrics.documentWidth > metrics.innerWidth || metrics.selectedCount !== 1 || metrics.windowOptionCount !== 0 || metrics.nonDisplayOptionCount !== 0) {
      throw new Error(`Source picker layout/state failed at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)}`);
    }
    const image = await window.webContents.capturePage();
    const filename = `${viewport.width}x${viewport.height}-capture-source-picker.png`;
    await writeFile(join(outputDirectory, filename), image.toPNG());
    report.push({ viewport, filename, metrics });
    await closePicker(window);
  }

  await writeFile(join(outputDirectory, 'capture-source-picker-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ selectedDisplay, report }, null, 2));
  app.quit();
}

async function openPicker(window) {
  const alreadyOpen = await window.webContents.executeJavaScript("Boolean(document.querySelector('.capture-source-popover'))");
  if (!alreadyOpen) {
    await window.webContents.executeJavaScript("document.querySelector('button[aria-label^=\"Capture source:\"]')?.click()");
  }
  await waitFor(window, "document.querySelector('.capture-source-popover')");
}

async function closePicker(window) {
  await window.webContents.executeJavaScript("document.querySelector('button[aria-label^=\"Capture source:\"]')?.click()");
  await waitFor(window, "!document.querySelector('.capture-source-popover')");
}

async function clickByText(window, text) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const target = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === ${JSON.stringify(text)});
      target?.click();
      return Boolean(target);
    })()
  `);
  if (!clicked) throw new Error(`Could not click ${text}.`);
}

async function reload(window) {
  const loaded = new Promise((resolveLoad) => window.webContents.once('did-finish-load', resolveLoad));
  window.webContents.reload();
  await loaded;
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await delay(50);
  }
  throw new Error('Timed out waiting for the Switchboard window.');
}

async function waitForLoad(window) {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad) => window.webContents.once('did-finish-load', resolveLoad));
}

async function waitForViewport(window, viewport) {
  await waitFor(window, `innerWidth === ${viewport.width} && Math.abs(innerHeight - ${viewport.height}) <= 2`);
}

async function waitFor(window, expression, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${expression}.`);
}

async function paint(window) {
  window.webContents.invalidate();
  await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await delay(100);
}

function escapeForExpression(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
