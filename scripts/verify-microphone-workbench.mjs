import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'razer-hyperx-redesign', 'microphone');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-huntsman-review-'));
app.setName('switchboard-huntsman-review');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await mkdir(outputDirectory, { recursive: true });
await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error('Equipment workbench verification failed.', error);
  app.exit(1);
});


async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await waitFor(window, 'Boolean(window.switchboard)');
  await evaluate(window, 'window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100 })');
  await waitFor(window, "Boolean(document.querySelector('.device-gallery'))");
  await openMicrophone(window);
  const report = { captures: [], interactions: [] };
  for (const size of [[1080,720],[1420,900],[1920,1080]]) {
    window.setContentSize(...size);
    await paint(window);
    await captureState(window, report, `${size.join('x')}-ready`);
  }
  window.setContentSize(1080,720);
  await paint(window);
  for (const label of ['Input volume', 'Direct monitoring', 'Brightness']) {
    const selector = `[role="slider"][aria-label="${label}"]`;
    await evaluate(window, `document.querySelector(${JSON.stringify(selector)}).focus()`);
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
    await paint(window);
    const device = await mic(window);
    const expected = label === 'Input volume' ? 59 : label === 'Direct monitoring' ? 19 : 73;
    const actual = label === 'Input volume' ? device.settings.gain : label === 'Direct monitoring' ? device.settings.monitoring : device.capabilities.lighting.brightness;
    if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
    report.interactions.push({label,actual});
  }
  await click(window, `document.querySelector('[aria-label="Lighting pattern"] button[data-state="off"]')`);
  await waitFor(window, `Boolean(document.querySelector('[aria-label="Effect speed"]'))`);
  await captureState(window, report, '1080x720-breathing');
  await evaluate(window, `document.querySelector('[aria-label="Effect speed"]').focus()`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
  await paint(window);
  const speed = (await mic(window)).capabilities.lighting.speed;
  if (speed !== 51) throw new Error(`Speed did not commit: ${speed}`);
  report.interactions.push({label:'Effect speed',actual:speed});
  await click(window, `document.querySelector('[aria-label="Follow physical mute"]')`);
  await waitFor(window, `document.querySelector('.microphone-hardware')?.getAttribute('aria-busy') === 'false'`);
  await click(window, `document.querySelector('[aria-label="Lighting"]')`);
  await waitFor(window, `document.querySelector('[aria-label="Lighting"]')?.getAttribute('aria-checked') === 'false'`);
  await waitFor(window, `document.querySelector('.microphone-stage canvas')?.dataset.renderState === 'ready'`);
  await captureState(window, report, '1080x720-lighting-off');
  await waitFor(window, `document.querySelector('.microphone-hardware')?.getAttribute('aria-busy') === 'false'`);
  const before = await mic(window);
  window.webContents.reloadIgnoringCache();
  await waitForLoad(window);
  await waitFor(window, "Boolean(document.querySelector('.device-gallery'))");
  await openMicrophone(window);
  const after = await mic(window);
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings) || JSON.stringify(before.capabilities.lighting) !== JSON.stringify(after.capabilities.lighting)) throw new Error('Microphone values did not survive renderer reload');
  report.persistence = true;
  for (const profile of ['Broadcast','Breathe','Night']) {
    await click(window, `[...document.querySelectorAll('[aria-label="Lighting profile"] button')].find(b=>b.textContent?.trim()===${JSON.stringify(profile)})`);
    await waitFor(window, `document.querySelector('.microphone-hardware')?.getAttribute('aria-busy') === 'false'`);
    const chosen = await mic(window);
    if(chosen.capabilities.lighting.activeProfileId !== profile.toLowerCase()) throw new Error('Profile did not apply: '+profile);
    report.interactions.push({label:'Lighting profile',value:profile});
  }
  if (!(await mic(window)).capabilities.lighting.enabled) {
    await click(window, `document.querySelector('[aria-label="Lighting"]')`);
    await waitFor(window, `document.querySelector('[aria-label="Lighting"]')?.getAttribute('aria-checked') === 'true'`);
  }
  for (const pattern of ['Solid','Breathing','Pulse']) {
    await click(window, `[...document.querySelectorAll('[aria-label="Lighting pattern"] button')].find(b=>b.textContent?.trim()===${JSON.stringify(pattern)})`);
    await waitFor(window, `document.querySelector('.microphone-hardware')?.getAttribute('aria-busy') === 'false'`);
    const chosen = await mic(window);
    if(chosen.capabilities.lighting.activeEffectId !== pattern.toLowerCase()) throw new Error('Pattern did not apply: '+pattern);
    report.interactions.push({label:'Lighting pattern',value:pattern});
  }
  ipcMain.removeHandler('devices:set-setting');
  ipcMain.handle('devices:set-setting', async () => { await delay(300); throw new Error('Review: microphone disconnected during write.'); });
  await evaluate(window, `document.querySelector('[aria-label="Input volume"]').focus()`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
  await delay(650);
  await waitFor(window, `document.querySelector('[aria-label="Input volume"]')?.getAttribute('aria-valuenow') === '59'`, 1200);
  report.rejectedWriteRestored = true;
  await writeFile(join(outputDirectory,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  app.exit(0);
}
async function openMicrophone(window) {
  await click(window, `document.querySelector('button[aria-label*="HyperX QuadCast 2"]')`);
  await waitFor(window, `Boolean(document.querySelector('.microphone-hardware'))`);
  await waitFor(window, `document.querySelector('.microphone-stage canvas')?.dataset.renderState === 'ready'`);
}
async function mic(window) {
  return evaluate(window, `window.switchboard.getSnapshot().then(s=>s.devices.find(d=>d.displayName==='QuadCast 2'))`);
}
async function captureState(window, report, name) {
  await paint(window);
  await delay(400);
  await waitFor(window, `!document.querySelector('.microphone-stage .device-render__skeleton')`);
  const metrics = await evaluate(window, `(() => {
    const root = document.querySelector('.microphone-hardware');
    const bounds = root.getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,bottom:bounds.bottom,overflow:[...root.querySelectorAll('button,[role="slider"]')].filter(e=>e.getBoundingClientRect().right>innerWidth||e.getBoundingClientRect().bottom>innerHeight).map(e=>e.getAttribute('aria-label')||e.textContent)};
  })()`);
  if(metrics.scroll>metrics.width || metrics.overflow.length) throw new Error(`Overflow ${name}: ${JSON.stringify(metrics)}`);
  await writeFile(join(outputDirectory,`${name}.png`),(await window.webContents.capturePage()).toPNG());
  const switches=await evaluate(window, `[...document.querySelectorAll('[role="switch"]')].map(e=>({label:e.getAttribute('aria-label'),checked:e.getAttribute('aria-checked'),state:e.dataset.state,thumbState:e.firstElementChild?.dataset.state,translate:getComputedStyle(e.firstElementChild).translate}))`);
  report.captures.push({name,metrics,switches});
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
  await evaluate(window, `new Promise((resolve) => {
    const fallback = setTimeout(resolve, 500);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(fallback);
      resolve();
    }));
  })`);
  await delay(80);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
