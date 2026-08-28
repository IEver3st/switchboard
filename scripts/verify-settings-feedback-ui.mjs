import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'settings-feedback');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-settings-feedback-review-'));

app.setName('switchboard-settings-feedback-review');
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

let window;
void app.whenReady().then(run).catch((error) => {
  console.error('Settings feedback native review failed.', error);
  app.exit(1);
});

async function run() {
  window = await waitForWindow();
  await waitForLoad(window);
  await waitForCondition(`!document.querySelector('.startup-screen')`, 'startup sequence');
  await openSettingsCategory('General');

  const report = [];
  for (const viewport of viewports) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(viewport);
    await openSettingsCategory('General');
    await waitForPaint();

    const settingsMetrics = await inspectSettings();
    assertSettingsMetrics(settingsMetrics, viewport);
    await capture(`${viewport.name}-settings-icons.png`);

    await openFeedbackDialog();
    await waitForPaint();
    const dialogMetrics = await inspectDialog();
    assertDialogMetrics(dialogMetrics, viewport);
    await capture(`${viewport.name}-feedback-bug.png`);

    if (viewport.name === '1420x900') {
      const interaction = await exerciseFeatureDraft();
      report.push({ viewport, settingsMetrics, dialogMetrics, interaction });
      await capture(`${viewport.name}-feedback-feature-filled.png`);
    } else {
      report.push({ viewport, settingsMetrics, dialogMetrics });
    }

    const escape = await closeFeedbackWithEscape();
    if (!escape.settingsStillOpen || !escape.focusReturned) {
      throw new Error(`Feedback Escape handling failed: ${JSON.stringify(escape)}`);
    }
  }

  const navigation = await verifyCategoryNavigation();
  const reducedMotion = await verifyReducedMotion();
  await writeFile(
    join(outputDirectory, 'report.json'),
    `${JSON.stringify({ report, navigation, reducedMotion }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ outputDirectory, report, navigation, reducedMotion }, null, 2));
  app.quit();
}

async function openSettingsCategory(label) {
  const settingsOpen = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.settings-page'))`);
  if (!settingsOpen) {
    const clicked = await window.webContents.executeJavaScript(`
      (() => {
        const button = document.querySelector('button[aria-label="Settings"]');
        if (!(button instanceof HTMLButtonElement)) return false;
        button.click();
        return true;
      })()
    `);
    if (!clicked) throw new Error('Could not open Settings.');
    await waitForCondition(`Boolean(document.querySelector('.settings-page'))`, 'Settings page');
  }
  const selected = await window.webContents.executeJavaScript(`
    (() => {
      const label = ${JSON.stringify(label)};
      const button = [...document.querySelectorAll('[data-settings-category]')]
        .find((candidate) => candidate.textContent?.trim() === label);
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `);
  if (!selected) throw new Error(`Could not select ${label} Settings.`);
  await waitForCondition(
    `document.querySelector('[data-settings-category][aria-current="page"]')?.textContent?.trim() === ${JSON.stringify(label)}`,
    `${label} Settings category`,
  );
}

async function inspectSettings() {
  return window.webContents.executeJavaScript(`
    (() => {
      const sidebar = document.querySelector('.settings-sidebar');
      const feedback = document.querySelector('.settings-feedback-trigger');
      const back = document.querySelector('.settings-back');
      const categoryLinks = [...document.querySelectorAll('[data-settings-category]')];
      const rect = (element) => {
        const value = element?.getBoundingClientRect();
        return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
      };
      return {
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        contentOverflowX: document.querySelector('[data-settings-content-scroll]')?.scrollWidth > document.querySelector('[data-settings-content-scroll]')?.clientWidth,
        sidebarOverflowY: sidebar?.scrollHeight > sidebar?.clientHeight,
        sidebarRect: rect(sidebar),
        feedbackRect: rect(feedback),
        backRect: rect(back),
        categoryIcons: categoryLinks.map((link) => ({
          id: link.getAttribute('data-settings-category'),
          iconCount: link.querySelectorAll(':scope > svg').length,
          current: link.getAttribute('aria-current'),
        })),
      };
    })()
  `);
}

function assertSettingsMetrics(metrics, viewport) {
  if (metrics.documentOverflowX || metrics.contentOverflowX) {
    throw new Error(`${viewport.name} Settings has horizontal overflow.`);
  }
  if (metrics.sidebarOverflowY) throw new Error(`${viewport.name} Settings sidebar requires scrolling.`);
  if (metrics.categoryIcons.length !== 9 || metrics.categoryIcons.some((item) => item.iconCount !== 1)) {
    throw new Error(`${viewport.name} Settings category icon coverage failed: ${JSON.stringify(metrics.categoryIcons)}`);
  }
  if (!metrics.feedbackRect || !metrics.backRect || !metrics.sidebarRect) {
    throw new Error(`${viewport.name} Settings footer controls are missing.`);
  }
  if (metrics.feedbackRect.bottom > metrics.sidebarRect.bottom || metrics.backRect.bottom > metrics.sidebarRect.bottom) {
    throw new Error(`${viewport.name} Settings footer controls are clipped.`);
  }
}

async function openFeedbackDialog() {
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.settings-feedback-trigger');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `);
  if (!opened) throw new Error('Could not open the feedback dialog.');
  await waitForCondition(`Boolean(document.querySelector('[data-feedback-dialog]'))`, 'feedback dialog');
}

async function inspectDialog() {
  return window.webContents.executeJavaScript(`
    (() => {
      const dialog = document.querySelector('[data-feedback-dialog]');
      const submit = dialog?.querySelector('button[type="submit"]');
      const rect = dialog?.getBoundingClientRect();
      return {
        rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
        clientHeight: dialog?.clientHeight ?? null,
        scrollHeight: dialog?.scrollHeight ?? null,
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        submitVisible: Boolean(submit && (() => {
          const submitRect = submit.getBoundingClientRect();
          return submitRect.top >= 0 && submitRect.bottom <= innerHeight;
        })()),
        submitDisabled: submit instanceof HTMLButtonElement ? submit.disabled : null,
        role: dialog?.getAttribute('role'),
        modal: dialog?.getAttribute('aria-modal'),
        focusInside: Boolean(dialog?.contains(document.activeElement)),
        bugSelected: document.getElementById('feedback-kind-bug')?.getAttribute('data-state'),
        featureSelected: document.getElementById('feedback-kind-feature')?.getAttribute('data-state'),
        diagnostics: document.querySelector('.settings-feedback-diagnostics button[role="switch"]')?.getAttribute('data-state'),
      };
    })()
  `);
}

function assertDialogMetrics(metrics, viewport) {
  if (!metrics.rect || metrics.role !== 'dialog' || metrics.modal !== 'true') {
    throw new Error(`${viewport.name} feedback dialog semantics are incomplete: ${JSON.stringify(metrics)}`);
  }
  if (metrics.rect.left < 0 || metrics.rect.top < 0 || metrics.rect.right > viewport.width || metrics.rect.bottom > viewport.height) {
    throw new Error(`${viewport.name} feedback dialog is outside the viewport: ${JSON.stringify(metrics.rect)}`);
  }
  if (metrics.documentOverflowX || !metrics.submitVisible || metrics.scrollHeight > metrics.clientHeight + 1) {
    throw new Error(`${viewport.name} feedback dialog clips routine controls: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.submitDisabled || !metrics.focusInside || metrics.bugSelected !== 'checked' || metrics.featureSelected !== 'unchecked' || metrics.diagnostics !== 'unchecked') {
    throw new Error(`${viewport.name} feedback dialog initial state is incorrect: ${JSON.stringify(metrics)}`);
  }
}

async function exerciseFeatureDraft() {
  const updated = await window.webContents.executeJavaScript(`
    (() => {
      const setValue = (element, value, prototype) => {
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        setter?.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      };
      document.getElementById('feedback-kind-feature')?.click();
      const title = document.getElementById('feedback-title');
      const description = document.getElementById('feedback-description');
      const details = document.getElementById('feedback-supporting-details');
      if (!(title instanceof HTMLInputElement) || !(description instanceof HTMLTextAreaElement) || !(details instanceof HTMLTextAreaElement)) return false;
      setValue(title, 'Add per-game audio profile switching', HTMLInputElement.prototype);
      setValue(description, 'Switch audio presets automatically when a detected game becomes active.', HTMLTextAreaElement.prototype);
      setValue(details, 'This would remove three manual preset changes each time I switch between games and voice chat.', HTMLTextAreaElement.prototype);
      const diagnostics = document.querySelector('.settings-feedback-diagnostics button[role="switch"]');
      if (!(diagnostics instanceof HTMLButtonElement)) return false;
      diagnostics.click();
      return true;
    })()
  `);
  if (!updated) throw new Error('Could not exercise the feature-request draft.');
  await waitForCondition(
    `document.querySelector('[data-feedback-dialog] button[type="submit"]')?.disabled === false && document.getElementById('feedback-kind-feature')?.getAttribute('data-state') === 'checked'`,
    'completed feature-request draft',
  );
  return window.webContents.executeJavaScript(`
    (() => ({
      title: document.getElementById('feedback-title')?.value,
      descriptionLength: document.getElementById('feedback-description')?.value.length,
      supportingDetailsLength: document.getElementById('feedback-supporting-details')?.value.length,
      diagnostics: document.querySelector('.settings-feedback-diagnostics button[role="switch"]')?.getAttribute('data-state'),
      submitDisabled: document.querySelector('[data-feedback-dialog] button[type="submit"]')?.disabled,
    }))()
  `);
}

async function closeFeedbackWithEscape() {
  await window.webContents.executeJavaScript(`document.getElementById('feedback-title')?.focus()`);
  window.show();
  window.focus();
  window.webContents.focus();
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESCAPE' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ESCAPE' });
  await waitForCondition(`!document.querySelector('[data-feedback-dialog]')`, 'feedback dialog to close with Escape');
  return window.webContents.executeJavaScript(`({
    settingsStillOpen: Boolean(document.querySelector('.settings-page')),
    focusReturned: document.activeElement === document.querySelector('.settings-feedback-trigger'),
  })`);
}

async function verifyCategoryNavigation() {
  await openSettingsCategory('General');
  return window.webContents.executeJavaScript(`
    (async () => {
      const results = [];
      for (const button of document.querySelectorAll('[data-settings-category]')) {
        button.click();
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        results.push({
          id: button.getAttribute('data-settings-category'),
          current: button.getAttribute('aria-current'),
          iconCount: button.querySelectorAll(':scope > svg').length,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        });
      }
      return results;
    })()
  `).then((results) => {
    if (results.length !== 9 || results.some((item) => item.current !== 'page' || item.iconCount !== 1 || item.horizontalOverflow)) {
      throw new Error(`Settings category navigation failed: ${JSON.stringify(results)}`);
    }
    return results;
  });
}

async function verifyReducedMotion() {
  const debuggerSession = window.webContents.debugger;
  debuggerSession.attach('1.3');
  try {
    await debuggerSession.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    const reload = new Promise((resolveReload) => window.webContents.once('did-finish-load', resolveReload));
    window.webContents.reload();
    await reload;
    await waitForCondition(`!document.querySelector('.startup-screen')`, 'reduced-motion reload');
    await openSettingsCategory('General');
    await openFeedbackDialog();
    const result = await window.webContents.executeJavaScript(`
      (() => {
        const option = document.querySelector('.settings-feedback-kind__option');
        const content = document.querySelector('.settings-feedback-dialog');
        return {
          mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
          optionTransitionDuration: option ? getComputedStyle(option).transitionDuration : null,
          contentAnimationDuration: content ? getComputedStyle(content).animationDuration : null,
        };
      })()
    `);
    if (!result.mediaMatches || result.optionTransitionDuration !== '0s') {
      throw new Error(`Reduced motion feedback state failed: ${JSON.stringify(result)}`);
    }
    await capture('1080x720-feedback-reduced-motion.png');
    return result;
  } finally {
    debuggerSession.detach();
  }
}

async function capture(filename) {
  await waitForPaint();
  const image = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, filename), image.toPNG());
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

async function waitForPaint() {
  window.webContents.invalidate();
  await window.webContents.executeJavaScript(`new Promise((resolvePaint) => requestAnimationFrame(() => requestAnimationFrame(resolvePaint)))`);
  await delay(180);
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

async function waitForCondition(expression, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
