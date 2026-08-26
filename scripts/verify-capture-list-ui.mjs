import { app, BrowserWindow } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-capture-list-qa-'));
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'capture-list');
const sourceState = process.env.APPDATA ? join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json') : null;
if (!sourceState) throw new Error('APPDATA is required for native capture-list verification.');

await copyFile(sourceState, join(isolatedUserData, 'switchboard-state.json'));
const copiedState = JSON.parse(await readFile(join(isolatedUserData, 'switchboard-state.json'), 'utf8'));
if (!copiedState.clips?.length) throw new Error('Native capture-list verification requires at least one indexed clip.');

await mkdir(outputDirectory, { recursive: true });
app.setName('switchboard-capture-list-qa');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';

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
  await waitFor(window, 'document.querySelector(\'[aria-label="List view"]\')');
  await window.webContents.executeJavaScript('document.querySelector(\'[aria-label="List view"]\')?.click()');
  await waitFor(window, 'document.querySelectorAll(\'.capture-clip-list__item\').length > 0');

  const report = [];
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(window, viewport);
    await scrollToTop(window);
    await paint(window);

    const metrics = await window.webContents.executeJavaScript(`
      (() => {
        const rows = [...document.querySelectorAll('.capture-clip-list__item')];
        const firstRow = rows[0];
        const thumbnail = firstRow?.querySelector('.capture-clip-list__thumbnail');
        const rowRect = firstRow?.getBoundingClientRect();
        const thumbnailRect = thumbnail?.getBoundingClientRect();
        const main = document.querySelector('main');
        return {
          viewport: { width: innerWidth, height: innerHeight },
          document: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
          main: main ? { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth } : null,
          listSelected: document.querySelector('[aria-label="List view"]')?.getAttribute('aria-pressed'),
          rowCount: rows.length,
          row: rowRect ? { width: rowRect.width, height: rowRect.height } : null,
          thumbnail: thumbnailRect ? { width: thumbnailRect.width, height: thumbnailRect.height } : null,
          source: firstRow?.querySelector('h3 + p')?.textContent?.trim() ?? null,
          metadata: firstRow?.querySelector('.capture-clip-list__metadata')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
          duration: thumbnail?.querySelector(':scope > span:last-child')?.textContent?.trim() ?? null,
          actionLabels: [...(firstRow?.querySelectorAll('button') ?? [])].map((button) => button.getAttribute('aria-label')).filter(Boolean),
        };
      })()
    `);

    if (metrics.document.scrollWidth !== metrics.document.clientWidth || (metrics.main && metrics.main.scrollWidth !== metrics.main.clientWidth)) {
      throw new Error(`Horizontal overflow at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)}`);
    }
    if (metrics.listSelected !== 'true' || !metrics.rowCount || !metrics.source || !metrics.duration) {
      throw new Error(`Capture-list content was incomplete at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics)}`);
    }
    if (!metrics.metadata?.includes('Video quality:') || !metrics.metadata.includes('Size:') || !metrics.metadata.includes('ago')) {
      throw new Error(`Capture-list metadata was incomplete at ${viewport.width}x${viewport.height}: ${metrics.metadata}`);
    }
    if ((metrics.thumbnail?.width ?? 0) < 180 || (metrics.thumbnail?.height ?? 0) < 100) {
      throw new Error(`Capture-list thumbnail was undersized at ${viewport.width}x${viewport.height}: ${JSON.stringify(metrics.thumbnail)}`);
    }

    const image = await window.webContents.capturePage();
    const filename = `${viewport.width}x${viewport.height}-capture-list.png`;
    await writeFile(join(outputDirectory, filename), image.toPNG());
    report.push({ viewport, filename, metrics });
  }

  const favorite = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.capture-clip-list__item button[data-favorite]');
      if (!button) return null;
      const before = button.getAttribute('aria-pressed');
      button.click();
      return before;
    })()
  `);
  if (favorite === null) throw new Error('Capture-list favorite control was not available.');
  await waitFor(window, `document.querySelector('.capture-clip-list__item button[data-favorite]')?.getAttribute('aria-pressed') !== ${JSON.stringify(favorite)}`);
  const favoriteAfter = await window.webContents.executeJavaScript("document.querySelector('.capture-clip-list__item button[data-favorite]')?.getAttribute('aria-pressed')");

  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify({ report, favoriteRoundTrip: { before: favorite, after: favoriteAfter } }, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, report, favoriteRoundTrip: { before: favorite, after: favoriteAfter } }, null, 2));
  app.quit();
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

async function scrollToTop(window) {
  await window.webContents.executeJavaScript("document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach((element) => element.scrollTo(0, 0))");
}

async function paint(window) {
  window.webContents.invalidate();
  await window.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await delay(100);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
