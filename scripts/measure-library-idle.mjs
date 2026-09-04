import { app, BrowserWindow } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Read the selected library, but perform every mutation in an isolated profile.
const source = process.env.SWITCHBOARD_LIBRARY_STATE;
if (!source) throw new Error('Set SWITCHBOARD_LIBRARY_STATE to a state file with indexed clips.');
const output = resolve(process.env.SWITCHBOARD_LIBRARY_OUTPUT ?? 'design-qa/library-performance');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-library-performance-'));
const state = JSON.parse(await readFile(source, 'utf8'));
// Reconciliation may prune stale thumbnails. Give it owned copies, never the
// user's original cache files, even when the source media is missing.
await mkdir(join(profile, 'cache', 'thumbnails'), { recursive: true });
for (const clip of state.clips) {
  if (!clip.thumbnailPath) continue;
  const thumbnail = join(profile, 'cache', 'thumbnails', `${encodeURIComponent(clip.id)}.v2.jpg`);
  try { await copyFile(clip.thumbnailPath, thumbnail); clip.thumbnailPath = thumbnail; }
  catch { clip.thumbnailPath = undefined; }
}
state.audio.enabled = false;
state.capture.config.enabled = false;
state.capture.config.clipsDirectory = join(profile, 'Clips');
state.capture.autoCapture.settings.enabled = false;
state.settings.onboardingCompleted = true;
state.settings.launchAtStartup = false;
state.settings.scanGamesAutomatically = false;
state.settings.automaticAppUpdates = false;
state.clipReview = { reviewedThrough: Date.now() };
state.modules = state.modules.filter((module) => module.source !== 'local');
for (const module of state.modules) module.enabled = false;
await mkdir(state.capture.config.clipsDirectory, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
app.setName('switchboard-library-performance');
app.setAppPath(resolve(import.meta.dirname, '..'));
app.setPath('userData', profile);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
await import(pathToFileURL(resolve(process.env.SWITCHBOARD_LIBRARY_BUILD ?? 'out', 'main/index.js')).href);

void app.whenReady().then(async () => {
  const window = await waitForWindow();
  await until(window, `Boolean(document.querySelector('main')) && !document.querySelector('.startup-screen')`);
  window.setMinimumSize(1, 1);
  window.setContentSize(1420, 900);
  // Keep native rendering active without covering the user's working window.
  // This is an offscreen native comparison, not a foreground CPU release gate.
  window.setSkipTaskbar(true);
  window.setPosition(-30000, -30000);
  window.webContents.setBackgroundThrottling(false);
  window.showInactive();
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Performance.enable');
  if (process.argv.includes('--verify-virtual')) {
    await verifyVirtual(window);
    app.quit();
    return;
  }
  if (process.argv.includes('--verify')) {
    await verify(window);
    app.quit();
    return;
  }
  await window.webContents.executeJavaScript(`location.hash = 'capture'`);
  await until(window, `Boolean(document.querySelector('.capture-clip-card'))`);
  await delay(5000);
  const initial = await sample(window);
  const before = await taskDuration(window);
  await window.webContents.executeJavaScript(`(async () => {
    const settings = (await window.switchboard.getSnapshot()).settings;
    for (let i = 0; i < 20; i++) {
      await window.switchboard.updateSettings({ ...settings, performanceGuard: i % 2 === 0 });
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  })()`);
  await delay(500);
  const snapshotTaskMs = Math.round(((await taskDuration(window)) - before) * 1000);
  const afterUpdates = await sample(window);
  if (afterUpdates.cards !== initial.cards) throw new Error('The library changed during the snapshot benchmark.');
  await writeFile(join(output, 'capture.json'), JSON.stringify({ initial, snapshotTaskMs, afterUpdates }, null, 2));
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Settings"]')?.click()`);
  await until(window, `Boolean(document.querySelector('.settings-page'))`);
  await delay(10000);
  const settingsSamples = [];
  const duration = Number(process.env.SWITCHBOARD_LIBRARY_SAMPLE_MS ?? 60000);
  const deadline = Date.now() + duration;
  while (Date.now() < deadline) {
    settingsSamples.push(await sample(window));
    await delay(1000);
  }
  const report = { hardwareAcceleration: app.isHardwareAccelerationEnabled(), sampleDurationMs: duration, initial, snapshotTaskMs, afterUpdates, settingsSamples, profile };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log('LIBRARY_PERFORMANCE', JSON.stringify({
    initial, snapshotTaskMs, afterUpdates,
    settingsMedianMb: median(settingsSamples.map(s => s.privateMb)),
    settingsLast: settingsSamples.at(-1),
  }));
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });

async function sample(window) {
  const metrics = app.getAppMetrics();
  const renderer = await window.webContents.executeJavaScript(`({
    heapMb: Math.round(performance.memory.usedJSHeapSize / 1048576),
    domNodes: document.querySelectorAll('*').length,
    images: document.images.length,
    decodedImages: [...document.images].filter(image => image.complete && image.naturalWidth > 0).length,
    cards: document.querySelectorAll('.capture-clip-card').length,
  })`);
  return {
    ...renderer,
    privateMb: Math.round(metrics.reduce((sum, metric) => sum + (metric.memory.privateBytes ?? 0), 0) / 1024),
    processes: metrics.map(metric => ({ type: metric.type, privateMb: Math.round((metric.memory.privateBytes ?? 0) / 1024) })),
  };
}
async function taskDuration(window) {
  const { metrics } = await window.webContents.debugger.sendCommand('Performance.getMetrics');
  return metrics.find(metric => metric.name === 'TaskDuration').value;
}
async function until(window, expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await delay(50);
  }
  const diagnostic = await window.webContents.executeJavaScript(`({ hash: location.hash, headings: [...document.querySelectorAll('h1,h2')].map(node => node.textContent), buttons: [...document.querySelectorAll('button')].slice(0, 8).map(node => node.getAttribute('aria-label') || node.textContent) })`);
  throw new Error(`Renderer condition timed out: ${expression}; ${JSON.stringify(diagnostic)}`);
}
async function waitForWindow() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoadingMainFrame()) return window;
    await delay(50);
  }
  throw new Error('Window did not load.');
}
function median(values) { return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]; }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function verify(window) {
  const checks = [];
  await window.webContents.executeJavaScript(`(async () => {
    await window.switchboard.updateSettings({ softwareRendering: true, onboardingCompleted: true });
    await window.switchboard.updateSettings({ performanceGuard: false });
    const { settings } = await window.switchboard.getSnapshot();
    if (!settings.softwareRendering || !settings.onboardingCompleted) throw new Error('Partial settings update reset another preference.');
    location.hash = 'capture';
  })()`);
  await until(window, `Boolean(document.querySelector('.capture-clip-card'))`);
  const favorite = await window.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('.capture-clip-card');
    const id = card.querySelector('[data-clip-id]').dataset.clipId;
    const button = card.querySelector('[data-favorite]');
    const wasFavorite = button.getAttribute('aria-pressed') === 'true';
    button.click();
    return { id, wasFavorite };
  })()`);
  await until(window, `document.querySelector('[data-clip-id=' + CSS.escape(${JSON.stringify(favorite.id)}) + ']').closest('.capture-clip-card').querySelector('[data-favorite]').getAttribute('aria-pressed') === '${!favorite.wasFavorite}'`);
  const snapshot = await window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
  if (snapshot.clips.find(clip => clip.id === favorite.id)?.favorite !== !favorite.wasFavorite) throw new Error('Favorite did not reach canonical state.');
  checks.push('favorite updates visible and canonical state');

  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setContentSize(width, height);
    for (const route of ['capture', 'settings']) {
      await window.webContents.executeJavaScript(`sessionStorage.setItem('switchboard.settings.category', 'diagnostics'); location.hash = '${route}';`);
      await until(window, route === 'capture' ? `Boolean(document.querySelector('.capture-clip-card'))` : `Boolean(document.querySelector('.settings-page'))`);
      await delay(300);
      const overflow = await window.webContents.executeJavaScript('document.documentElement.scrollWidth > document.documentElement.clientWidth');
      if (overflow) throw new Error(`Page overflow at ${route} ${width}x${height}`);
      await writeFile(join(output, `${route}-${width}x${height}.png`), (await window.webContents.capturePage()).toPNG());
      checks.push(`${route} ${width}x${height}: no page overflow`);
    }
  }
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await delay(200);
  const animations = await window.webContents.executeJavaScript(`document.getAnimations().filter(animation => animation.playState === 'running').length`);
  if (animations) throw new Error('Reduced-motion Diagnostics retained running animations.');
  checks.push('reduced-motion Diagnostics has no running animations');
  await new Promise(resolve => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.reload();
  });
  await until(window, `Boolean(document.querySelector('.settings-page'))`);
  const persisted = await window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
  if (!persisted.settings.softwareRendering || !persisted.settings.onboardingCompleted) throw new Error('Settings lost after renderer reload.');
  if (persisted.clips.find(clip => clip.id === favorite.id)?.favorite !== !favorite.wasFavorite) throw new Error('Favorite lost after reload.');
  await window.webContents.executeJavaScript(`window.switchboard.setClipFavorite({ id: ${JSON.stringify(favorite.id)}, favorite: ${favorite.wasFavorite} })`);
  checks.push('canonical settings and favorite survive renderer reload');
  await writeFile(join(output, 'verification.json'), JSON.stringify({ checks, settings: { softwareRendering: persisted.settings.softwareRendering, onboardingCompleted: persisted.settings.onboardingCompleted } }, null, 2));
  console.log('LIBRARY_VERIFICATION', JSON.stringify(checks));
}

async function verifyVirtual(window) {
  const run = expression => window.webContents.executeJavaScript(expression);
  const checks = [];
  await run(`location.hash = 'capture'`);
  await until(window, `Boolean(document.querySelector('.capture-clip-card'))`);
  await delay(300);
  const count = await run(`document.querySelectorAll('[data-library-clip-id]').length`);
  if (count === 0 || count > 100) throw new Error(`Virtual mounting gate failed: ${count} mounted items`);
  await run(`window.virtualViewport = document.querySelector('.capture-library').closest('[data-radix-scroll-area-viewport]')`);
  const scroll = async fraction => {
    await run(`window.virtualViewport.scrollTop = (window.virtualViewport.scrollHeight - window.virtualViewport.clientHeight) * ${fraction}`);
    await delay(100);
  };
  const scan = async () => run(`(() => {
    const viewport = document.querySelector('.capture-library').closest('[data-radix-scroll-area-viewport]');
    const box = viewport.getBoundingClientRect();
    const items = [...document.querySelectorAll('[data-library-clip-id]')];
    const visible = items.filter(item => { const r = item.getBoundingClientRect(); return r.bottom > box.top && r.top < box.bottom; });
    const overlap = items.some(item => { const card = item.querySelector('.capture-clip-card'); return card && card.getBoundingClientRect().height > item.getBoundingClientRect().height + 1; });
    return { mounted: items.length, visible: visible.length, overlap, top: viewport.scrollTop, height: viewport.scrollHeight, overflow: document.documentElement.scrollWidth > innerWidth };
  })()`);
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setContentSize(width, height);
    for (const layout of ['Grid', 'List']) {
      await run(`document.querySelector('[aria-label="${layout} view"]').click()`);
      await delay(150);
      const samples = [];
      for (const fraction of [0, .25, .5, .75, 1]) {
        await scroll(fraction);
        const result = await scan();
        if (!result.visible || result.mounted > 100 || result.overlap || result.overflow) throw new Error(`Invalid ${layout} viewport ${width}: ${JSON.stringify(result)}`);
        samples.push(result);
        if (fraction === 0 || fraction === 1) await writeFile(join(output, `${layout.toLowerCase()}-${width}x${height}-${fraction === 0 ? 'top' : 'end'}.png`), (await window.webContents.capturePage()).toPNG());
      }
      checks.push({ check: `${layout} ${width}x${height}: bounded mounting, populated viewports, no overlap/overflow`, samples });
    }
  }
  window.setContentSize(1420, 900);
  for (const layout of ['Grid', 'List']) {
    await run(`document.querySelector('[aria-label="${layout} view"]').click()`);
    await scroll(0);
    const sweep = await run(`(async () => {
      const seen = new Set();
      let maxMounted = 0;
      const viewport = window.virtualViewport;
      for (let position = 0; position <= viewport.scrollHeight + viewport.clientHeight; position += viewport.clientHeight / 2) {
        viewport.scrollTop = position;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const items = [...document.querySelectorAll('[data-library-clip-id]')];
        maxMounted = Math.max(maxMounted, items.length);
        items.forEach(item => seen.add(item.dataset.libraryClipId));
      }
      return { seen: seen.size, maxMounted };
    })()`);
    if (sweep.seen !== state.clips.length || sweep.maxMounted > 100) throw new Error(`Incomplete ${layout} sweep: ${JSON.stringify(sweep)}`);
    checks.push({ check: `${layout}: every clip reachable through a complete scroll sweep`, ...sweep });
  }
  await run(`document.querySelector('[aria-label="Grid view"]').click()`);
  await scroll(0);
  // Actual native Tab must cross an unmounted row, including backwards.
  const keyboard = await run(`(async () => {
    const clips = (await window.switchboard.getSnapshot()).clips.toSorted((a, b) => b.createdAt - a.createdAt);
    const items = [...document.querySelectorAll('[data-library-clip-id]')];
    const item = items.at(-1);
    const controls = [...item.querySelectorAll('button,[tabindex]')].filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden]') && node.getClientRects().length);
    controls.at(-1).focus({ preventScroll: true });
    const index = clips.findIndex(clip => clip.id === item.dataset.libraryClipId);
    return { from: clips[index].id, to: clips[index + 1].id };
  })()`);
  await delay(100);
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await until(window, `document.activeElement?.closest('[data-library-clip-id]')?.dataset.libraryClipId === ${JSON.stringify(keyboard.to)}`);
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
  await until(window, `document.activeElement?.closest('[data-library-clip-id]')?.dataset.libraryClipId === ${JSON.stringify(keyboard.from)}`);
  checks.push({ check: 'Native Tab and Shift+Tab cross the virtual row boundary' });
  await scroll(1);
  if (await run(`!document.querySelector('[data-library-clip-id="' + CSS.escape(${JSON.stringify(keyboard.from)}) + '"]')`)) throw new Error('Focused row was unmounted');
  if ((await scan()).mounted > 100) throw new Error('Retaining focus mounted intervening rows');
  checks.push({ check: 'Distant focus retains only its row' });
  await run(`document.querySelector('[data-library-clip-id="' + CSS.escape(${JSON.stringify(keyboard.from)}) + '"] button').focus({ preventScroll: true })`);
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
  await delay(150);
  if (await run(`document.activeElement.getBoundingClientRect().top < document.querySelector('.capture-command-header').getBoundingClientRect().bottom`)) throw new Error('Keyboard focus was hidden behind the sticky header');
  checks.push({ check: 'Backward keyboard navigation scrolls focus below the sticky header' });

  await scroll(0);
  const menuId = await run(`(() => {
    const card = document.querySelector('.capture-clip-card');
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 300, button: 2 }));
    return card.querySelector('[data-clip-id]').dataset.clipId;
  })()`);
  await until(window, `Boolean(document.querySelector('[role="menu"]'))`);
  await scroll(1);
  if (await run(`!document.querySelector('[role="menu"]') || !document.querySelector('[data-library-clip-id="' + CSS.escape(${JSON.stringify(menuId)}) + '"]')`)) throw new Error('Scrolling unmounted the open context menu');
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await until(window, `!document.querySelector('[role="menu"]')`);
  checks.push({ check: 'Open context menu retains its trigger while scrolling' });

  await scroll(0);
  const favorite = await run(`(() => {
    const card = document.querySelector('.capture-clip-card');
    const button = card.querySelector('[data-favorite]');
    const result = { id: card.querySelector('[data-clip-id]').dataset.clipId, value: button.getAttribute('aria-pressed') !== 'true' };
    button.click();
    return result;
  })()`);
  await until(window, `(async () => (await window.switchboard.getSnapshot()).clips.find(clip => clip.id === ${JSON.stringify(favorite.id)}).favorite === ${favorite.value})()`);
  await scroll(1);
  await scroll(0);
  await until(window, `document.querySelector('[data-clip-id="' + CSS.escape(${JSON.stringify(favorite.id)}) + '"]').closest('.capture-clip-card').querySelector('[data-favorite]').getAttribute('aria-pressed') === '${favorite.value}'`);
  checks.push({ check: 'Favorite survives unmount/remount through canonical state' });

  const oldest = await run(`(async () => (await window.switchboard.getSnapshot()).clips.toSorted((a, b) => a.createdAt - b.createdAt)[0])()`);
  const search = async value => {
    await run(`(() => { const input = document.querySelector('[aria-label="Search clips"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await delay(200);
  };
  await search(oldest.name);
  await until(window, `Boolean(document.querySelector('[data-clip-id="' + CSS.escape(${JSON.stringify(oldest.id)}) + '"]'))`);
  await search('no-matches-virtualization-verification-xyz');
  await until(window, `document.body.textContent.includes('No clips match these filters')`);
  await run(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Clear filters').click()`);
  await until(window, `Boolean(document.querySelector('.capture-clip-card'))`);
  checks.push({ check: 'Search includes unmounted clips; no-results and clear restore library' });

  await run(`document.querySelector('[aria-label="Create Montage"]').click()`);
  await until(window, `Boolean(document.querySelector('[data-testid="montage-selection-toolbar"]'))`);
  await run(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Select all').click()`);
  await until(window, `document.querySelector('[data-testid="montage-selection-toolbar"] strong').textContent === '${state.clips.length} selected'`);
  await scroll(1);
  if (await run(`document.querySelectorAll('[data-library-clip-id] [role="checkbox"][data-state="unchecked"]').length`)) throw new Error('Unmounted clips were omitted from select-all');
  await run(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Cancel').click()`);
  checks.push({ check: `Select all includes all ${state.clips.length} clips across virtual rows` });

  await scroll(0);
  await run(`document.querySelector('[data-clip-id]').click()`);
  await until(window, `Boolean(document.querySelector('.clip-editor-header__back'))`);
  const editorScroll = await run('window.virtualViewport.scrollTop');
  await run(`document.querySelector('.clip-editor-header__back').click()`);
  await until(window, `Boolean(document.activeElement?.matches('[data-clip-id]'))`);
  if (Math.abs(await run('window.virtualViewport.scrollTop') - editorScroll) > 1) throw new Error('Editor changed library scroll position');
  checks.push({ check: 'Editor restores thumbnail focus and scroll position' });
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await delay(300);
  if (await run(`document.querySelector('.capture-library').getAnimations({ subtree: true }).filter(a => a.playState === 'running').length`)) throw new Error('Virtual library has ongoing reduced-motion animation');
  checks.push({ check: 'Reduced-motion library has no running animations' });
  await new Promise(resolve => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.reload();
  });
  await until(window, `Boolean(document.querySelector('.capture-clip-card'))`);
  await until(window, `document.querySelector('[data-clip-id="' + CSS.escape(${JSON.stringify(favorite.id)}) + '"]').closest('.capture-clip-card').querySelector('[data-favorite]').getAttribute('aria-pressed') === '${favorite.value}'`);
  if ((await scan()).mounted > 100) throw new Error('Renderer reload mounted the full library');
  checks.push({ check: 'Canonical favorite and bounded mounting survive renderer reload' });
  await writeFile(join(output, 'virtual-verification.json'), JSON.stringify({ checks }, null, 2));
  console.log('VIRTUAL_LIBRARY_VERIFIED', checks.length);
}
