import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'app-updates');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-app-update-review-'));
const viewports = [
  { width: 1080, height: 720 },
  { width: 1420, height: 900 },
  { width: 1920, height: 1080 },
];

app.setName('switchboard-app-update-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

let window;
void app.whenReady().then(runReview).catch((error) => {
  console.error('Application update UI review failed.', error);
  app.exit(1);
});

async function runReview() {
  window = await waitForWindow();
  await waitForLoad(window);
  await waitFor(() => evaluate(`!document.querySelector('.startup-screen')`), 'startup sequence');
  await window.webContents.insertCSS(`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    html { scroll-behavior: auto !important; }
  `);

  await openSettingsCategory('General');
  const initialAutomaticUpdates = await getAutomaticUpdateSetting();
  await clickAutomaticUpdateSwitch();
  await waitFor(
    async () => (await getAutomaticUpdateSetting()) === !initialAutomaticUpdates,
    'automatic update setting mutation',
  );
  await clickAutomaticUpdateSwitch();
  await waitFor(
    async () => (await getAutomaticUpdateSetting()) === initialAutomaticUpdates,
    'automatic update setting round trip',
  );

  const report = [];
  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(viewport);

    await openSettingsCategory('General');
    const general = await captureState(viewport, 'general');
    assertLayout(general.metrics, viewport, 'General');
    if (!general.metrics.automaticUpdateSwitch?.checked) {
      throw new Error(`Automatic updates were not restored at ${viewport.width}x${viewport.height}.`);
    }
    report.push(general);

    await openSettingsCategory('About');
    const about = await captureState(viewport, 'about');
    assertLayout(about.metrics, viewport, 'About');
    if (about.metrics.updateStatus !== 'Unavailable') {
      throw new Error(`Development update capability was not truthful at ${viewport.width}x${viewport.height}.`);
    }
    if (!about.metrics.updateDescription?.includes('installed Windows build')) {
      throw new Error(`Development update reason was missing at ${viewport.width}x${viewport.height}.`);
    }
    report.push(about);
  }

  const reportPath = join(outputDirectory, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, reportPath, report }, null, 2));
  app.quit();
}

async function captureState(viewport, category) {
  await evaluate(`document.querySelector('[data-settings-content-scroll]')?.scrollTo(0, 0)`);
  await waitForPaint();
  const metrics = await evaluate(`(() => {
    const content = document.querySelector('[data-settings-content-scroll]');
    const updateRow = document.querySelector('[data-setting-id="about.updates"]');
    const updateSwitch = document.querySelector('[data-setting-id="general.automaticAppUpdates"] button[role="switch"]');
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      content: content ? {
        clientWidth: content.clientWidth,
        scrollWidth: content.scrollWidth,
        clientHeight: content.clientHeight,
        scrollHeight: content.scrollHeight,
        rect: rect(content),
      } : null,
      updateRow: rect(updateRow),
      updateStatus: updateRow?.querySelector('.settings-row__value')?.textContent?.trim() ?? null,
      updateDescription: updateRow?.querySelector('[role="status"]')?.textContent?.trim() ?? null,
      automaticUpdateSwitch: updateSwitch ? {
        checked: updateSwitch.getAttribute('data-state') === 'checked',
        ariaLabel: updateSwitch.getAttribute('aria-label'),
        rect: rect(updateSwitch),
      } : null,
    };
  })()`);
  const filename = `${viewport.width}x${viewport.height}-${category}.png`;
  const image = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, filename), image.toPNG());
  return { viewport, category, filename, metrics };
}

function assertLayout(metrics, viewport, category) {
  if (metrics.viewport.width !== viewport.width || Math.abs(metrics.viewport.height - viewport.height) > 2) {
    throw new Error(`${category} rendered at the wrong viewport: ${JSON.stringify(metrics.viewport)}.`);
  }
  if (metrics.documentWidth > metrics.viewport.width) {
    throw new Error(`${category} has document horizontal overflow at ${viewport.width}x${viewport.height}.`);
  }
  if (!metrics.content || metrics.content.scrollWidth > metrics.content.clientWidth) {
    throw new Error(`${category} settings content has horizontal overflow at ${viewport.width}x${viewport.height}.`);
  }
  if (category === 'About' && (
    !metrics.updateRow
    || metrics.updateRow.top < metrics.content.rect.top
    || metrics.updateRow.bottom > metrics.content.rect.bottom + 1
  )) {
    throw new Error(`The About update state is not visible without scrolling at ${viewport.width}x${viewport.height}.`);
  }
}

async function openSettingsCategory(label) {
  const opened = await evaluate(`(() => {
    const settings = document.querySelector('button[aria-label="Settings"]');
    settings?.click();
    return Boolean(settings || document.querySelector('.settings-page'));
  })()`);
  if (!opened) throw new Error('Could not open Settings.');
  await waitFor(() => evaluate(`Boolean(document.querySelector('.settings-page'))`), 'Settings page');
  const selected = await evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const button = [...document.querySelectorAll('[data-settings-category]')]
      .find((candidate) => candidate.textContent?.trim() === label);
    button?.click();
    return Boolean(button);
  })()`);
  if (!selected) throw new Error(`Could not select the ${label} settings category.`);
  await waitFor(
    () => evaluate(`document.querySelector('.settings-breadcrumb strong')?.textContent?.trim() === ${JSON.stringify(label)}`),
    `${label} settings`,
  );
}

async function clickAutomaticUpdateSwitch() {
  const clicked = await evaluate(`(() => {
    const control = document.querySelector('[data-setting-id="general.automaticAppUpdates"] button[role="switch"]');
    control?.click();
    return Boolean(control);
  })()`);
  if (!clicked) throw new Error('Automatic application update switch was not available.');
}

function getAutomaticUpdateSetting() {
  return evaluate(`window.switchboard.getSnapshot().then((snapshot) => snapshot.settings.automaticAppUpdates)`);
}

function evaluate(expression) {
  return window.webContents.executeJavaScript(expression, true);
}

async function waitForWindow() {
  return waitFor(() => BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed()) ?? false, 'main window', 20_000);
}

async function waitForLoad(target) {
  if (!target.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer load timed out.')), 20_000);
    target.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForViewport(viewport) {
  await waitFor(async () => {
    const size = await evaluate(`({ width: innerWidth, height: innerHeight })`);
    return size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2;
  }, `${viewport.width}x${viewport.height} viewport`);
}

async function waitForPaint() {
  window.webContents.invalidate();
  await evaluate(`new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))`);
  await delay(80);
}

async function waitFor(predicate, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
