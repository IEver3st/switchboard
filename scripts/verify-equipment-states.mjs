import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'design-qa', 'razer-hyperx-redesign', 'states');
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
  await evaluate(window, 'window.switchboard.updateSettings({onboardingCompleted:true,uiScalePercent:100})');
  await waitFor(window, "Boolean(document.querySelector('.device-gallery'))");
  window.setContentSize(1080,720);
  const baseline = await evaluate(window,'window.switchboard.getSnapshot()');
  const send = window.webContents.send.bind(window.webContents);
  window.webContents.send = (channel,...args) => { if(channel !== 'system:snapshot-updated') send(channel,...args); };
  const report=[];
  for (const kind of ['keyboard','microphone']) {
    send('system:snapshot-updated',baseline);
    await paint(window);
    await click(window, `document.querySelector('button[aria-label*="${kind === 'keyboard' ? 'Razer Huntsman' : 'HyperX QuadCast'}"]')`);
    await waitFor(window, `Boolean(document.querySelector('[data-device-kind="${kind}"]'))`);
    const unavailable = structuredClone(baseline);
    const d=unavailable.devices.find(d=>d.kind===kind);
    d.connected=false;
    d.capabilities.lighting.writable=false;
    d.capabilities.lighting.state='unknown';
    d.capabilities.lighting.unavailableReason='Reconnect the device, then try again.';
    if(kind==='keyboard') {
      d.capabilities.keyboard.transport='unavailable';
      d.capabilities.keyboard.gamingMode.writable=false;
      d.capabilities.keyboard.onboardProfiles.writable=false;
    }
    send('system:snapshot-updated',unavailable);
    await waitFor(window, `document.querySelector('.device-workbench__meta')?.textContent?.includes('Disconnected')`);
    await capture(window,`${kind}-1080x720-disconnected`,report);
    const enabled = await evaluate(window, `[...document.querySelectorAll('.device-workbench [role="switch"],.device-workbench [role="slider"]')].filter(e=> !e.disabled && e.getAttribute('aria-disabled')!=='true' && !e.closest('[data-disabled]')).length`);
    if(enabled) throw new Error(`${kind}: ${enabled} writable controls after disconnect`);
    if(kind==='keyboard') {
      // Keep a partial transport failure distinct from an unplugged keyboard.
      d.connected=true;
      send('system:snapshot-updated',unavailable);
      await paint(window);
      await capture(window,'keyboard-1080x720-unavailable',report);
    }
    send('system:snapshot-updated',baseline);
    await paint(window);
    await window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await paint(window);
    await capture(window,`${kind}-1080x720-reduced-motion`,report);
    await window.webContents.debugger.detach();
    window.webContents.setZoomFactor(1.5);
    await paint(window);
    await capture(window,`${kind}-150percent`,report,false);
    window.webContents.setZoomFactor(1);
    await click(window,`document.querySelector('.device-workbench__back')`);
  }
  await writeFile(join(outputDirectory,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  app.exit(0);
}
async function capture(window,name,report,requireFirstViewport=true) {
  await paint(window);
  const metrics=await evaluate(window,`(() => {
    const root=document.querySelector('.device-workbench');
    const viewport=document.querySelector('[data-radix-scroll-area-viewport]');
    return {width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,workspaceWidth:viewport?.clientWidth,workspaceScroll:viewport?.scrollWidth,bottom:root.getBoundingClientRect().bottom,controlsBottom:Math.max(...[...root.querySelectorAll('button,[role="slider"]')].map(e=>e.getBoundingClientRect().bottom))};
  })()`);
  if(metrics.scroll>metrics.width || metrics.workspaceScroll>metrics.workspaceWidth || (requireFirstViewport && metrics.controlsBottom>metrics.height+2)) throw new Error('Overflow '+name+': '+JSON.stringify(metrics));
  await waitFor(window, `Boolean(document.querySelector('.device-workbench canvas[data-render-state="ready"]')) && !document.querySelector('.device-workbench .device-render__skeleton')`);
  await paint(window);
  await writeFile(join(outputDirectory,name+'.png'),(await window.webContents.capturePage()).toPNG());
  report.push({name,metrics});
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
