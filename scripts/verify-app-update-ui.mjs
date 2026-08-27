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
process.env.SWITCHBOARD_DEMO_UPDATE = '1';

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

  const report = [];
  await openSettingsCategory('General');
  report.push(await captureState({ width: 1420, height: 900 }, 'general-update-rest'));
  await focusUpdateIndicator();
  await waitFor(
    () => evaluate(`document.querySelector('[role="tooltip"]')?.textContent?.includes('is available') ?? false`),
    'styled update tooltip',
  );
  const tooltipState = await captureState({ width: 1420, height: 900 }, 'general-update-tooltip');
  if (tooltipState.metrics.updateIndicatorNativeTitle !== null) {
    throw new Error('The sidebar update indicator still uses a browser-native title tooltip.');
  }
  if (!tooltipState.metrics.tooltipText?.includes('Open update settings.')) {
    throw new Error('The shared update tooltip was not rendered.');
  }
  if (tooltipState.metrics.updateIndicatorVersion !== null) {
    throw new Error('The update version should remain supplemental tooltip detail in the sidebar.');
  }
  report.push(tooltipState);
  await clickUpdateIndicator();
  await waitFor(
    () => evaluate(`document.querySelector('.settings-breadcrumb strong')?.textContent?.trim() === 'About'`),
    'update indicator navigation',
  );
  await evaluate(`document.activeElement instanceof HTMLElement && document.activeElement.blur()`);

  const preferenceIds = [
    'about.automaticAppUpdates',
    'about.automaticAppUpdateDownloads',
    'about.installAppUpdatesOnNextStartup',
  ];
  const initialPreferences = await getUpdatePreferences();
  for (const settingId of preferenceIds) {
    await clickUpdatePreference(settingId);
  }
  await waitFor(async () => {
    const current = await getUpdatePreferences();
    return current.automaticAppUpdates !== initialPreferences.automaticAppUpdates
      && current.automaticAppUpdateDownloads !== initialPreferences.automaticAppUpdateDownloads
      && current.installAppUpdatesOnNextStartup !== initialPreferences.installAppUpdatesOnNextStartup;
  }, 'update preference mutations');
  for (const settingId of preferenceIds) {
    await clickUpdatePreference(settingId);
  }
  await waitFor(
    async () => JSON.stringify(await getUpdatePreferences()) === JSON.stringify(initialPreferences),
    'update preference round trip',
  );
  await evaluate(`window.switchboard.checkAppUpdates()`);

  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(viewport);

    await openSettingsCategory('About');
    const about = await captureState(viewport, 'about');
    assertLayout(about.metrics, viewport, 'About');
    if (about.metrics.updateAction !== 'Download update') {
      throw new Error(`Development update action was missing at ${viewport.width}x${viewport.height}.`);
    }
    if (!about.metrics.updateDescription?.includes('Development preview: version') || !about.metrics.updateDescription?.endsWith('is available.')) {
      throw new Error(`Development update description was missing at ${viewport.width}x${viewport.height}.`);
    }
    if (!about.metrics.updateIndicator || about.metrics.updateIndicator.width < 180 || about.metrics.updateIndicator.height !== 34) {
      throw new Error(`Sidebar update indicator was missing at ${viewport.width}x${viewport.height}.`);
    }
    if (about.metrics.updateIndicatorSummary !== 'Update available' || about.metrics.updateIndicatorVersion !== null) {
      throw new Error(`Sidebar update indicator content was incomplete at ${viewport.width}x${viewport.height}.`);
    }
    if (!about.metrics.updateActionRect || about.metrics.updateActionRect.width > 180 || about.metrics.updateActionRect.height !== 32 || !about.metrics.updateActionIcon) {
      throw new Error(`The update action was not compact and icon-led at ${viewport.width}x${viewport.height}.`);
    }
    if (about.metrics.preferenceSwitches.length !== 3) {
      throw new Error(`Update preferences were incomplete at ${viewport.width}x${viewport.height}.`);
    }
    report.push(about);
  }

  window.setContentSize(1420, 900, false);
  await waitForViewport({ width: 1420, height: 900 });
  await clickUpdatePreference('about.automaticAppUpdateDownloads');
  await waitFor(() => evaluate(`document.querySelector('[data-setting-id="about.updates"] button')?.textContent?.trim() === 'Download update'`), 'manual download action');
  await evaluate(`document.querySelector('[data-setting-id="about.updates"] button')?.click()`);
  await waitFor(() => evaluate(`document.querySelector('[data-setting-id="about.updates"] button')?.textContent?.trim() === 'Restart to update'`), 'downloaded update state');
  const downloaded = await captureState({ width: 1420, height: 900 }, 'about-downloaded');
  if (downloaded.metrics.updateIndicatorSummary !== 'Update ready') {
    throw new Error('The sidebar update indicator did not communicate the restart-ready state.');
  }
  if (downloaded.metrics.updateActionState !== 'downloaded' || !downloaded.metrics.updateActionReadyStyle) {
    throw new Error('The restart-ready action did not use its restrained ready-state treatment.');
  }
  report.push(downloaded);
  await evaluate(`window.switchboard.checkAppUpdates()`);
  await clickUpdatePreference('about.automaticAppUpdateDownloads');

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
    const updateAction = updateRow?.querySelector('[data-app-update-action]');
    const updateIndicator = document.querySelector('[data-settings-update-indicator]');
    const tooltip = document.querySelector('[role="tooltip"]');
    const preferenceSwitches = [...document.querySelectorAll('[data-setting-id^="about."] button[role="switch"]')];
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
      updateAction: updateRow?.querySelector('button')?.textContent?.trim() ?? null,
      updateActionRect: rect(updateAction),
      updateActionIcon: Boolean(updateAction?.querySelector('svg')),
      updateActionState: updateAction?.getAttribute('data-app-update-action') ?? null,
      updateActionReadyStyle: updateAction?.classList.contains('settings-update-action--ready') ?? false,
      updateDescription: updateRow?.querySelector('[role="status"]')?.textContent?.trim() ?? null,
      updateIndicator: rect(updateIndicator),
      updateIndicatorLabel: updateIndicator?.getAttribute('aria-label') ?? null,
      updateIndicatorSummary: updateIndicator?.querySelector('.settings-update-indicator__label')?.textContent?.trim() ?? null,
      updateIndicatorVersion: updateIndicator?.querySelector('.settings-update-indicator__version')?.textContent?.trim() ?? null,
      updateIndicatorNativeTitle: updateIndicator?.getAttribute('title') ?? null,
      tooltipText: tooltip?.textContent?.trim() ?? null,
      preferenceSwitches: preferenceSwitches.map((control) => ({
        checked: control.getAttribute('data-state') === 'checked',
        ariaLabel: control.getAttribute('aria-label'),
        rect: rect(control),
      })),
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
  if (category === 'About' && metrics.preferenceSwitches.some((control) => (
    control.rect.top < metrics.content.rect.top || control.rect.bottom > metrics.content.rect.bottom + 1
  ))) {
    throw new Error(`An update preference is not visible without scrolling at ${viewport.width}x${viewport.height}.`);
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

async function clickUpdateIndicator() {
  const clicked = await evaluate(`(() => {
    const control = document.querySelector('[data-settings-update-indicator]');
    control?.click();
    return Boolean(control);
  })()`);
  if (!clicked) throw new Error('Application update indicator was not available.');
}

async function focusUpdateIndicator() {
  const focused = await evaluate(`(() => {
    const control = document.querySelector('[data-settings-update-indicator]');
    control?.focus();
    return document.activeElement === control;
  })()`);
  if (!focused) throw new Error('Application update indicator could not receive keyboard focus.');
}

async function clickUpdatePreference(settingId) {
  const clicked = await evaluate(`(() => {
    const control = document.querySelector('[data-setting-id=${JSON.stringify(settingId)}] button[role="switch"]');
    control?.click();
    return Boolean(control);
  })()`);
  if (!clicked) throw new Error(`Update preference ${settingId} was not available.`);
}

function getUpdatePreferences() {
  return evaluate(`window.switchboard.getSnapshot().then((snapshot) => ({
    automaticAppUpdates: snapshot.settings.automaticAppUpdates,
    automaticAppUpdateDownloads: snapshot.settings.automaticAppUpdateDownloads,
    installAppUpdatesOnNextStartup: snapshot.settings.installAppUpdatesOnNextStartup,
  }))`);
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
