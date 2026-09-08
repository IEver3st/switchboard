// Run with Electron. Uses isolated state and paints offscreen without activation.
import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.SWITCHBOARD_SCROLL_OUTPUT ?? join(root, 'design-qa', 'clip-scroll'));
const build = resolve(process.env.SWITCHBOARD_SCROLL_BUILD ?? join(root, 'out'));
const interactionsOnly = process.argv.includes('--interactions-only');
const isolated = await mkdtemp(join(tmpdir(), 'switchboard-clip-scroll-'));
const source = process.env.SWITCHBOARD_SCROLL_STATE ?? join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json');
const state = JSON.parse(await readFile(source, 'utf8'));
const base = state.clips.find(clip => clip.thumbnailPath && existsSync(clip.thumbnailPath) && existsSync(clip.path));
if (!base) throw new Error('A real thumbnail is required to seed the clip scroll fixture.');
const count = 1200;
const thumbnailDirectory = join(isolated, 'cache', 'thumbnails');
await mkdir(thumbnailDirectory, { recursive: true });
// The normal reconciler owns enrichment and replaces old thumbnail paths. Give
// every fixture its own correctly named copy so no source cache is ever mutated.
for (let index = 0; index < count; index++) {
  await copyFile(base.thumbnailPath, join(thumbnailDirectory, `scroll-${index}.v2.jpg`));
}
state.clips = Array.from({ length: count }, (_, index) => ({
  ...base, id: `scroll-${index}`, name: `Scroll fixture clip ${index}`, favorite: false,
  thumbnailPath: join(thumbnailDirectory, `scroll-${index}.v2.jpg`), audioChannels: base.audioChannels ?? ['game'],
  createdAt: new Date(2026, 8, 7, 12).getTime() - Math.floor(index / 30) * 86400000 - (index % 30) * 1000,
}));
state.capture.config.enabled = false;
state.audio.enabled = false;
state.modules.forEach(module => { module.enabled = false; });
state.settings.onboardingCompleted = true;
state.settings.uiScalePercent = 100;
state.settings.lowResourceRendering = false;
state.settings.automaticUpdates = false;
state.settings.scanGamesAutomatically = false;
state.capture.config.clipsDirectory = join(isolated, 'Clips');
state.clipReview = { reviewedThrough: Date.now() };
await mkdir(state.capture.config.clipsDirectory, { recursive: true });
await mkdir(output, { recursive: true });
await writeFile(join(isolated, 'switchboard-state.json'), JSON.stringify(state));
app.setName('switchboard-clip-scroll-review');
app.setAppPath(root);
app.setPath('userData', isolated);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
await import(pathToFileURL(join(build, 'main', 'index.js')).href);
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));

async function run() {
  console.log('scroll review: waiting for app');
  await app.whenReady();
  let window;
  for (let attempt = 0; attempt < 200; attempt++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window) break;
    await delay(50);
  }
  if (!window) throw new Error('No review window');
  window.setPosition(-30000, -30000, false);
  window.setSkipTaskbar(true);
  window.setMinimumSize(1, 1);
  window.webContents.setBackgroundThrottling(false);
  window.showInactive();
  if (window.webContents.isLoading()) await new Promise(resolveLoad => window.webContents.once('did-finish-load', resolveLoad));
  const evaluate = code => window.webContents.executeJavaScript(code);
  console.log('scroll review: window loaded');
  const errors = [];
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Capture')")) break;
    await delay(50);
  }
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Capture').click()");
  console.log('scroll review: Capture opened');
  await delay(300);
  window.webContents.debugger.attach('1.3');
  // Dispatch native focus events without activating the offscreen OS window.
  await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  await window.webContents.debugger.sendCommand('Performance.enable');
  const results = [];
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    window.setContentSize(width, height, false);
    const actual = await evaluate('({width: innerWidth, height: innerHeight})');
    const bounds = window.getBounds();
    window.setBounds({ ...bounds, width: bounds.width + width - actual.width, height: bounds.height + height - actual.height }, false);
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const layout of ['grid', 'list']) {
      console.log(`scroll review: ${width}x${height} ${layout}`);
      await evaluate(`document.querySelector('[aria-label="${layout === 'grid' ? 'Grid' : 'List'} view"]').click()`);
      await delay(150);
      if (interactionsOnly) {
        const interaction = await verifyInteractions(window, evaluate);
        results.push({ viewport: [width, height], layout, interaction });
        console.log(JSON.stringify(results.at(-1)));
        continue;
      }
      const before = await window.webContents.debugger.sendCommand('Performance.getMetrics');
      await window.webContents.debugger.sendCommand('Profiler.enable');
      await window.webContents.debugger.sendCommand('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
      const result = await evaluate(`(async () => {
        const viewport = document.querySelector('.capture-library').closest('[data-radix-scroll-area-viewport]');
        const frame = () => new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
        viewport.scrollTop = 0;
        await frame(); await frame();
        const samples = [];
        let mountedMax = 0, blankFrames = 0, missingRows = 0;
        const gaps = [];
        const inspect = () => {
          const bounds = viewport.getBoundingClientRect();
          const top = Math.max(bounds.top, document.querySelector('.capture-command-header').getBoundingClientRect().bottom);
          const items = [...document.querySelectorAll('[data-library-clip-id]')];
          mountedMax = Math.max(mountedMax, items.length);
          let expected = 0, missing = 0;
          for (const group of document.querySelectorAll('[data-virtual-clip-group]')) {
            const rect = group.getBoundingClientRect();
            if (rect.bottom <= top || rect.top >= bounds.bottom) continue;
            const css = getComputedStyle(group);
            const tracks = css.gridTemplateRows.split(' ').map(parseFloat);
            const gap = parseFloat(css.rowGap) || 0;
            let y = rect.top;
            for (let row = 0; row < tracks.length; row++) {
              if (y + tracks[row] > top && y < bounds.bottom) {
                expected++;
                if (![...group.children].some(item => Number(item.style.gridRowStart) === row + 1)) missing++;
              }
              y += tracks[row] + gap;
            }
          }
          if (missing) { missingRows += missing; if (gaps.length < 5) gaps.push({ scrollTop: viewport.scrollTop, expected, missing }); }
          if (expected && expected === missing) blankFrames++;
        };
        for (const direction of [1, -1]) {
          for (let step = 0; step < 100; step++) {
            const started = performance.now();
            viewport.scrollTop += direction * 500;
            await frame();
            inspect();
            samples.push(performance.now() - started);
          }
        }
        // Thumb drags / Home and End can jump beyond any overscan buffer.
        const jumps = [];
        for (const ratio of [1, 0, 0.51, 0.15, 0.9]) {
          viewport.scrollTop = ratio * (viewport.scrollHeight - viewport.clientHeight);
          await frame();
          const previous = missingRows;
          inspect();
          jumps.push({ ratio, missing: missingRows - previous });
        }
        return { viewport: [innerWidth, innerHeight], layout: ${JSON.stringify(layout)}, mountedMax, blankFrames, missingRows, gaps, jumps,
          medianFrameMs: samples.sort((a,b) => a-b)[100], p95FrameMs: samples[190],
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth, scrollHeight: viewport.scrollHeight };
      })()`);
      const after = await window.webContents.debugger.sendCommand('Performance.getMetrics');
      const coverage = await window.webContents.debugger.sendCommand('Profiler.takePreciseCoverage');
      await window.webContents.debugger.sendCommand('Profiler.stopPreciseCoverage');
      result.renders = coverage.result.flatMap(script => script.functions).filter(fn => ['ClipCard', 'ClipGrid', 'ClipList', 'measure'].includes(fn.functionName)).map(fn => ({ name: fn.functionName, calls: fn.ranges[0].count }));
      result.work = Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].map(name => [name, after.metrics.find(m => m.name === name).value - before.metrics.find(m => m.name === name).value]));
      await evaluate(`Promise.all([...document.querySelectorAll('.capture-library img')].map(image => image.decode().catch(() => undefined)))`);
      // Decoding is separate from the GPU's next raster/composite submission.
      await delay(150);
      result.thumbnails = await evaluate(`(() => {
        const images = [...document.querySelectorAll('.capture-library img')];
        return { loaded: images.filter(image => image.complete && image.naturalWidth > 0).length, total: images.length };
      })()`);
      await writeFile(join(output, `${width}-${layout}.png`), (await window.webContents.capturePage()).toPNG());
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
  await writeFile(join(output, 'results.json'), JSON.stringify({ fixtureClips: count, offscreenBounds: window.getBounds(), results, errors }, null, 2));
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = results.some(result => result.missingRows || result.horizontalOverflow) || errors.length ? '1' : '0';
  app.quit();
}

async function verifyInteractions(window, evaluate) {
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await delay(30);
    }
    throw new Error(`Interaction did not settle: ${expression}`);
  }
  const scroll = amount => evaluate(`document.querySelector('.capture-library').closest('[data-radix-scroll-area-viewport]').scrollTop = ${amount}`);
  const escape = () => {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  };
  await scroll(0);
  await delay(80);
  // A scrollbar jump has to populate its destination in the scroll event itself.
  await evaluate(`(() => {
    const viewport = document.querySelector('.capture-library').closest('[data-radix-scroll-area-viewport]');
    window.scrollReview = { events: 0, blank: 0 };
    window.scrollReviewListener = () => {
      const bounds = viewport.getBoundingClientRect();
      const top = document.querySelector('.capture-command-header').getBoundingClientRect().bottom;
      const visible = [...document.querySelectorAll('[data-library-clip-id]')].some(item => {
        const rect = item.getBoundingClientRect(); return rect.bottom > top && rect.top < bounds.bottom;
      });
      window.scrollReview.events++;
      if (!visible) window.scrollReview.blank++;
    };
    viewport.addEventListener('scroll', window.scrollReviewListener);
  })()`);
  for (const amount of [30000, 0, 60000, 10000, 80000, 0]) {
    await scroll(amount);
    await delay(40);
  }
  const jumps = await evaluate(`(() => {
    document.querySelector('.capture-library').closest('[data-radix-scroll-area-viewport]').removeEventListener('scroll', window.scrollReviewListener);
    return window.scrollReview;
  })()`);
  if (!jumps.events || jumps.blank) throw new Error(`Blank scroll destinations: ${JSON.stringify(jumps)}`);

  const firstId = await evaluate(`(() => {
    const item = document.querySelector('[data-library-clip-id]');
    item.querySelector('[aria-label^="Actions for "]').focus();
    return item.dataset.libraryClipId;
  })()`);
  await scroll(45000);
  await delay(50);
  const retained = await evaluate(`document.activeElement.closest('[data-library-clip-id]')?.dataset.libraryClipId === ${JSON.stringify(firstId)}`);
  if (!retained) throw new Error('Scrolling removed the focused clip: ' + JSON.stringify(await evaluate(`({ firstId: ${JSON.stringify(firstId)}, active: document.activeElement.outerHTML.slice(0, 300), rowPresent: Boolean(document.querySelector('[data-library-clip-id="${firstId}"]')) })`)));
  // The next clip is outside the rendered range; Tab must mount it and reveal focus.
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  const nextId = `scroll-${Number(firstId.slice('scroll-'.length)) + 1}`;
  await waitFor(`document.activeElement.closest('[data-library-clip-id]')?.dataset.libraryClipId === ${JSON.stringify(nextId)}`);
  const focusVisible = await evaluate(`(() => {
    const rect = document.activeElement.getBoundingClientRect();
    const header = document.querySelector('.capture-command-header').getBoundingClientRect();
    return rect.top >= header.bottom && rect.bottom <= innerHeight;
  })()`);
  if (!focusVisible) throw new Error('Tab focus was hidden behind the sticky header');

  const menuPoint = await evaluate(`(() => {
    const rect = document.activeElement.closest('[data-library-clip-id]').querySelector('[aria-label^="Actions for "]').getBoundingClientRect();
    return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
  })()`);
  window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...menuPoint });
  window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...menuPoint });
  await waitFor("document.querySelector('[role=menu]')");
  await scroll(65000);
  await delay(50);
  escape();
  await waitFor(`document.activeElement.closest('[data-library-clip-id]')?.dataset.libraryClipId === ${JSON.stringify(nextId)}`);

  const target = `[data-library-clip-id="${nextId}"]`;
  const beforeFavorite = await evaluate(`window.switchboard.getSnapshot().then(s => s.clips.find(c => c.id === ${JSON.stringify(nextId)}).favorite)`);
  await evaluate(`document.querySelector(${JSON.stringify(target)}).querySelector('[data-favorite]').click()`);
  await waitFor(`document.querySelector(${JSON.stringify(target)}).querySelector('[data-favorite]').getAttribute('aria-pressed') === ${JSON.stringify(String(!beforeFavorite))}`);
  const canonical = await evaluate(`window.switchboard.getSnapshot().then(s => s.clips.find(c => c.id === ${JSON.stringify(nextId)}).favorite)`);
  if (canonical === beforeFavorite) throw new Error('Favorite did not reach canonical state');

  const setSearch = async value => {
    await evaluate(`(() => {
      const input = document.querySelector('input[placeholder="Search clips"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await delay(80);
  };
  await setSearch('no-matching-scroll-fixture');
  await waitFor("document.body.textContent.includes('No clips match these filters')");
  await setSearch('Scroll fixture clip 1199');
  await waitFor("document.querySelector('[data-library-clip-id=scroll-1199]')");
  await setSearch('');
  await waitFor("document.querySelectorAll('[data-library-clip-id]').length > 1");
  await scroll(0);
  await delay(50);
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Create Montage').click()");
  await waitFor("document.querySelector('[data-testid=montage-selection-toolbar]')");
  await evaluate("document.querySelector('button[data-clip-id=scroll-0]').click()");
  await waitFor("document.querySelector('button[data-clip-id=scroll-0]')?.getAttribute('aria-pressed') === 'true'");
  await scroll(40000);
  await delay(50);
  await scroll(0);
  await delay(50);
  await waitFor("document.querySelector('button[data-clip-id=scroll-0]')?.getAttribute('aria-pressed') === 'true'");
  escape();
  await waitFor("!document.querySelector('[data-testid=montage-selection-toolbar]')");
  // Canonical mutations and the virtual library must survive a renderer reload.
  const loaded = new Promise(resolveLoad => window.webContents.once('did-finish-load', resolveLoad));
  window.webContents.reload();
  await loaded;
  await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Capture')");
  await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Capture').click()");
  await waitFor("document.querySelector('[data-library-clip-id]')");
  const reloaded = await evaluate(`window.switchboard.getSnapshot().then(s => s.clips.find(c => c.id === ${JSON.stringify(nextId)}).favorite)`);
  if (reloaded !== canonical) throw new Error('Favorite lost after reload');
  return { jumps, retained, focusVisible, menuFocusRestored: true, favoriteAfterReload: reloaded, filtersAndSelection: true };
}

const watchdog = setTimeout(() => { console.error('Clip scroll review timed out'); app.exit(1); }, 180000);
watchdog.unref();
run().catch(error => { console.error(error); process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1'; app.quit(); });
