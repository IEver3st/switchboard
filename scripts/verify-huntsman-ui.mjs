import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'huntsman-v2-analog');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-huntsman-review-'));

app.setName('switchboard-huntsman-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error('Huntsman V2 Analog UI verification failed.', error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await waitFor(window, `!document.querySelector('.startup-screen')`);
  await openKeyboard(window);

  const keyboard = await keyboardSnapshot(window);
  await click(window, `document.querySelector('button[aria-label="Gaming Mode"]')`);
  await waitForKeyboard(window, { gamingMode: { enabled: true } });

  await click(window, `document.querySelector('button[aria-label="Active onboard keyboard profile"]')`);
  await waitFor(window, `[...document.querySelectorAll('[role="option"]')].some((option) => option.textContent?.trim() === 'Profile 2')`);
  await click(window, `[...document.querySelectorAll('[role="option"]')].find((option) => option.textContent?.trim() === 'Profile 2')`);
  await waitForKeyboard(window, { onboardProfiles: { activeProfileId: '2' } });

  const unavailableInputControls = await evaluate(window, `({
    rapidTriggerDisabled: document.querySelector('button[aria-label="Rapid Trigger"]')?.disabled,
    snapTapDisabled: document.querySelector('button[aria-label="Snap Tap"]')?.disabled,
  })`);
  if (!unavailableInputControls.rapidTriggerDisabled || !unavailableInputControls.snapTapDisabled) {
    throw new Error('Synapse-owned input controls must remain visibly unavailable on the V2 firmware fixture.');
  }

  await click(window, `[...document.querySelectorAll('.keyboard-effect-option')].find((button) => button.textContent?.trim() === 'Static')`);
  await waitForLighting(window, { activeEffectId: 'static' });

  await setControl(window, keyboard.id, { type: 'lighting-color', color: '#4466aa' });
  await setControl(window, keyboard.id, { type: 'lighting-brightness', brightness: 62 });
  await setControl(window, keyboard.id, { type: 'lighting-enabled', enabled: false });
  await waitForLighting(window, { enabled: false });
  await setControl(window, keyboard.id, { type: 'lighting-enabled', enabled: true });
  await waitForLighting(window, { enabled: true, color: '#4466aa', brightness: 62, activeEffectId: 'static' });

  window.webContents.reloadIgnoringCache();
  await waitForLoad(window);
  await waitFor(window, `!document.querySelector('.startup-screen')`);
  await openKeyboard(window);
  await waitForLighting(window, { enabled: true, color: '#4466aa', brightness: 62, activeEffectId: 'static' });
  await waitForKeyboard(window, { gamingMode: { enabled: true }, onboardProfiles: { activeProfileId: '2' } });

  const captures = [];
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(viewport.width, viewport.height, false);
    await waitFor(window, `innerWidth === ${viewport.width} && Math.abs(innerHeight - ${viewport.height}) <= 2`);
    await paint(window);
    const metrics = await evaluate(window, `(() => {
      const workspace = document.querySelector('[data-radix-scroll-area-viewport]');
      const workbench = document.querySelector('.keyboard-workbench');
      const routineControls = document.querySelector('.keyboard-lighting__truth');
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        workspaceWidth: workspace?.clientWidth ?? null,
        workspaceScrollWidth: workspace?.scrollWidth ?? null,
        workbenchBottom: workbench?.getBoundingClientRect().bottom ?? null,
        routineControlsBottom: routineControls?.getBoundingClientRect().bottom ?? null,
        innerHeight,
      };
    })()`);
    if (metrics.documentWidth > metrics.viewportWidth || metrics.workspaceScrollWidth > metrics.workspaceWidth) {
      throw new Error(`${viewport.width}x${viewport.height} has horizontal overflow.`);
    }
    if (metrics.routineControlsBottom > metrics.innerHeight) {
      throw new Error(`Routine keyboard controls require scrolling at ${viewport.width}x${viewport.height}.`);
    }
    const filename = `${viewport.width}x${viewport.height}-static.png`;
    const image = await window.webContents.capturePage();
    await writeFile(join(outputDirectory, filename), image.toPNG());
    captures.push({ viewport, filename, metrics });
  }

  const finalDevice = await keyboardSnapshot(window);
  const report = {
    finalLighting: finalDevice.capabilities.lighting,
    finalKeyboard: finalDevice.capabilities.keyboard,
    persistedSettings: finalDevice.settings,
    captures,
  };
  await writeFile(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, ...report }, null, 2));
  app.quit();
}

async function openKeyboard(window) {
  if (await evaluate(window, `document.querySelector('.device-workbench__identity h2')?.textContent?.trim() === 'Huntsman V2 Analog'`)) return;
  const back = await evaluate(window, `[...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'All devices')`);
  if (back) await evaluate(window, `[...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'All devices')?.click()`);
  await waitFor(window, `Boolean(document.querySelector('.device-gallery'))`);
  const opened = await evaluate(window, `(() => {
    const target = document.querySelector('button[aria-label*="Razer Huntsman V2 Analog"]');
    target?.click();
    return Boolean(target);
  })()`);
  if (!opened) throw new Error('The Huntsman V2 Analog device was not present in the gallery.');
  await waitFor(window, `Boolean(document.querySelector('.keyboard-console'))`);
}

async function keyboardSnapshot(window) {
  const snapshot = await evaluate(window, 'window.switchboard.getSnapshot()');
  const keyboard = snapshot.devices.find((device) => device.displayName === 'Huntsman V2 Analog');
  if (!keyboard) throw new Error('The Huntsman V2 Analog device was not found.');
  return keyboard;
}

async function setControl(window, deviceId, change) {
  await evaluate(window, `window.switchboard.setDeviceControl(${JSON.stringify({ deviceId, change })})`);
}

async function waitForLighting(window, expected) {
  await waitFor(window, `(async () => {
    const snapshot = await window.switchboard.getSnapshot();
    const lighting = snapshot.devices.find((device) => device.displayName === 'Huntsman V2 Analog')?.capabilities.lighting;
    return ${JSON.stringify(expected)} && Object.entries(${JSON.stringify(expected)}).every(([key, value]) => lighting?.[key] === value);
  })()`);
}

async function waitForKeyboard(window, expected) {
  await waitFor(window, `(async () => {
    const snapshot = await window.switchboard.getSnapshot();
    const keyboard = snapshot.devices.find((device) => device.displayName === 'Huntsman V2 Analog')?.capabilities.keyboard;
    const expected = ${JSON.stringify(expected)};
    return Object.entries(expected).every(([key, value]) => (
      typeof value === 'object'
        ? Object.entries(value).every(([childKey, childValue]) => keyboard?.[key]?.[childKey] === childValue)
        : keyboard?.[key] === value
    ));
  })()`);
}

async function click(window, source) {
  const clicked = await evaluate(window, `(() => {
    const target = ${source};
    target?.click();
    return Boolean(target);
  })()`);
  if (!clicked) throw new Error(`Could not click: ${source}`);
  await paint(window);
}

function evaluate(window, source) {
  return window.webContents.executeJavaScript(source, true);
}

async function waitFor(window, source, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(window, source)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for: ${source}`);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await delay(40);
  }
  throw new Error('Switchboard did not create a window.');
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

async function paint(window) {
  await evaluate(window, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await delay(80);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
