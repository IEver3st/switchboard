import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'mouse-device-polish');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-mouse-polish-'));

app.setName('switchboard-mouse-polish-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

void app.whenReady().then(run).catch(async (error) => {
  await writeFile(join(outputDirectory, 'failure.json'), `${JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }, null, 2)}\n`).catch(() => undefined);
  console.error('Mouse device polish verification failed.', error);
  setTimeout(() => app.exit(1), 50);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await openG502(window);
  await waitFor(window, `document.querySelector('.mouse-stage canvas')?.dataset.renderState === 'ready'`);

  const report = { captures: [], interactions: [], persistence: null };
  for (const viewport of [
    { name: '1080x720', width: 1080, height: 720 },
    { name: '1420x900', width: 1420, height: 900 },
    { name: '1920x1080', width: 1920, height: 1080 },
  ]) {
    await setViewport(window, viewport);
    const metrics = await layoutMetrics(window);
    assertLayout(metrics, viewport.name);
    const filename = `${viewport.name}-workbench.png`;
    await capture(window, filename);
    report.captures.push({ viewport, filename, metrics });
  }

  await setViewport(window, { name: '1420x900', width: 1420, height: 900 });
  const mouse = await mouseSnapshot(window);

  const sliderValue = await dragActiveDpiSlider(window, 0.12);
  report.interactions.push({ name: 'dpi-slider', value: sliderValue });

  await setInput(window, '#active-mouse-dpi', '1200');
  await delay(50);
  await blurSelector(window, '#active-mouse-dpi');
  await waitMouse(window, (value) => value.capabilities.dpi.activeDpi === 1200, 'editable DPI');
  report.interactions.push({ name: 'dpi-input', value: 1200 });

  await clickSelector(window, '[aria-label="Create DPI preset"]');
  await waitFor(window, `Boolean(document.querySelector('[aria-label="New DPI preset value"]'))`);
  await setInput(window, '[aria-label="New DPI preset value"]', '2400');
  await clickButtonText(window, 'Add');
  await waitMouse(window, (value) => value.capabilities.dpi.stages.includes(2400), 'created DPI preset');
  await openContextMenu(window, '[aria-label="2400 DPI"]');
  await clickMenuItem(window, 'Edit value');
  await waitFor(window, `Boolean(document.querySelector('[aria-label="Edited DPI preset value"]'))`);
  await setInput(window, '[aria-label="Edited DPI preset value"]', '2600');
  await clickButtonText(window, 'Save');
  await waitMouse(window, (value) => value.capabilities.dpi.stages.includes(2600) && !value.capabilities.dpi.stages.includes(2400), 'edited DPI preset');
  await openContextMenu(window, '[aria-label="2600 DPI"]');
  await clickMenuItem(window, 'Delete preset');
  await waitMouse(window, (value) => !value.capabilities.dpi.stages.includes(2600), 'deleted DPI preset');
  report.interactions.push({ name: 'dpi-presets', create: 2400, edit: 2600, deleted: true });

  await clickSelector(window, '[aria-label="500 hertz"]');
  await waitMouse(window, (value) => value.capabilities.reportRate.value === 500, 'polling rate');
  await clickSelector(window, '.dpi-shift-control__value');
  await waitFor(window, `Boolean(document.querySelector('[aria-label="DPI Shift value"]'))`);
  await setInput(window, '[aria-label="DPI Shift value"]', '700');
  await clickButtonText(window, 'Set');
  await waitMouse(window, (value) => value.capabilities.dpi.shiftDpi === 700, 'DPI Shift');
  report.interactions.push({ name: 'polling-and-shift', pollingRate: 500, shiftDpi: 700 });

  const linked = await hoverHotspot(window, 'back');
  if (!linked) throw new Error('Physical hotspot hover did not link to its callout.');
  await clickSelector(window, 'button[aria-label^="Back, assigned to"]');
  await waitFor(window, `Boolean(document.querySelector('[cmdk-list]'))`);
  const assignmentFilename = '1420x900-assignment-picker.png';
  await capture(window, assignmentFilename);
  report.captures.push({ viewport: { name: '1420x900', width: 1420, height: 900 }, filename: assignmentFilename, state: 'assignment-picker' });
  await clickCommandItem(window, 'Forward');
  await waitMouse(window, (value) => binding(value, 'back') === 'mouse.forward', 'button assignment');
  report.interactions.push({ name: 'button-assignment', button: 'back', action: 'mouse.forward', linkedHover: true });

  await clickSelector(window, '[aria-label="Onboard memory"]');
  await waitMouse(window, (value) => value.capabilities.onboardMemory.enabled, 'onboard memory enable');
  const disabledState = await evaluate(window, `({
    dpiDisabled: document.querySelector('#active-mouse-dpi')?.disabled,
    activeProfile: document.querySelector('.onboard-memory-control__profile strong')?.textContent?.trim()
  })`);
  if (!disabledState.dpiDisabled || !disabledState.activeProfile) throw new Error(`Onboard disabled state was incomplete: ${JSON.stringify(disabledState)}`);
  await setViewport(window, { name: '1080x720', width: 1080, height: 720 });
  const onboardFilename = '1080x720-onboard-disabled.png';
  await capture(window, onboardFilename);
  report.captures.push({ viewport: { name: '1080x720', width: 1080, height: 720 }, filename: onboardFilename, state: 'onboard-disabled' });
  await clickSelector(window, '[aria-label="Onboard memory"]');
  await waitMouse(window, (value) => !value.capabilities.onboardMemory.enabled, 'onboard memory disable');
  report.interactions.push({ name: 'onboard-memory', enabledState: disabledState });

  await setViewport(window, { name: '1420x900', width: 1420, height: 900 });
  const beforeLighting = await mouseSnapshot(window);
  if (!beforeLighting.capabilities.lighting.enabled) {
    await clickSelector(window, '[aria-label="Mouse lighting"]');
    await waitMouse(window, (value) => value.capabilities.lighting.enabled, 'lighting enable');
  }
  await chooseSelectOption(window, '[aria-label="Lighting effect"]', 'Breathing');
  await waitMouse(window, (value) => /breath/i.test(value.capabilities.lighting.activeEffectId), 'lighting effect');
  await chooseSelectOption(window, '[aria-label="Lighting effect"]', 'Static');
  await waitMouse(window, (value) => /static|solid/i.test(value.capabilities.lighting.activeEffectId), 'static lighting effect');

  const canonicalBeforePreview = (await mouseSnapshot(window)).capabilities.lighting.color?.toUpperCase();
  await clickSelector(window, '.lighting-color-trigger');
  await waitFor(window, `Boolean(document.querySelector('[aria-label="HEX color"]'))`);
  await setInput(window, '[aria-label="HEX color"]', 'FF1774');
  await waitFor(window, `document.querySelector('.mouse-stage .device-render')?.dataset.lightingPreview === 'true' && document.querySelector('.mouse-stage .device-render')?.dataset.lightingColor?.toUpperCase() === '#FF1774'`);
  const canonicalDuringPreview = (await mouseSnapshot(window)).capabilities.lighting.color?.toUpperCase();
  if (canonicalDuringPreview !== canonicalBeforePreview) throw new Error('Draft lighting preview mutated canonical state before commit.');
  const colorFilename = '1420x900-color-picker-preview.png';
  await capture(window, colorFilename);
  report.captures.push({ viewport: { name: '1420x900', width: 1420, height: 900 }, filename: colorFilename, state: 'color-picker-preview' });
  await blurSelector(window, '[aria-label="HEX color"]');
  await waitMouse(window, (value) => value.capabilities.lighting.color?.toUpperCase() === '#FF1774', 'lighting color commit');

  await clickSelector(window, '[aria-label^="Zone 1 color"]');
  await waitFor(window, `Boolean(document.querySelector('[aria-label="HEX color"]'))`);
  await setInput(window, '[aria-label="HEX color"]', '12B8A6');
  await delay(50);
  await blurSelector(window, '[aria-label="HEX color"]');
  await waitMouse(window, (value) => value.capabilities.lighting.zones?.find((zone) => zone.id === 'zone-1')?.color.toUpperCase() === '#12B8A6', 'lighting zone color');
  report.interactions.push({ name: 'lighting', effect: 'static', color: '#FF1774', zone: { id: 'zone-1', color: '#12B8A6' }, previewBeforeCommit: true });

  await evaluate(window, 'location.reload()');
  await waitForLoad(window);
  await openG502(window);
  const persisted = await mouseSnapshot(window);
  report.persistence = {
    dpi: persisted.capabilities.dpi.activeDpi,
    pollingRate: persisted.capabilities.reportRate.value,
    shiftDpi: persisted.capabilities.dpi.shiftDpi,
    lightingColor: persisted.capabilities.lighting.color,
    backAction: binding(persisted, 'back'),
  };
  if (report.persistence.dpi !== 1200
    || report.persistence.pollingRate !== 500
    || report.persistence.shiftDpi !== 700
    || report.persistence.lightingColor?.toUpperCase() !== '#FF1774'
    || report.persistence.backAction !== 'mouse.forward') {
    throw new Error(`Canonical state did not survive renderer reload: ${JSON.stringify(report.persistence)}`);
  }

  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, captures: report.captures.length, interactions: report.interactions.length, persistence: report.persistence }, null, 2));
  app.quit();
}

async function dragActiveDpiSlider(window, ratio) {
  const geometry = await evaluate(window, `(() => {
    const root = document.querySelector('.dpi-control__slider .ui-slider');
    const slider = root?.querySelector('[role="slider"]');
    const track = root?.querySelector('.ui-slider__track');
    if (!slider || !track) return null;
    const thumb = slider.getBoundingClientRect();
    const bounds = track.getBoundingClientRect();
    return { from: { x: Math.round(thumb.left + thumb.width / 2), y: Math.round(thumb.top + thumb.height / 2) }, to: { x: Math.round(bounds.left + bounds.width * ${ratio}), y: Math.round(bounds.top + bounds.height / 2) } };
  })()`);
  if (!geometry) throw new Error('Active DPI slider geometry was unavailable.');
  window.webContents.sendInputEvent({ type: 'mouseMove', ...geometry.from });
  window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...geometry.from });
  window.webContents.sendInputEvent({ type: 'mouseMove', ...geometry.to });
  window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...geometry.to });
  await delay(150);
  const value = Number(await evaluate(window, `document.querySelector('[role="slider"][aria-label="Active DPI"]')?.getAttribute('aria-valuenow')`));
  await waitMouse(window, (mouse) => mouse.capabilities.dpi.activeDpi === value, 'slider DPI commit');
  return value;
}

async function hoverHotspot(window, id) {
  await evaluate(window, `(() => {
    const hotspot = document.querySelector('[data-hotspot-id="${id}"] .device-hotspot__dot');
    hotspot?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    return Boolean(hotspot);
  })()`);
  await delay(50);
  return evaluate(window, `document.querySelector('[data-callout-id="${id}"]')?.dataset.linkedActive === 'true'`);
}

async function layoutMetrics(window) {
  return evaluate(window, `(() => {
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
    const sensitivity = document.querySelector('.mouse-config__section-heading');
    const toolbar = document.querySelector('.dpi-control__toolbar');
    return {
      innerWidth,
      innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: viewport?.clientWidth ?? null,
      viewportScrollWidth: viewport?.scrollWidth ?? null,
      sensitivityTop: sensitivity?.getBoundingClientRect().top ?? null,
      toolbarBottom: toolbar?.getBoundingClientRect().bottom ?? null,
      callouts: document.querySelectorAll('[data-callout-id]').length,
      hotspots: document.querySelectorAll('[data-hotspot-id]').length,
      batteryLabel: document.querySelector('.device-workbench__battery')?.getAttribute('aria-label') ?? null
    };
  })()`);
}

function assertLayout(metrics, label) {
  if (metrics.documentWidth > metrics.innerWidth) throw new Error(`${label} has document-level horizontal overflow.`);
  if (metrics.viewportWidth !== null && metrics.viewportScrollWidth > metrics.viewportWidth) throw new Error(`${label} has workbench horizontal overflow.`);
  if (metrics.callouts !== 6 || metrics.hotspots !== 6) throw new Error(`${label} does not expose all six linked controls.`);
  if (metrics.sensitivityTop === null || metrics.sensitivityTop >= metrics.innerHeight) throw new Error(`${label} hides Sensitivity below the first viewport.`);
  if (label === '1080x720' && (metrics.toolbarBottom === null || metrics.toolbarBottom > metrics.innerHeight)) throw new Error(`${label} hides routine DPI controls below the first viewport.`);
  if (!metrics.batteryLabel || /Battery\s*$/i.test(metrics.batteryLabel)) throw new Error(`${label} battery telemetry is incomplete.`);
}

async function openG502(window) {
  if (await evaluate(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'G502 X Plus'`)) return;
  await waitFor(window, `Boolean(document.querySelector('.device-gallery'))`);
  const opened = await evaluate(window, `(() => {
    const target = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label')?.includes('G502 X Plus'));
    target?.click();
    return Boolean(target);
  })()`);
  if (!opened) throw new Error('G502 X Plus gallery item was unavailable.');
  await waitFor(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'G502 X Plus'`);
}

async function chooseSelectOption(window, selector, text) {
  await clickSelector(window, selector);
  await waitFor(window, `[...document.querySelectorAll('[role="option"]')].some((option) => option.textContent?.trim() === ${JSON.stringify(text)})`);
  const clicked = await evaluate(window, `(() => {
    const option = [...document.querySelectorAll('[role="option"]')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)});
    option?.click();
    return Boolean(option);
  })()`);
  if (!clicked) throw new Error(`Select option was unavailable: ${text}`);
}

async function openContextMenu(window, selector) {
  const opened = await evaluate(window, `(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 300, clientY: 300 }));
    return Boolean(target);
  })()`);
  if (!opened) throw new Error(`Context menu target was unavailable: ${selector}`);
  await waitFor(window, `Boolean(document.querySelector('[role="menu"]'))`);
}

async function clickMenuItem(window, text) {
  const clicked = await evaluate(window, `(() => {
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)});
    item?.click();
    return Boolean(item);
  })()`);
  if (!clicked) throw new Error(`Context menu item was unavailable: ${text}`);
}

async function clickCommandItem(window, text) {
  const clicked = await evaluate(window, `(() => {
    const item = [...document.querySelectorAll('[cmdk-item]')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)});
    item?.click();
    return Boolean(item);
  })()`);
  if (!clicked) throw new Error(`Command item was unavailable: ${text}`);
}

async function clickButtonText(window, text) {
  const clicked = await evaluate(window, `(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)} && !candidate.disabled);
    button?.click();
    return Boolean(button);
  })()`);
  if (!clicked) throw new Error(`Button was unavailable: ${text}`);
}

async function clickSelector(window, selector) {
  const clicked = await evaluate(window, `(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target || target.disabled) return false;
    target.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Enabled control was unavailable: ${selector}`);
}

async function setInput(window, selector, value, blur = false) {
  const changed = await evaluate(window, `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!(input instanceof HTMLInputElement)) return false;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (${JSON.stringify(blur)}) input.blur();
    return true;
  })()`);
  if (!changed) throw new Error(`Input was unavailable: ${selector}`);
}

async function blurSelector(window, selector) {
  await evaluate(window, `document.querySelector(${JSON.stringify(selector)})?.blur()`);
}

async function mouseSnapshot(window) {
  const snapshot = await evaluate(window, 'window.switchboard.getSnapshot()');
  const mouse = snapshot.devices.find((device) => device.displayName === 'G502 X Plus');
  if (!mouse) throw new Error('G502 X Plus canonical snapshot was unavailable.');
  return mouse;
}

async function waitMouse(window, predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const mouse = await mouseSnapshot(window);
    if (predicate(mouse)) return mouse;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function setViewport(window, viewport) {
  if (window.isMaximized()) window.unmaximize();
  window.setContentSize(viewport.width, viewport.height, false);
  await waitFor(window, `innerWidth === ${viewport.width} && Math.abs(innerHeight - ${viewport.height}) <= 2`, 5_000);
  await paint(window);
}

async function capture(window, filename) {
  await paint(window);
  const image = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, filename), image.toPNG());
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
    if (candidate) return candidate;
    await delay(40);
  }
  throw new Error('Switchboard did not create a native window.');
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
  await delay(60);
}

function evaluate(window, expression) {
  return window.webContents.executeJavaScript(expression, true);
}

function binding(mouse, buttonId) {
  return mouse.capabilities.buttonAssignments.bindings.find((candidate) => candidate.buttonId === buttonId)?.currentActionId;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
