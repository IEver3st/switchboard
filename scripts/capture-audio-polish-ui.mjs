import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'audio-polish-native');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-audio-polish-'));
const viewports = [
  { name: '1080x720', width: 1080, height: 720 },
  { name: '1420x900', width: 1420, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
const tabs = ['mixer', 'game', 'chat', 'media', 'microphone'];

app.setName('switchboard-audio-polish-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

let window;
void app.whenReady().then(run).catch((error) => {
  console.error('Audio polish review failed.', error);
  app.exit(1);
});

async function run() {
  window = await waitForWindow();
  await waitForLoad(window);
  await window.webContents.insertCSS(`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    html { scroll-behavior: auto !important; }
  `);
  await openAudio();

  const report = [];
  for (const viewport of viewports) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(viewport);

    for (const tab of tabs) {
      await openAudioTab(tab);
      await waitForPaint();
      const metrics = await layoutMetrics(tab);
      const image = await window.webContents.capturePage();
      const filename = `${viewport.name}-audio-${tab}.png`;
      await writeFile(join(outputDirectory, filename), image.toPNG());
      let controlsFilename = null;
      if (viewport.name === '1420x900' && tab !== 'mixer') {
        await window.webContents.executeJavaScript(`
          document.querySelector(${JSON.stringify(`#audio-panel-${tab} .audio-control-rail`)})?.scrollIntoView({ block: 'start' })
        `);
        await waitForPaint();
        const controlsImage = await window.webContents.capturePage();
        controlsFilename = `${viewport.name}-audio-${tab}-controls.png`;
        await writeFile(join(outputDirectory, controlsFilename), controlsImage.toPNG());
        await window.webContents.executeJavaScript(`
          document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach((element) => element.scrollTo(0, 0))
        `);
      }
      report.push({ viewport, tab, filename, controlsFilename, metrics });

      if (viewport.name === '1420x900' && tab === 'game') {
        await clickSelector('.preset-picker [role="combobox"]');
        await waitForSelector('[role="option"]');
        await waitForPaint();
        const openImage = await window.webContents.capturePage();
        await writeFile(join(outputDirectory, '1420x900-audio-game-preset-open.png'), openImage.toPNG());
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESC' });
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ESC' });
      }
    }
  }

  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, captures: report.length + (tabs.length - 1) + 1, report }, null, 2));
  app.quit();
}

async function openAudio() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const clicked = await window.webContents.executeJavaScript(`
      (() => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.trim() === 'Audio');
        button?.click();
        return Boolean(button);
      })()
    `);
    if (clicked) break;
    await delay(100);
  }
  await waitForSelector('[data-testid="audio-console"]');
}

async function openAudioTab(tab) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.location.hash = ${JSON.stringify(`audio/${tab}`)};
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      document.querySelectorAll('[data-radix-scroll-area-viewport]').forEach((element) => element.scrollTo(0, 0));
      return true;
    })()
  `);
  await waitForSelector(`#audio-tab-${tab}[aria-selected="true"]`);
  await waitForSelector(`#audio-panel-${tab} .${tab === 'mixer' ? 'mixer-workbench' : 'audio-workbench'}`);
}

function layoutMetrics(tab) {
  return window.webContents.executeJavaScript(`
    (() => {
      const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
      const panel = document.querySelector(${JSON.stringify(`#audio-panel-${tab}`)});
      const trigger = panel?.querySelector('.preset-picker [role="combobox"]');
      const graph = panel?.querySelector('.parametric-eq__graph');
      const rect = (element) => element ? Object.fromEntries(
        ['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map((key) => [key, Math.round(element.getBoundingClientRect()[key] * 10) / 10])
      ) : null;
      return {
        innerWidth,
        innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: viewport?.clientWidth ?? null,
        viewportScrollWidth: viewport?.scrollWidth ?? null,
        viewportHeight: viewport?.clientHeight ?? null,
        viewportScrollHeight: viewport?.scrollHeight ?? null,
        repeatedRouteControls: panel?.querySelectorAll('.audio-workbench__device').length ?? null,
        featuredPresetControls: panel?.querySelectorAll('.preset-picker__featured').length ?? null,
        horizontalFaders: panel?.querySelectorAll('.ui-slider--fader').length ?? null,
        processingModules: panel?.querySelectorAll('.audio-simple-section, .mic-rail__input, .mic-rows__row').length ?? null,
        advancedDisclosures: panel?.querySelectorAll('.advanced-disclosure').length ?? null,
        signalChainNavigations: panel?.querySelectorAll('.mic-chain').length ?? null,
        visibleToggleStateLabels: [...(panel?.querySelectorAll('span') ?? [])]
          .filter((element) => ['On', 'Off'].includes(element.textContent?.trim() ?? ''))
          .filter((element) => !element.classList.contains('sr-only'))
          .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
          .length,
        presetTrigger: rect(trigger),
        eqGraph: rect(graph),
      };
    })()
  `);
}

async function clickSelector(selector) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      element?.click();
      return Boolean(element);
    })()
  `);
  if (!clicked) throw new Error(`Could not click ${selector}.`);
}

async function waitForViewport(viewport) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const size = await window.webContents.executeJavaScript(`({ width: innerWidth, height: innerHeight })`);
    if (size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2) return;
    await delay(40);
  }
  throw new Error(`Native window did not reach ${viewport.name}.`);
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

async function waitForLoad(target) {
  if (!target.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Switchboard renderer did not finish loading.')), 20_000);
    target.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForSelector(selector) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = await window.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (found) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${selector}.`);
}

async function waitForPaint() {
  window.webContents.invalidate();
  await window.webContents.executeJavaScript(`
    new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))
  `);
  await delay(80);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
