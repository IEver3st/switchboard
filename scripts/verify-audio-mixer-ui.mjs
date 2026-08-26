import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'audio');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-audio-interaction-'));
app.setName('switchboard-audio-interaction-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');
let window;

void app.whenReady().then(run).catch((error) => {
  console.error('Audio mixer verification failed.', error);
  app.exit(1);
});

async function run() {
  window = await waitForWindow();
  await waitForLoad(window);
  window.setContentSize(1420, 900, false);
  await delay(200);
  await openMixer();

  const initial = await inspect();
  assert(initial.channelCount === 5, `Expected five mixer strips, received ${initial.channelCount}.`);
  assert(initial.exactInputs === 5, `Expected five exact percentage inputs, received ${initial.exactInputs}.`);
  assert(!initial.horizontalOverflow, 'The mixer has horizontal overflow at 1420x900.');

  await setExactValue('Master', 127);
  await waitForSnapshot((snapshot) => snapshot.audio.master.gain === 1.27);
  await setExactValue('Game', 83);
  await waitForSnapshot((snapshot) => snapshot.audio.buses.find((bus) => bus.id === 'game')?.gain === 0.83);

  const thumbPoint = await window.webContents.executeJavaScript(`
    (() => {
      const slider = document.querySelector('.mixer-channel--master [role="slider"]');
      if (!slider) return null;
      const bounds = slider.getBoundingClientRect();
      return { x: Math.round(bounds.left + bounds.width / 2), y: Math.round(bounds.top + bounds.height / 2) };
    })()
  `);
  assert(thumbPoint, 'Could not locate the master fader thumb.');
  window.webContents.sendInputEvent({ type: 'mouseMove', x: thumbPoint.x, y: thumbPoint.y });
  window.webContents.sendInputEvent({ type: 'mouseDown', x: thumbPoint.x, y: thumbPoint.y, button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseMove', x: thumbPoint.x, y: thumbPoint.y - 36, button: 'left' });
  await delay(180);
  const dragReadout = await window.webContents.executeJavaScript(`
    (() => {
      const output = document.querySelector('.mixer-channel--master .mixer-fader__floating-value');
      return {
        visible: output ? Number(getComputedStyle(output).opacity) > 0.9 : false,
        text: output?.textContent?.trim() ?? null,
        className: output?.className ?? null,
        opacity: output ? getComputedStyle(output).opacity : null,
      };
    })()
  `);
  assert(dragReadout.visible && /^\d+%$/.test(dragReadout.text ?? ''), `Unexpected drag readout: ${JSON.stringify(dragReadout)}.`);

  const image = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, '1420x900-audio-mixer-adjusting.png'), image.toPNG());
  window.webContents.sendInputEvent({ type: 'mouseUp', x: thumbPoint.x, y: thumbPoint.y, button: 'left', clickCount: 1 });
  await setExactValue('Master', 127);
  await waitForSnapshot((snapshot) => snapshot.audio.master.gain === 1.27);

  await clickMasterMute();
  await waitForSnapshot((snapshot) => snapshot.audio.master.enabled === false);
  await clickMasterMute();
  await waitForSnapshot((snapshot) => snapshot.audio.master.enabled === true);

  window.webContents.reload();
  await waitForLoad(window);
  await openMixer();
  const restored = await inspect();
  assert(restored.values.Master === '127', `Master percentage did not survive reload: ${restored.values.Master}.`);
  assert(restored.values.Game === '83', `Game percentage did not survive reload: ${restored.values.Game}.`);

  const report = { initial, dragReadout, restored, masterRoundTrip: true, gameRoundTrip: true, muteRoundTrip: true };
  await writeFile(join(outputDirectory, 'audio-mixer-interaction-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  app.quit();
}

async function openMixer() {
  await window.webContents.executeJavaScript(`
    (() => {
      window.location.hash = 'audio/mixer';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return true;
    })()
  `);
  await waitForSelector('.mixer-channel--master');
}

async function inspect() {
  return window.webContents.executeJavaScript(`
    (() => {
      const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
      const values = {};
      document.querySelectorAll('.mixer-fader__exact input').forEach((input) => {
        const label = input.getAttribute('aria-label')?.replace(' exact volume percentage', '');
        if (label) values[label] = input.value;
      });
      return {
        channelCount: document.querySelectorAll('.mixer-channel').length,
        exactInputs: document.querySelectorAll('.mixer-fader__exact input').length,
        horizontalOverflow: Boolean(viewport && viewport.scrollWidth > viewport.clientWidth),
        values,
      };
    })()
  `);
}

async function setExactValue(label, value) {
  const changed = await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('input[aria-label=${JSON.stringify(`${label} exact volume percentage`)}]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, ${JSON.stringify(String(value))});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
      return true;
    })()
  `);
  assert(changed, `Could not set ${label} exact percentage.`);
}

async function clickMasterMute() {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.mixer-channel--master button[aria-pressed]');
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  assert(clicked, 'Could not find the master mute button.');
}

async function waitForSnapshot(predicate) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const snapshot = await window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
    if (predicate(snapshot)) return;
    await delay(40);
  }
  throw new Error('Timed out waiting for canonical audio state.');
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
    const timeout = setTimeout(() => rejectLoad(new Error('Renderer did not finish loading.')), 20_000);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
