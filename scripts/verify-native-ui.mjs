import { app, BrowserWindow } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reviewRoot = join(projectRoot, '.impeccable', 'review', 'native');
const userData = join(reviewRoot, 'workflow-user-data');
const expectationPath = join(reviewRoot, 'workflow-expectation.json');
const reportPath = join(reviewRoot, 'workflow-report.json');
const phase = process.argv.find((argument) => argument.startsWith('--phase='))?.split('=')[1] ?? 'write';

if (!['write', 'verify'].includes(phase)) throw new Error(`Unknown native UI verification phase: ${phase}`);
if (relative(reviewRoot, userData).startsWith(`..${sep}`) || relative(reviewRoot, userData) === '..') {
  throw new Error('Native UI verification data must stay inside the review directory.');
}

await mkdir(reviewRoot, { recursive: true });
if (phase === 'write') {
  await rm(userData, { recursive: true, force: true });
  await mkdir(userData, { recursive: true });
}

app.setName('switchboard-native-ui-verification');
app.setAppPath(projectRoot);
app.setPath('userData', userData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

let window;
let report = phase === 'verify'
  ? JSON.parse(await readFile(reportPath, 'utf8'))
  : { startedAt: new Date().toISOString(), steps: [], capabilities: {} };

await import('../out/main/index.js');
void app.whenReady().then(run).catch(async (error) => {
  report.steps.push({ name: `${phase}.failure`, passed: false, error: error instanceof Error ? error.message : String(error) });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`).catch(() => undefined);
  console.error('Native UI verification failed.', error);
  app.exit(1);
});

async function run() {
  window = await waitForWindow();
  await waitForLoad();
  await waitForSelector('nav[aria-label="Primary"]', 20_000);
  window.setContentSize(1420, 900, false);

  if (phase === 'verify') await verifyRestartPersistence();
  else await exerciseWorkflows();

  report.completedAt = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ phase, passed: true, steps: report.steps.length, reportPath }, null, 2));
  app.quit();
}

async function exerciseWorkflows() {
  await step('devices.open-g502', async () => {
    await openDevice('G502 X Plus');
    return { selected: 'G502 X Plus' };
  });

  const originalMouse = device(await snapshot(), 'G502 X Plus');
  const originalDpi = originalMouse.capabilities.dpi.activeDpi;
  const originalPollingRate = originalMouse.capabilities.reportRate.value;
  const originalShiftDpi = originalMouse.capabilities.dpi.shiftDpi;
  const originalLightingEnabled = originalMouse.capabilities.lighting.enabled;
  const originalLightingColor = originalMouse.capabilities.lighting.color;

  await step('devices.g502-dpi', async () => {
    const next = originalDpi === 3_200 ? 1_600 : 3_200;
    await clickSelector(`[aria-label="${next} DPI"]`);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.dpi.activeDpi === next, 'DPI update');
    return { from: originalDpi, to: next };
  });

  await step('devices.g502-dpi-shift', async () => {
    const next = originalShiftDpi === 700 ? 800 : 700;
    const editor = await setDpiShift(next);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.dpi.shiftDpi === next, 'DPI Shift update');
    return { from: originalShiftDpi, to: next, editor };
  });

  await step('devices.g502-polling-rate', async () => {
    const next = originalPollingRate === 500 ? 1_000 : 500;
    await clickSelector(`[aria-label="${next} hertz"]`);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.reportRate.value === next, 'polling-rate update');
    return { from: originalPollingRate, to: next };
  });

  await step('devices.g502-lighting', async () => {
    await clickSelector('[aria-label="Mouse lighting"]');
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.lighting.enabled !== originalLightingEnabled, 'lighting toggle');
    const enabled = device(await snapshot(), 'G502 X Plus').capabilities.lighting.enabled;
    if (!enabled) await clickSelector('[aria-label="Mouse lighting"]');
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.lighting.enabled, 'lighting enable');
    const nextColor = originalLightingColor?.toUpperCase() === '#FF4F7D' ? '#FF1744' : '#FF4F7D';
    const colorTrigger = await evaluate(`document.querySelector('.lighting-color-trigger')?.getAttribute('aria-label')`);
    if (!colorTrigger) throw new Error('The lighting color picker trigger was not rendered.');
    const mouse = device(await snapshot(), 'G502 X Plus');
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'lighting-color', color: nextColor } })})`);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.lighting.color?.toUpperCase() === nextColor, 'lighting color');
    return { enabled: true, color: nextColor, colorTrigger };
  });

  await step('devices.g502-button-assignment', async () => {
    const callout = await evaluate(`document.querySelector('button[aria-label^="Back, assigned to"]')?.getAttribute('aria-label')`);
    if (!callout) throw new Error('The Back button assignment callout was not rendered.');
    const mouse = device(await snapshot(), 'G502 X Plus');
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'button-assignment', buttonId: 'back', actionId: 'mouse.forward' } })})`);
    await waitSnapshot((value) => binding(value, 'back') === 'mouse.forward', 'button assignment');
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'button-assignment', buttonId: 'back', actionId: 'mouse.back' } })})`);
    await waitSnapshot((value) => binding(value, 'back') === 'mouse.back', 'button assignment restore');
    return { callout, button: 'Back', testedAssignment: 'Forward', restored: 'Back' };
  });

  await restoreMouse({ originalDpi, originalPollingRate, originalShiftDpi, originalLightingEnabled, originalLightingColor });

  await step('devices.open-quadcast', async () => {
    await openDevice('QuadCast 2');
    return { selected: 'QuadCast 2' };
  });

  const originalMicrophone = device(await snapshot(), 'QuadCast 2');
  const originalGain = originalMicrophone.settings.gain;
  const originalMonitoring = originalMicrophone.settings.monitoring;
  const originalMuteLed = originalMicrophone.settings.muteLed;

  await step('devices.quadcast-hardware-controls', async () => {
    const sliders = await evaluate(`
      [...document.querySelectorAll('[role="slider"]')]
        .filter((slider) => ['Input volume', 'Direct monitoring'].includes(slider.getAttribute('aria-label')))
        .map((slider) => ({ label: slider.getAttribute('aria-label'), min: slider.getAttribute('aria-valuemin'), max: slider.getAttribute('aria-valuemax'), value: slider.getAttribute('aria-valuenow') }))
    `);
    if (sliders.length !== 2) throw new Error(`QuadCast hardware sliders were incomplete: ${JSON.stringify(sliders)}`);
    await evaluate(`window.switchboard.setDeviceSetting(${JSON.stringify({ deviceId: originalMicrophone.id, key: 'gain', value: originalGain + 1 })})`);
    await waitSnapshot((value) => device(value, 'QuadCast 2').settings.gain === originalGain + 1, 'microphone gain');
    await evaluate(`window.switchboard.setDeviceSetting(${JSON.stringify({ deviceId: originalMicrophone.id, key: 'monitoring', value: originalMonitoring + 1 })})`);
    await waitSnapshot((value) => device(value, 'QuadCast 2').settings.monitoring === originalMonitoring + 1, 'direct monitoring');
    await clickSelector('[aria-label="Follow physical mute"]');
    await waitSnapshot((value) => device(value, 'QuadCast 2').settings.muteLed !== originalMuteLed, 'mute light toggle');
    return { sliders, gain: originalGain + 1, monitoring: originalMonitoring + 1, muteLed: !originalMuteLed };
  });

  await evaluate(`window.switchboard.setDeviceSetting(${JSON.stringify({ deviceId: originalMicrophone.id, key: 'gain', value: originalGain })})`);
  await evaluate(`window.switchboard.setDeviceSetting(${JSON.stringify({ deviceId: originalMicrophone.id, key: 'monitoring', value: originalMonitoring })})`);
  await clickSelector('[aria-label="Follow physical mute"]');
  report.capabilities.quadCastLighting = originalMicrophone.capabilities.lighting?.writable ? 'writable' : 'unavailable';

  // Replay length is canonical, Electron-main-owned capture state. The isolated
  // profile keeps capture disabled, so this write never starts Capture.Host.
  await step('capture.replay-length', async () => {
    const original = (await snapshot()).capture.config;
    if (original.enabled) throw new Error('Capture must stay disabled in the isolated native UI verification profile.');
    const next = original.replaySeconds === 90 ? 120 : 90;
    await evaluate(`window.switchboard.setCaptureConfig(${JSON.stringify({ replaySeconds: next })})`);
    await waitSnapshot((value) => value.capture.config.replaySeconds === next, 'Replay length');
    return { from: original.replaySeconds, to: next };
  });

  const finalState = await snapshot();
  const expectation = {
    replaySeconds: finalState.capture.config.replaySeconds,
    captureEnabled: finalState.capture.config.enabled,
  };
  await writeFile(expectationPath, `${JSON.stringify(expectation, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function verifyRestartPersistence() {
  const expected = JSON.parse(await readFile(expectationPath, 'utf8'));
  await step('application-restart.persistence', async () => {
    const value = await snapshot();
    const actual = {
      replaySeconds: value.capture.config.replaySeconds,
      captureEnabled: value.capture.config.enabled,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Persisted state mismatch: ${JSON.stringify({ expected, actual })}`);
    }
    return actual;
  });
}

async function step(name, action) {
  const evidence = await action();
  report.steps.push({ name, passed: true, evidence });
  console.log(`PASS ${name}`);
}

async function restoreMouse(values) {
  await clickSelector(`[aria-label="${values.originalDpi} DPI"]`);
  await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.dpi.activeDpi === values.originalDpi, 'DPI restore');
  await clickSelector(`[aria-label="${values.originalPollingRate} hertz"]`);
  await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.reportRate.value === values.originalPollingRate, 'polling-rate restore');
  await setDpiShift(values.originalShiftDpi);
  await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.dpi.shiftDpi === values.originalShiftDpi, 'DPI Shift restore');
  if (values.originalLightingColor) {
    if (!device(await snapshot(), 'G502 X Plus').capabilities.lighting.enabled) await clickSelector('[aria-label="Mouse lighting"]');
    const mouse = device(await snapshot(), 'G502 X Plus');
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'lighting-color', color: values.originalLightingColor } })})`);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.lighting.color?.toUpperCase() === values.originalLightingColor.toUpperCase(), 'lighting color restore');
  }
  const currentEnabled = device(await snapshot(), 'G502 X Plus').capabilities.lighting.enabled;
  if (currentEnabled !== values.originalLightingEnabled) await clickSelector('[aria-label="Mouse lighting"]');
}

async function setDpiShift(value) {
  const mouse = device(await snapshot(), 'G502 X Plus');
  const editor = await evaluate(`({ trigger: document.querySelector('.dpi-shift-control__value')?.textContent?.trim() })`);
  if (!editor.trigger) throw new Error('DPI Shift value control was not rendered.');
  Object.assign(editor, { min: mouse.capabilities.dpi.min, max: mouse.capabilities.dpi.max, step: mouse.capabilities.dpi.step });
  await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'dpi-shift', value } })})`);
  return editor;
}

async function openDevice(name) {
  await clickButtonText('Devices', 'nav[aria-label="Primary"]');
  await evaluate(`document.querySelector('.device-workbench__back')?.click()`);
  await waitForSelector('.device-gallery');
  await clickSelector(`button[aria-label*="${name}"]`);
  await waitForSelector('.device-workbench');
}

async function clickButtonText(text, scope = 'body') {
  const clicked = await evaluate(`
    (() => {
      const root = document.querySelector(${JSON.stringify(scope)});
      const button = [...(root?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)});
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Could not click button: ${text}.`);
}

async function clickSelector(selector) {
  await waitForSelector(selector);
  const clicked = await evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) || element.matches(':disabled')) return false;
      element.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Could not click ${selector}.`);
}

async function setReactInput(selector, value) {
  const focused = await evaluate(`
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement)) return false;
      input.focus();
      input.select();
      return document.activeElement === input;
    })()
  `);
  if (!focused) throw new Error(`Could not focus ${selector}.`);
  await window.webContents.insertText(String(value));
  await delay(60);
}

async function blurSelector(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.blur()`);
  await delay(80);
}

async function pressSliderKey(selector, key) {
  const focused = await evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) || element.matches(':disabled')) return false;
      element.focus();
      return document.activeElement === element;
    })()
  `);
  if (!focused) throw new Error(`Could not focus ${selector}.`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
  await delay(100);
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

async function waitForLoad() {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Switchboard renderer did not finish loading.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForSelector(selector, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(40);
  }
  const diagnostics = await evaluate(`({
    hash: location.hash,
    text: document.body.innerText.slice(0, 1_200),
    labels: [...document.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label')).filter(Boolean).slice(0, 80),
  })`);
  throw new Error(`Timed out waiting for ${selector}. ${JSON.stringify(diagnostics)}`);
}

async function waitForEnabledButton(text, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await evaluate(`
      [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === ${JSON.stringify(text)} && !button.disabled)
    `);
    if (ready) return;
    await delay(50);
  }
  const diagnostics = await evaluate(`({
    hash: location.hash,
    text: document.body.innerText.slice(0, 800),
    buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })).filter((button) => button.text)
  })`);
  throw new Error(`Timed out waiting for enabled button: ${text}. ${JSON.stringify(diagnostics)}`);
}

async function waitSnapshot(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await snapshot();
    if (predicate(value)) return value;
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function snapshot() {
  return evaluate('window.switchboard.getSnapshot()');
}

function evaluate(expression) {
  return window.webContents.executeJavaScript(expression, true);
}

function device(value, name) {
  const found = value.devices.find((candidate) => candidate.displayName === name);
  if (!found) throw new Error(`Missing fixture device: ${name}.`);
  return found;
}

function binding(value, buttonId) {
  return device(value, 'G502 X Plus').capabilities.buttonAssignments.bindings.find((candidate) => candidate.buttonId === buttonId)?.currentActionId;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
