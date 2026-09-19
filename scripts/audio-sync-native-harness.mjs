import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'design-qa/audio-sync-calibration');
const phase = process.argv[2];
app.setName('switchboard-audio-sync-review');
app.setAppPath(root);
app.setPath('userData', process.env.SWITCHBOARD_AUDIO_SYNC_REVIEW_DATA);
const watchdog = setTimeout(() => { console.error('Audio sync review timed out.'); app.exit(2); }, 60_000);
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });

async function run() {
  let window;
  for (let i = 0; i < 200 && !window; i++) { window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed()); if (!window) await delay(25); }
  assert(window); assert(!window.isVisible());
  const js = code => window.webContents.executeJavaScript(code);
  window.webContents.setBackgroundThrottling(false);
  window.setMinimumSize(1, 1); window.webContents.setZoomFactor(1);
  await until(js, 'Boolean(window.switchboard) && !document.querySelector(".startup-screen")');
  await js(`window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100 })`);
  const snapshot = () => js('window.switchboard.getSnapshot()');
  const status = name => `(async () => (await window.switchboard.getSnapshot()).capture.audioCalibration.status === '${name}')()`;
  if (phase === 'restart') {
    assert.equal((await snapshot()).capture.config.microphoneSync.advanceMs, 190);
    assert.equal((await snapshot()).capture.audioCalibration.status, 'idle');
    console.log('Saved microphone correction survived native app restart; no measurement was restored.');
  } else {
    await js(`window.switchboard.setCaptureConfig({ enabled: false, includeMic: true, includeSystemAudio: true, systemAudioMode: 'system', microphoneSync: null })`);
  }
  await js(`window.sessionStorage.setItem('switchboard.settings.category', 'capture'); window.location.hash = 'settings'`);
  await until(js, `Boolean(document.querySelector('#capture-tab-audio'))`);
  await js(`document.querySelector('#capture-tab-audio').click()`);
  await until(js, `Boolean(document.querySelector('[data-setting-id="capture.audioSync"] button'))`);
  await js(`document.querySelector('[data-setting-id="capture.audioSync"]').scrollIntoView({block:'center'})`);
  if (phase === 'restart') {
    await click(js, '.audio-sync-adjustment button', 'Reset');
    await until(js, `(async () => (await window.switchboard.getSnapshot()).capture.config.microphoneSync === null)()`);
  } else {
    for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
      window.setSize(width, height, false);
      await js(`document.querySelector('[data-setting-id="capture.audioSync"] button').click()`);
      await until(js, 'Boolean(document.querySelector(".audio-sync-dialog"))');
      const bounds = await js(`(() => { const r=document.querySelector('.audio-sync-dialog').getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}; })()`);
      assert(bounds.left >= 0 && bounds.right <= bounds.width && bounds.top >= 0 && bounds.bottom <= bounds.height && !bounds.overflow, JSON.stringify(bounds));
      await js(`document.querySelector('.audio-sync-actions button:last-child').focus()`);
      assert.equal(await js(`document.activeElement.textContent.trim()`), 'Start test');
      await capture(window, `prepare-${width}x${height}`);
      await click(js, '.audio-sync-actions button', 'Close');
      await until(js, '!document.querySelector(".audio-sync-dialog")');
    }
    window.setSize(1080, 720, false);
    await js(`document.querySelector('[data-setting-id="capture.audioSync"] button').click()`);
    await click(js, '.audio-sync-actions button', 'Start test');
    await until(js, status('measuring'));
    await capture(window, 'measuring-1080x720');
    await click(js, '.audio-sync-actions button', 'Cancel test');
    await until(js, status('idle'));
    assert.equal((await snapshot()).capture.config.microphoneSync, null);
    await js(`document.querySelector('[data-setting-id="capture.audioSync"] button').click()`);
    await click(js, '.audio-sync-actions button', 'Start test');
    await until(js, status('ready'));
    await until(js, `document.querySelector('.audio-sync-status')?.textContent.includes('185 ms delay')`);
    await capture(window, 'result-1080x720');
    await click(js, '.audio-sync-actions button', 'Save correction');
    await until(js, status('saved'));
    assert.equal((await snapshot()).capture.config.microphoneSync.advanceMs, 185);
    await click(js, '.audio-sync-actions button', 'Close');
    // A failed native helper must preserve the already saved correction.
    process.env.SWITCHBOARD_AUDIO_SYNC_FIXTURE_FAIL = '1';
    await js(`document.querySelector('[data-setting-id="capture.audioSync"] button').click()`);
    await click(js, '.audio-sync-actions button', 'Start test');
    await until(js, status('error'));
    await until(js, `Boolean(document.querySelector('.audio-sync-error'))`);
    await capture(window, 'error-1080x720');
    assert.equal((await snapshot()).capture.config.microphoneSync.advanceMs, 185);
    await click(js, '.audio-sync-actions button', 'Close');
    delete process.env.SWITCHBOARD_AUDIO_SYNC_FIXTURE_FAIL;
    await js(`(() => { const input=document.querySelector('.audio-sync-adjustment input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'190'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await click(js, '.audio-sync-adjustment button', 'Adjust');
    await until(js, `(async () => (await window.switchboard.getSnapshot()).capture.config.microphoneSync?.advanceMs === 190)()`);
    await until(js, `document.querySelector('[data-setting-id="capture.audioSync.adjustment"]')?.textContent.includes('190 ms earlier')`);
    await js(`document.querySelector('[data-setting-id="capture.audioSync.adjustment"]').scrollIntoView({block:'center'})`);
    await capture(window, 'saved-1080x720');
    // Reload proves renderer state is a projection of main's saved settings.
    window.webContents.reload();
    await until(js, 'Boolean(window.switchboard) && !document.querySelector(".startup-screen")');
    assert.equal((await snapshot()).capture.config.microphoneSync.advanceMs, 190);
    console.log('Hidden native audio sync: all three sizes; prepare, measure, cancel, result, apply, error, adjustment, reload passed.');
  }
  assert(BrowserWindow.getAllWindows().every(w => !w.isVisible()));
  clearTimeout(watchdog); app.quit();
}
async function until(js, expression) {
  for (let i=0;i<375;i++) { try { if(await js(expression)) return; } catch {} await delay(40); }
  throw new Error(`Timed out: ${expression}`);
}
async function click(js, selector, label) {
  await until(js, `[...document.querySelectorAll(${JSON.stringify(selector)})].some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`);
  await js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);
}
async function capture(window, name) {
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await delay(180);
  await writeFile(resolve(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
