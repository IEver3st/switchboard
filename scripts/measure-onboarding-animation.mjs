import { app, BrowserWindow } from 'electron';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// Keep unattended samples independent of foreground-window/Windows occlusion throttling.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.setName('switchboard-animation-measure');
app.setAppPath(root);
app.setPath('userData', await mkdtemp(join(tmpdir(), 'switchboard-animation-measure-')));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
await import('../out/main/index.js');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
void app.whenReady().then(async () => {
  let window;
  for (let i = 0; i < 200; i++) {
    window = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (window && !window.webContents.isLoading() && await window.webContents.executeJavaScript(`Boolean(document.querySelector('.onboarding-contours'))`)) break;
    await delay(100);
  }
  window.show();
  window.focus();
  await window.webContents.executeJavaScript('window.switchboard.updateSettings({ uiScalePercent: 100 })');
  await delay(1000);
  window.setMaximizable(false);
  if (window.isMaximized()) window.unmaximize();
  await delay(200);
  window.setContentSize(1920, 1080);
  window.setResizable(false);
  window.setAlwaysOnTop(true);
  window.webContents.setBackgroundThrottling(false);
  window.show();
  window.focus();
  await delay(1500);
  const results = [];
  for (const paused of [false, true]) {
    await window.webContents.executeJavaScript(`document.querySelector('.onboarding-backdrop').setAttribute('data-paused', '${paused}')`);
    await delay(500);
    const events = [];
    const debug = window.webContents.debugger;
    debug.attach('1.3');
    let complete;
    const completed = new Promise((r) => { complete = r; });
    const handler = (_event, method, params) => {
      if (method === 'Tracing.dataCollected') events.push(...params.value);
      if (method === 'Tracing.tracingComplete') complete();
    };
    debug.on('message', handler);
    await debug.sendCommand('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
    const frames = await window.webContents.executeJavaScript(`new Promise((resolve) => {
      const gaps = []; let start; let previous;
      function frame(time) {
        if (start === undefined) start = time;
        if (previous !== undefined) gaps.push(time - previous);
        previous = time;
        if (time - start < 3000) requestAnimationFrame(frame);
        else { gaps.sort((a,b) => a-b); resolve({ count: gaps.length, p95: gaps[Math.floor(gaps.length * .95)], max: gaps.at(-1), width: innerWidth, height: innerHeight }); }
      } requestAnimationFrame(frame);
    })`);
    await debug.sendCommand('Tracing.end');
    await completed;
    debug.off('message', handler);
    debug.detach();
    const metrics = {};
    for (const name of ['Paint', 'PrePaint', 'Layout', 'UpdateLayoutTree', 'RasterTask']) {
      const matching = events.filter((e) => e.name === name && e.ph === 'X');
      metrics[name] = { count: matching.length, totalMs: Math.round(matching.reduce((sum, e) => sum + (e.dur ?? 0), 0) / 1000 * 100) / 100 };
    }
    results.push({ paused, frames, metrics });
  }
  const sameViewport = results[0].frames.width === results[1].frames.width && results[0].frames.height === results[1].frames.height;
  const report = { results, sameViewport, pass: sameViewport && results[0].frames.p95 <= Math.max(20, results[1].frames.p95 * 2) && results[0].frames.count >= 150 };
  const label = process.argv.find((arg) => arg.startsWith('--label='))?.slice(8) ?? 'latest';
  if (label !== 'before') {
    await window.webContents.executeJavaScript(`document.querySelector('.onboarding-motion-toggle').click()`);
    await delay(100);
    const pausedCount = await window.webContents.executeJavaScript(`document.getAnimations().filter(a => a.playState === 'running').length`);
    await window.webContents.executeJavaScript(`document.querySelector('.onboarding-motion-toggle').click()`);
    await delay(100);
    const resumedCount = await window.webContents.executeJavaScript(`document.getAnimations().filter(a => a.playState === 'running').length`);
    const debuggerApi = window.webContents.debugger;
    debuggerApi.attach('1.3');
    await debuggerApi.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await delay(150);
    const reducedAnimations = await window.webContents.executeJavaScript(`document.getAnimations().filter(a => a.playState === 'running').map(a => ({ target: a.effect?.target?.getAttribute('class'), duration: a.effect?.getTiming().duration }))`);
    const reducedCount = reducedAnimations.length;
    await debuggerApi.sendCommand('Emulation.setEmulatedMedia', { features: [] });
    debuggerApi.detach();
    report.motionControls = { pausedCount, resumedCount, reducedCount, reducedAnimations };
    console.log(JSON.stringify(report.motionControls));
    report.pass &&= pausedCount === 0 && resumedCount === 2 && reducedCount === 0;
    window.setResizable(true);
    report.captures = [];
    for (const [width, height] of [[1080,720], [1420,900], [1920,1080]]) {
      let layout;
      for (let retry = 0; retry < 10; retry++) {
        if (window.isMaximized()) window.unmaximize();
        window.setContentSize(width, height);
        await delay(250);
        layout = await window.webContents.executeJavaScript(`({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth })`);
        if (layout.width === width && Math.abs(layout.height - height) <= 2) break;
      }
      if (layout.width !== width || Math.abs(layout.height - height) > 2 || layout.overflow) throw new Error(`Unexpected capture layout: ${JSON.stringify(layout)}`);
      const filename = `optimized-${width}x${height}.png`;
      await writeFile(join(root, 'design-qa/onboarding-redesign', filename), (await window.webContents.capturePage()).toPNG());
      report.captures.push({ filename, ...layout });
    }
  }
  await writeFile(join(root, 'design-qa/onboarding-redesign', `animation-${label}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  app.exit(report.pass ? 0 : 1);
}).catch((error) => { console.error(error); app.exit(1); });
