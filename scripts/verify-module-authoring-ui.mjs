import { app, BrowserWindow } from 'electron';
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedRoot = await mkdtemp(join(tmpdir(), 'switchboard-module-authoring-review-'));
const isolatedUserData = join(isolatedRoot, 'user-data');
const projectParent = join(isolatedRoot, 'projects');
const expectedProjectPath = join(projectParent, 'device.local.g502-x-plus-support');
const outputDirectory = process.env.SWITCHBOARD_MODULE_REVIEW_DIR
  ? resolve(process.env.SWITCHBOARD_MODULE_REVIEW_DIR)
  : join(projectRoot, 'design-qa', 'modules-redesign-2026-08-31');
await mkdir(projectParent, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
const watchdog = setTimeout(() => {
  console.error('Module authoring UI review exceeded 20 seconds.');
  app.exit(2);
}, 20_000);

app.setName('switchboard-module-authoring-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_MODULE_PROJECT_REVIEW_PARENT = projectParent;

await import('../out/main/index.js');
void app.whenReady().then(runReview).catch(async (error) => {
  console.error(error);
  clearTimeout(watchdog);
  app.exit(1);
});

async function runReview() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await waitForCondition(window, `!document.querySelector('.startup-screen')`, 'startup sequence');
  await openModules(window);

  const layouts = [];
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForCondition(window, `innerWidth === ${viewport.width} && Math.abs(innerHeight - ${viewport.height}) <= 2`, `${viewport.width}x${viewport.height} viewport`);
    const layout = await window.webContents.executeJavaScript(`(() => {
      const manager = document.querySelector('.module-manager__lists');
      const content = document.querySelector('[data-settings-content-scroll]');
      const bounds = manager?.getBoundingClientRect();
      const row = document.querySelector('[data-module-row]');
      const rowBounds = row?.getBoundingClientRect();
      const actionBounds = row?.querySelector('.module-list-row__action')?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio,
        documentWidth: document.documentElement.scrollWidth,
        contentWidth: content?.scrollWidth ?? null,
        managerLeft: bounds?.left ?? null,
        managerRight: bounds?.right ?? null,
        rowRight: rowBounds?.right ?? null,
        actionLeft: actionBounds?.left ?? null,
        installedRows: document.querySelectorAll('[data-module-toggle]').length,
        availableRows: document.querySelectorAll('[data-module-install]').length,
        developerToolsVisible: Boolean(document.querySelector('[data-module-developer-tools]')),
      };
    })()`);
    assert(layout.documentWidth === viewport.width, `${viewport.width}px route has horizontal document overflow.`);
    assert(layout.contentWidth !== null && layout.contentWidth <= viewport.width, `${viewport.width}px settings content overflows.`);
    assert(layout.managerRight !== null && layout.managerRight <= viewport.width, `${viewport.width}px module manager clips.`);
    assert(layout.rowRight !== null && layout.rowRight <= viewport.width, `${viewport.width}px module row clips.`);
    assert(layout.actionLeft !== null && layout.actionLeft > layout.managerLeft, `${viewport.width}px module actions collide with module copy.`);
    assert(layout.installedRows === 6 && layout.availableRows === 2, `${viewport.width}px module inventory is incomplete.`);
    assert(layout.developerToolsVisible, `${viewport.width}px Developer tools action is missing.`);
    await capture(window, `modules-${viewport.width}x${viewport.height}.png`);
    layouts.push(layout);
  }

  window.setContentSize(1420, 900, false);
  await window.webContents.executeJavaScript(`[
    ...document.querySelectorAll('[data-settings-category]')
  ].find((button) => button.textContent?.trim() === 'General')?.click()`);
  await waitForCondition(window, `document.querySelector('.settings-category-header h2')?.textContent === 'General'`, 'General settings color review');
  await capture(window, 'settings-general-color-1420x900.png');
  await window.webContents.executeJavaScript(`[
    ...document.querySelectorAll('[data-settings-category]')
  ].find((button) => button.textContent?.trim() === 'Modules')?.click()`);
  await waitForCondition(window, `Boolean(document.querySelector('.module-manager__toolbar'))`, 'returned Modules manager');

  const reducedMotion = await verifyReducedMotion(window);
  assert(reducedMotion.matches, 'Reduced-motion media emulation did not reach the renderer.');
  assert(reducedMotion.contentAnimation === 'none', `Settings content still animates in reduced motion: ${reducedMotion.contentAnimation}.`);
  assert(reducedMotion.rowTransition === '0s', `Module rows still transition in reduced motion: ${reducedMotion.rowTransition}.`);

  await window.webContents.executeJavaScript(`document.querySelector('[data-module-search]')?.focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'TAB' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'TAB' });
  await delay(60);
  const moduleKeyboardTarget = await window.webContents.executeJavaScript(`document.activeElement?.hasAttribute('data-module-developer-tools')`);
  assert(moduleKeyboardTarget, 'Keyboard order did not move from module search to Developer tools.');

  await window.webContents.executeJavaScript(`document.querySelector('[data-module-row="device.hyperx-quadcast"] .module-list-row__main')?.click()`);
  await waitForCondition(window, `Boolean(document.querySelector('[data-module-details="device.hyperx-quadcast"]'))`, 'module details dialog');
  const details = await window.webContents.executeJavaScript(`({
    title: document.querySelector('[data-module-details] h2')?.textContent,
    sections: [...document.querySelectorAll('[data-module-details] h3')].map((heading) => heading.textContent),
    hasToggle: Boolean(document.querySelector('[data-module-details] [role="switch"]')),
    focusedLabel: document.activeElement?.getAttribute('aria-label'),
  })`);
  assert(details.title === 'HyperX QuadCast', 'Module details opened for the wrong module.');
  assert(details.sections.includes('Overview') && details.sections.includes('Support') && details.sections.includes('Diagnostics'), 'Module details omitted progressive information groups.');
  assert(details.hasToggle, 'Module details omitted the enable control.');
  assert(details.focusedLabel === 'Close', `Module details focused ${details.focusedLabel ?? 'nothing'} instead of the safe close action.`);
  await delay(120);
  await capture(window, 'modules-details-1420x900.png');
  await window.webContents.executeJavaScript(`document.querySelector('[data-module-details] button[aria-label="Close"]')?.click()`);
  await waitForCondition(window, `!document.querySelector('[data-module-details]')`, 'closed module details');

  await setInput(window, '[data-module-search]', 'QuadCast 2');
  await waitForCondition(window, `document.querySelectorAll('[data-module-row]').length === 1`, 'filtered module results');
  const searchResult = await window.webContents.executeJavaScript(`document.querySelector('[data-module-row]')?.getAttribute('data-module-row')`);
  assert(searchResult === 'device.hyperx-quadcast', `Module search returned ${searchResult ?? 'nothing'} for a supported device name.`);
  await capture(window, 'modules-search-1420x900.png');
  await setInput(window, '[data-module-search]', 'no-such-module');
  await waitForCondition(window, `Boolean(document.querySelector('.module-manager__empty'))`, 'module search empty state');
  await setInput(window, '[data-module-search]', '');
  await waitForCondition(window, `document.querySelectorAll('[data-module-row]').length === 8`, 'restored module inventory');

  await window.webContents.executeJavaScript(`document.querySelector('[data-module-toggle="device.razer-huntsman"]')?.click()`);
  await waitForCondition(window, `document.querySelector('[data-module-toggle="device.razer-huntsman"]')?.getAttribute('data-state') === 'unchecked'`, 'disabled installed module');
  await window.webContents.executeJavaScript(`document.querySelector('[data-module-toggle="device.razer-huntsman"]')?.click()`);
  await waitForCondition(window, `document.querySelector('[data-module-toggle="device.razer-huntsman"]')?.getAttribute('data-state') === 'checked'`, 're-enabled installed module');

  for (const moduleId of ['device.steelseries-hid', 'integration.obs']) {
    await window.webContents.executeJavaScript(`document.querySelector('[data-module-install=${JSON.stringify(moduleId)}]')?.click()`);
    await waitForCondition(window, `Boolean(document.querySelector('[data-module-toggle=${JSON.stringify(moduleId)}]'))`, `installed ${moduleId}`);
  }
  await waitForCondition(window, `document.querySelector('[data-setting-id="modules.available"]')?.textContent?.includes('No additional compatible modules')`, 'available modules empty state');
  await capture(window, 'modules-available-empty-1420x900.png');

  await window.webContents.executeJavaScript(`document.querySelector('[data-module-developer-tools]')?.click()`);
  await waitForCondition(window, `Boolean(document.querySelector('.module-workbench'))`, 'Developer tools route');
  const developerRoute = await window.webContents.executeJavaScript(`window.location.hash`);
  assert(developerRoute === '#settings/modules/developer-tools', `Developer tools route was ${developerRoute}.`);

  const developerLayouts = [];
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForCondition(window, `innerWidth === ${viewport.width} && Math.abs(innerHeight - ${viewport.height}) <= 2`, `${viewport.width}x${viewport.height} developer viewport`);
    const layout = await window.webContents.executeJavaScript(`(() => {
      const workbench = document.querySelector('.module-workbench');
      const content = document.querySelector('[data-settings-content-scroll]');
      const bounds = workbench?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        devicePixelRatio,
        documentWidth: document.documentElement.scrollWidth,
        contentWidth: content?.scrollWidth ?? null,
        workbenchRight: bounds?.right ?? null,
        createVisible: Boolean(document.querySelector('[data-module-create]')),
        linkVisible: Boolean(document.querySelector('[data-module-link]')),
      };
    })()`);
    assert(layout.documentWidth === viewport.width, `${viewport.width}px developer route has horizontal document overflow.`);
    assert(layout.contentWidth !== null && layout.contentWidth <= viewport.width, `${viewport.width}px developer content overflows.`);
    assert(layout.workbenchRight !== null && layout.workbenchRight <= viewport.width, `${viewport.width}px developer workbench clips.`);
    assert(layout.createVisible && layout.linkVisible, `${viewport.width}px developer actions are missing.`);
    await capture(window, `module-developer-tools-${viewport.width}x${viewport.height}.png`);
    developerLayouts.push(layout);
  }

  window.setContentSize(1420, 900, false);
  await setInput(window, '#module-field-author', 'Module Author');
  await waitForCondition(window, `!document.querySelector('[data-module-create]')?.disabled`, 'valid module draft');
  const draft = await window.webContents.executeJavaScript(`({
    authorInvalid: document.querySelector('#module-field-author')?.getAttribute('aria-invalid'),
    previewState: document.querySelector('.module-preview__header strong')?.textContent,
    createLabel: document.querySelector('[data-module-create]')?.textContent?.trim(),
  })`);
  assert(draft.authorInvalid === 'false', 'Author field did not clear its validation state.');
  assert(draft.previewState === 'Valid draft', 'Package preview did not enter the valid state.');

  await window.webContents.executeJavaScript(`document.querySelector('#module-field-author')?.focus()`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'TAB' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'TAB' });
  await delay(60);
  const focusedAfterAuthor = await window.webContents.executeJavaScript(`document.activeElement?.id`);
  assert(focusedAfterAuthor === 'module-field-manufacturer', `Unexpected keyboard order after Author: ${focusedAfterAuthor}`);

  await window.webContents.executeJavaScript(`document.querySelector('[data-module-create]')?.click()`);
  await waitForCondition(window, `Boolean(document.querySelector('[data-module-project="device.local.g502-x-plus-support"]'))`, 'created local project');
  await access(join(expectedProjectPath, 'switchboard.module.json'));
  const createdDirectory = await stat(expectedProjectPath);
  assert(createdDirectory.isDirectory(), 'Create did not write a project directory.');

  await window.webContents.executeJavaScript(`document.querySelector('[data-module-project] [data-module-validate]')?.click()`);
  await waitForCondition(window, `document.querySelector('[data-module-project] .module-runtime-status')?.textContent?.trim() === 'Ready'`, 'validated local project');
  await unlinkProject(window);
  await access(join(expectedProjectPath, 'switchboard.module.json'));

  process.env.SWITCHBOARD_MODULE_PROJECT_REVIEW_LINK = expectedProjectPath;
  await window.webContents.executeJavaScript(`document.querySelector('[data-module-link]')?.click()`);
  await waitForCondition(window, `Boolean(document.querySelector('[data-module-project="device.local.g502-x-plus-support"]'))`, 'linked existing project');
  const linked = await window.webContents.executeJavaScript(`({
    name: document.querySelector('[data-module-project] strong')?.textContent,
    status: document.querySelector('[data-module-project] .module-runtime-status')?.textContent?.trim(),
    path: document.querySelector('[data-module-project] .module-project-row__path')?.textContent,
  })`);
  assert(linked.name === 'G502 X Plus Support', 'Linked project name did not come from its manifest.');
  assert(linked.status === 'Ready', 'Linked project did not publish a ready canonical state.');
  assert(linked.path === expectedProjectPath, 'Linked project path does not match the selected folder.');

  const manifestPath = join(expectedProjectPath, 'switchboard.module.json');
  const validManifest = await readFile(manifestPath, 'utf8');
  await writeFile(manifestPath, '{ invalid json', 'utf8');
  await window.webContents.executeJavaScript(`document.querySelector('[data-module-project] [data-module-validate]')?.click()`);
  await waitForCondition(window, `document.querySelector('[data-module-project] .module-runtime-status')?.textContent?.trim() === 'Needs work'`, 'invalid local project state');
  await capture(window, 'module-developer-tools-error-1420x900.png');
  await writeFile(manifestPath, validManifest, 'utf8');
  await window.webContents.executeJavaScript(`document.querySelector('[data-module-project] [data-module-validate]')?.click()`);
  await waitForCondition(window, `document.querySelector('[data-module-project] .module-runtime-status')?.textContent?.trim() === 'Ready'`, 'recovered local project state');
  await unlinkProject(window);
  assert(await window.webContents.executeJavaScript(`Boolean(document.querySelector('.module-local-empty'))`), 'Local project empty state was not restored after unlinking.');

  console.log(JSON.stringify({
    moduleAuthoringUi: 'passed',
    outputDirectory,
    layouts,
    developerLayouts,
    moduleKeyboardTarget,
    details,
    searchResult,
    reducedMotion,
    draft,
    focusedAfterAuthor,
    createdProjectRetainedAfterUnlink: true,
    linked,
  }, null, 2));

  clearTimeout(watchdog);
  app.quit();
}

async function capture(window, fileName) {
  const image = await window.webContents.capturePage();
  assert(!image.isEmpty(), `Captured image ${fileName} was empty.`);
  await writeFile(join(outputDirectory, fileName), image.toPNG());
}

async function verifyReducedMotion(window) {
  const debug = window.webContents.debugger;
  const attachedHere = !debug.isAttached();
  if (attachedHere) debug.attach('1.3');
  try {
    await debug.sendCommand('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await delay(60);
    return await window.webContents.executeJavaScript(`({
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      contentAnimation: getComputedStyle(document.querySelector('.settings-content')).animationName,
      rowTransition: getComputedStyle(document.querySelector('[data-module-row]')).transitionDuration,
    })`);
  } finally {
    await debug.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [] });
    if (attachedHere) debug.detach();
  }
}

async function unlinkProject(window) {
  await window.webContents.executeJavaScript(`document.querySelector('[data-module-project] [data-module-unlink]')?.click()`);
  await waitForCondition(window, `Boolean([...document.querySelectorAll('.module-unlink-confirmation button')].find((button) => button.textContent?.trim() === 'Unlink'))`, 'unlink confirmation');
  await window.webContents.executeJavaScript(`[
    ...document.querySelectorAll('.module-unlink-confirmation button')
  ].find((button) => button.textContent?.trim() === 'Unlink')?.click()`);
  await waitForCondition(window, `!document.querySelector('[data-module-project]')`, 'unlinked local project');
}

async function setInput(window, selector, value) {
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) throw new Error('Input not found: ${selector}');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function openModules(window) {
  await window.webContents.executeJavaScript(`window.location.hash = 'settings'`);
  await waitForCondition(window, `Boolean(document.querySelector('.settings-page'))`, 'settings page');
  await window.webContents.executeJavaScript(`[
    ...document.querySelectorAll('[data-settings-category]')
  ].find((button) => button.textContent?.trim() === 'Modules')?.click()`);
  await waitForCondition(window, `Boolean(document.querySelector('.module-manager__toolbar'))`, 'Modules manager');
}

async function waitForWindow() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed() && candidate.getTitle() === 'Switchboard');
    if (window) return window;
    await delay(40);
  }
  throw new Error('Switchboard window did not open.');
}

async function waitForLoad(window) {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer did not load.')), 10_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForCondition(window, expression, label) {
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await delay(40);
  }
  const visibleError = await window.webContents.executeJavaScript(`document.querySelector('[role="alert"]')?.textContent ?? ''`).catch(() => '');
  throw new Error(`Timed out waiting for ${label}.${visibleError ? ` ${visibleError}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
