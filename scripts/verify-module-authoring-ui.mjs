import { app, BrowserWindow } from 'electron';
import { access, mkdir, mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedRoot = await mkdtemp(join(tmpdir(), 'switchboard-module-authoring-review-'));
const isolatedUserData = join(isolatedRoot, 'user-data');
const projectParent = join(isolatedRoot, 'projects');
const expectedProjectPath = join(projectParent, 'device.local.g502-x-plus-support');
await mkdir(projectParent, { recursive: true });
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
      const workbench = document.querySelector('.module-workbench');
      const content = document.querySelector('[data-settings-content-scroll]');
      const bounds = workbench?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        contentWidth: content?.scrollWidth ?? null,
        workbenchLeft: bounds?.left ?? null,
        workbenchRight: bounds?.right ?? null,
        createVisible: Boolean(document.querySelector('[data-module-create]')),
        linkVisible: Boolean(document.querySelector('[data-module-link]')),
      };
    })()`);
    assert(layout.documentWidth === viewport.width, `${viewport.width}px route has horizontal document overflow.`);
    assert(layout.contentWidth !== null && layout.contentWidth <= viewport.width, `${viewport.width}px settings content overflows.`);
    assert(layout.workbenchRight !== null && layout.workbenchRight <= viewport.width, `${viewport.width}px workbench clips.`);
    assert(layout.createVisible && layout.linkVisible, `${viewport.width}px primary authoring actions are missing.`);
    layouts.push(layout);
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
  await unlinkProject(window);

  console.log(JSON.stringify({
    moduleAuthoringUi: 'passed',
    layouts,
    draft,
    focusedAfterAuthor,
    createdProjectRetainedAfterUnlink: true,
    linked,
  }, null, 2));

  clearTimeout(watchdog);
  app.quit();
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
  await waitForCondition(window, `Boolean(document.querySelector('.module-workbench'))`, 'Modules workbench');
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
