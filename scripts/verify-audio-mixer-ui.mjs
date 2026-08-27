import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, '.impeccable', 'review', 'audio');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-audio-interaction-'));
const viewports = [
  { name: '1080x720', width: 1080, height: 720 },
  { name: '1420x900', width: 1420, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
app.setName('switchboard-audio-interaction-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_AUDIO_HOST = join(projectRoot, 'engines', 'audio-host', 'bin', 'Release', 'net10.0-windows', 'Audio.Host.exe');

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
  await openMixer();

  const layouts = [];
  for (const viewport of viewports) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(viewport.width, viewport.height, false);
    await waitForViewport(viewport);
    await selectMix('Personal');
    const metrics = await inspect();
    assert(metrics.channelCount === 6, `Expected six mixer strips at ${viewport.name}, received ${metrics.channelCount}.`);
    assert(metrics.exactInputs === 6, `Expected six exact percentage inputs at ${viewport.name}, received ${metrics.exactInputs}.`);
    assert(metrics.destinationMixes === 3, `Expected three destination mixes at ${viewport.name}.`);
    assert(!metrics.horizontalOverflow, `The mixer has horizontal overflow at ${viewport.name}.`);
    assert(metrics.chatMixVisibleWithoutScroll, `ChatMix requires mandatory scrolling at ${viewport.name}: ${JSON.stringify(metrics)}.`);
    const image = await window.webContents.capturePage();
    await writeFile(join(outputDirectory, `${viewport.name}-audio-mixer.png`), image.toPNG());
    layouts.push({ viewport, metrics });
  }

  window.setContentSize(1420, 900, false);
  await waitForViewport(viewports[1]);
  await selectMix('Personal');

  await setExactValue('Personal master', 127);
  await waitForSnapshot((snapshot) => findMix(snapshot, 'personal').master.gain === 1.27);
  await setExactValue('Game in personal mix', 83);
  await waitForSnapshot((snapshot) => findMix(snapshot, 'personal').buses.find((bus) => bus.id === 'game')?.gain === 0.83);

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
  await setExactValue('Personal master', 127);
  await waitForSnapshot((snapshot) => findMix(snapshot, 'personal').master.gain === 1.27);

  await clickMasterMute();
  await waitForSnapshot((snapshot) => findMix(snapshot, 'personal').master.enabled === false);
  await clickMasterMute();
  await waitForSnapshot((snapshot) => findMix(snapshot, 'personal').master.enabled === true);

  await selectMix('Stream');
  await setExactValue('Game in stream mix', 61);
  await waitForSnapshot((snapshot) => findMix(snapshot, 'stream').buses.find((bus) => bus.id === 'game')?.gain === 0.61);
  await waitForSnapshot((snapshot) => findMix(snapshot, 'personal').buses.find((bus) => bus.id === 'game')?.gain === 0.83);
  const streamImage = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, '1420x900-audio-mixer-stream.png'), streamImage.toPNG());

  await selectMix('Clip');
  await setExactValue('Microphone in clip mix', 44);
  await waitForSnapshot((snapshot) => findMix(snapshot, 'clip').buses.find((bus) => bus.id === 'mic')?.gain === 0.44);
  const clipImage = await window.webContents.capturePage();
  await writeFile(join(outputDirectory, '1420x900-audio-mixer-clip.png'), clipImage.toPNG());

  window.webContents.reload();
  await waitForLoad(window);
  await openMixer();
  await selectMix('Personal');
  const restoredPersonal = await inspect();
  assert(restoredPersonal.values['Personal master'] === '127', `Personal master did not survive reload: ${restoredPersonal.values['Personal master']}.`);
  assert(restoredPersonal.values['Game in personal mix'] === '83', `Personal Game did not survive reload: ${restoredPersonal.values['Game in personal mix']}.`);
  await selectMix('Stream');
  const restoredStream = await inspect();
  assert(restoredStream.values['Game in stream mix'] === '61', `Stream Game did not survive reload: ${restoredStream.values['Game in stream mix']}.`);
  await selectMix('Clip');
  const restoredClip = await inspect();
  assert(restoredClip.values['Microphone in clip mix'] === '44', `Clip microphone did not survive reload: ${restoredClip.values['Microphone in clip mix']}.`);

  const report = {
    layouts,
    dragReadout,
    restored: { personal: restoredPersonal, stream: restoredStream, clip: restoredClip },
    personalRoundTrip: true,
    destinationIsolation: true,
    muteRoundTrip: true,
  };
  await writeFile(join(outputDirectory, 'audio-mixer-interaction-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  app.quit();
}

async function openMixer() {
  await waitForSelector('nav[aria-label="Primary"]');
  const opened = await window.webContents.executeJavaScript(`
    (() => {
      const audioButton = [...document.querySelectorAll('nav[aria-label="Primary"] button')]
        .find((button) => button.textContent?.trim() === 'Audio');
      if (!audioButton) return false;
      audioButton.click();
      window.location.hash = 'audio/mixer';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return true;
    })()
  `);
  assert(opened, 'Could not open the Audio workspace.');
  await waitForSelector('.mixer-channel--master');
  await waitForAbsent('.startup-screen');
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
        destinationMixes: document.querySelectorAll('.mixer-destination [role="radio"]').length,
        selectedMix: document.querySelector('.mixer-destination [data-state="on"]')?.textContent?.trim() ?? null,
        chatMixVisibleWithoutScroll: (() => {
          const chatMix = document.querySelector('.chatmix-control');
          if (!chatMix || !viewport) return false;
          const chatMixBounds = chatMix.getBoundingClientRect();
          const viewportBounds = viewport.getBoundingClientRect();
          return chatMixBounds.bottom <= viewportBounds.bottom + 1;
        })(),
        verticalGeometry: (() => {
          const chatMix = document.querySelector('.chatmix-control');
          if (!chatMix || !viewport) return null;
          const chatMixBounds = chatMix.getBoundingClientRect();
          const viewportBounds = viewport.getBoundingClientRect();
          return {
            chatMixBottom: Math.round(chatMixBounds.bottom),
            viewportBottom: Math.round(viewportBounds.bottom),
            viewportClientHeight: viewport.clientHeight,
            viewportScrollHeight: viewport.scrollHeight,
          };
        })(),
        values,
      };
    })()
  `);
}

async function selectMix(label) {
  const clicked = await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector(${JSON.stringify(`[aria-label="${label} mix"]`)});
      button?.click();
      return Boolean(button);
    })()
  `);
  assert(clicked, `Could not select the ${label} mix.`);
  await delay(80);
}

function findMix(snapshot, id) {
  const mix = snapshot.audio.mixes.find((candidate) => candidate.id === id);
  if (!mix) throw new Error(`Missing ${id} destination mix.`);
  return mix;
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

async function setExactValue(label, value) {
  const changed = await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('input[aria-label=${JSON.stringify(`${label} exact volume percentage`)}]');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      input.focus();
      setter.call(input, ${JSON.stringify(String(value))});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
  assert(changed, `Could not set ${label} exact percentage.`);
  await delay(40);
  await window.webContents.executeJavaScript(`
    document.querySelector('input[aria-label=${JSON.stringify(`${label} exact volume percentage`)}]')?.blur()
  `);
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
  let lastSnapshot;
  while (Date.now() < deadline) {
    const snapshot = await window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
    lastSnapshot = snapshot;
    if (predicate(snapshot)) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for canonical audio state: ${JSON.stringify(lastSnapshot?.audio?.mixes)}.`);
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
  const diagnostics = await window.webContents.executeJavaScript(`({
    hash: window.location.hash,
    title: document.title,
    body: document.body?.innerText?.slice(0, 800) ?? '',
  })`);
  throw new Error(`Timed out waiting for ${selector}: ${JSON.stringify(diagnostics)}.`);
}

async function waitForAbsent(selector) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const found = await window.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (!found) return;
    await delay(40);
  }
  throw new Error(`Timed out waiting for ${selector} to be removed.`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
