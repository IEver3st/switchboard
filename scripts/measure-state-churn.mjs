// Native main/preload benchmark with synthetic metadata, isolated settings/media,
// no engines or physical device access, and no visible windows.
import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = resolve(import.meta.dirname, '..');
const baseline = process.argv.includes('--baseline');
const source = process.env.SWITCHBOARD_CHURN_BUNDLE;
if (baseline && !source) throw new Error('--baseline requires a saved SWITCHBOARD_CHURN_BUNDLE.');
const output = join(root, '.switchboard', 'state-churn', String(Date.now()));
const profile = await mkdtemp(join(tmpdir(), 'switchboard-state-churn-'));
await mkdir(output, { recursive: true });
await mkdir(join(profile, 'videos'));
app.setName('switchboard-state-churn');
app.setAppPath(root);
app.setPath('userData', profile);
app.setPath('videos', join(profile, 'videos'));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
delete process.env.ELECTRON_RENDERER_URL;
BrowserWindow.prototype.show = function () { throw new Error('Visible UI prohibited'); };
BrowserWindow.prototype.showInactive = function () { throw new Error('Visible UI prohibited'); };
BrowserWindow.prototype.focus = function () {};
const bundle = (await readFile(source ?? join(root, 'out/main/index.js'), 'utf8'))
  .replace('const __dirname = import.meta.dirname;', `const __dirname = ${JSON.stringify(join(root, 'out/main'))};`);
const reviewModule = join(output, 'review-main.mjs');
await writeFile(reviewModule, `${bundle}\nexport { controller, debugDiagnostics, StateStore };\n`);
const main = await import(pathToFileURL(reviewModule).href);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = performance.now() + 20_000;
  while (!(await predicate())) {
    if (performance.now() > deadline) throw new Error('State churn review timed out');
    await delay(10);
  }
}
const watchdog = setTimeout(() => app.exit(2), 60_000);
void app.whenReady().then(async () => {
  try {
    let window;
    await until(async () => {
      window = BrowserWindow.getAllWindows()[0];
      return window && !window.webContents.isLoading()
        && await window.webContents.executeJavaScript('Boolean(document.querySelector(".app-shell main"))');
    });
    await main.controller.initialize();
    await main.controller.store.flush();
    main.controller.setRendererActive(false);
    const store = main.controller.store;
    const clips = Array.from({ length: 2000 }, (_, i) => ({
      id: `fixture-clip-${i}`, path: join(profile, 'videos', `fixture-${i}.mp4`),
      name: `Fixture clip ${i}`, game: 'Fixture', createdAt: 1_700_000_000_000 + i,
      durationMs: 30_000, fileSize: 1_000_000, width: 1920, height: 1080, fps: 60,
      favorite: false, titleEdited: false, availability: 'unavailable', canvasSize: 'original',
    }));
    store.updateBranches(['clips'], draft => { draft.clips = clips; }, { persist: false });
    let firstPatch;
    let awaitingBaseline = true;
    const performanceSnapshot = store.read('performance');
    performanceSnapshot.totalMemoryMb += 1;
    const send = window.webContents.send.bind(window.webContents);
    window.webContents.send = (channel, ...args) => {
      const result = send(channel, ...args);
      if (channel === 'system:snapshot-updated') {
        if (awaitingBaseline && args[0]?.type === 'full') {
          awaitingBaseline = false;
          // Exercise the first delta immediately after a baseline, before any
          // unrelated publication can replace the publisher's previous snapshot.
          store.setPerformance(performanceSnapshot);
        } else if (!awaitingBaseline && args[0]?.type === 'patch' && !firstPatch) firstPatch = args[0];
      }
      return result;
    };
    await window.webContents.executeJavaScript(`globalThis.churnSnapshot = null;
      globalThis.churnUnsubscribe = window.switchboard.subscribe(snapshot => { globalThis.churnSnapshot = snapshot; }); true;`);
    await until(() => firstPatch);
    assert.ok(firstPatch);
    const result = {
      mode: 'hidden-native-synthetic-library', baseline, clipCount: clips.length,
      firstPatchBranches: Object.keys(firstPatch.changes),
      firstPatchBytes: Buffer.byteLength(JSON.stringify(firstPatch)),
    };
    await until(() => window.webContents.executeJavaScript(`globalThis.churnSnapshot?.performance.totalMemoryMb === ${performanceSnapshot.totalMemoryMb}`));
    store.updateBranches(['settings'], draft => { draft.settings.closeToTray = true; draft.settings.destroyRendererInTray = true; }, { persist: false });
    window.close();
    assert.equal(window.isDestroyed(), true);
    // Exclude periodic monitoring and disk-journal work from these bounded timings.
    main.controller.performance.dispose();
    async function measure(action, count = 30) {
      main.debugDiagnostics.setEnabled(true);
      const started = performance.now();
      for (let i = 0; i < count; i++) await action(i);
      const elapsedMs = Math.round((performance.now() - started) * 10) / 10;
      const operations = main.debugDiagnostics.snapshot().operations;
      main.debugDiagnostics.setEnabled(false);
      return { count, elapsedMs, operations };
    }
    result.audioIntegrationDisabled = await measure(() => main.controller.scheduleCaptureAudioIntegrationSync());
    result.cachedEndpointRefresh = await measure(() => main.controller.refreshAudioDevices());
    let changedLibrary = 0;
    let previousLibrary;
    const unsubscribe = store.subscribe(snapshot => {
      if (previousLibrary && previousLibrary !== snapshot.clips) changedLibrary++;
      previousLibrary = snapshot.clips;
    });
    store.setPerformance(store.read('performance'));
    result.autoCaptureStatus = await measure(i => main.controller.autoCaptureEngine.setDegraded(`Fixture ${i}`));
    result.autoCaptureLibraryInvalidations = changedLibrary;
    unsubscribe();
    await store.flush();
    main.debugDiagnostics.setEnabled(true);
    const writeStart = performance.now();
    for (let i = 0; i < 40; i++) {
      store.updateBranches(['settings'], draft => { draft.settings.performanceGuard = i % 2 === 0; });
    }
    await store.flush();
    result.persistenceBurst = {
      count: 40, elapsedMs: Math.round((performance.now() - writeStart) * 10) / 10,
      operations: main.debugDiagnostics.snapshot().operations,
    };
    main.debugDiagnostics.setEnabled(false);
    const reloaded = new main.StateStore(join(profile, 'switchboard-state.json'));
    await reloaded.load();
    assert.equal(reloaded.read('settings').performanceGuard, false);
    assert.equal(reloaded.read('clips').length, clips.length);
    if (!baseline) {
      assert.deepEqual(result.firstPatchBranches, ['performance']);
      assert.equal(changedLibrary, 0);
      for (const workload of [result.audioIntegrationDisabled, result.cachedEndpointRefresh, result.autoCaptureStatus]) {
        assert.equal(workload.operations.some(op => op.name === 'state.clone' || op.name === 'state.clone-update'), false);
      }
      assert.equal(result.persistenceBurst.operations.find(op => op.name === 'state.disk-write')?.calls, 1);
    }
    await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`SWITCHBOARD_STATE_CHURN ${JSON.stringify({ ...result, output })}`);
  } catch (error) {
    console.error(error);
    process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1';
  } finally {
    main.debugDiagnostics.setEnabled(false);
    clearTimeout(watchdog);
    app.quit();
  }
});
