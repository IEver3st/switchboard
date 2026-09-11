// Hidden native Electron draft expiry presentation and refresh acceptance.
// Does not start capture, write media, or change the user's application profile.
import { app, BrowserWindow, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-draft-retention-'));
const output = join(root, '.switchboard', 'draft-retention-review', String(Date.now()));
await mkdir(output, { recursive: true });
const state = JSON.parse(await readFile(join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json'), 'utf8'));
const base = state.clips.find(clip => clip.thumbnailPath && existsSync(clip.thumbnailPath) && existsSync(clip.path));
if (!base) throw Error('A local clip with a real thumbnail is required for the library fixture.');
await mkdir(join(profile, 'cache', 'thumbnails'), { recursive: true });
state.clips = [];
for (let index = 0; index < 8; index++) {
  const id = `save-review-${index}`;
  const thumbnailPath = join(profile, 'cache', 'thumbnails', `${id}.v2.jpg`);
  await copyFile(base.thumbnailPath, thumbnailPath);
  state.clips.push({ ...base, id, thumbnailPath, name: `Draft retention fixture ${index + 1}`, createdAt: Date.now() - index * 1000 });
}
state.capture.config.enabled = false;
state.capture.config.clipsDirectory = join(profile, 'Clips');
state.audio.enabled = false;
state.modules.forEach(module => { module.enabled = false; });
Object.assign(state.settings, { onboardingCompleted: true, uiScalePercent: 100, automaticUpdates: false, scanGamesAutomatically: false });
await mkdir(state.capture.config.clipsDirectory);
await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
app.setName('switchboard-draft-retention-review');
app.setAppPath(root);
app.setPath('userData', profile);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
delete process.env.ELECTRON_RENDERER_URL;
BrowserWindow.prototype.show = BrowserWindow.prototype.showInactive = function () { throw Error('This review must remain hidden.'); };
BrowserWindow.prototype.focus = function () {};
app.on('browser-window-created', (_event, window) => {
  window.setBounds({ x: -20000, y: -20000, width: 1420, height: 900 });
  window.webContents.setBackgroundThrottling(false);
  window.webContents.setAudioMuted(true);
});
const report = { scope: 'Hidden Electron status transitions with production preload snapshots. No live hardware recovery proof.', checks: [], screenshots: [], errors: [] };
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
let window, fixture;

const js = expression => window.webContents.executeJavaScript(expression);
function assert(value, label) { if (!value) throw Error(label); report.checks.push(label); }
async function wait(test, label) {
  const until = Date.now() + 15000;
  while (Date.now() < until) { if (await test()) return; await delay(50); }
  throw Error(`Timed out: ${label}`);
}
// Hidden windows may suspend rAF once reduced motion removes the last animation.
async function frames() {
  await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  await delay(100);
}
async function capture(name) {
  // capturePage wakes painting in the hidden window; allow the updated frame to commit.
  for (let pass = 0; pass < 3; pass++) {
    await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await frames();
  }
  await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
  report.screenshots.push(name);
}


const retentionMs = 3 * 60 * 60 * 1000;
let drafts = [];
let reads = 0;
const watchdog = setTimeout(() => app.exit(2), 30000);
await import('../out/main/index.js');
void app.whenReady().then(async () => { try {
  await wait(async () => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading() && await js('Boolean(window.switchboard)'); }, 'window');
  fixture = await js('window.switchboard.getSnapshot()');
  ipcMain.removeHandler('system:get-snapshot');
  ipcMain.handle('system:get-snapshot', () => fixture);
  const send = window.webContents.send.bind(window.webContents);
  window.webContents.send = (channel, ...args) => send(channel, ...(channel === 'system:snapshot-updated' ? [fixture] : args));
  const clip = fixture.clips[0];
  const draft = { schemaVersion: 2, type: 'montage', sourceClipId: clip.id,
    id: '11111111-1111-4111-8111-111111111111', name: clip.name,
    createdAt: Date.now(), updatedAt: Date.now(), durationMs: clip.durationMs, canvasSize: 'original',
    segments: [{ id: '22222222-2222-4222-8222-222222222222', clipId: clip.id, sourceDurationMs: clip.durationMs,
      trimStartMs: 0, trimEndMs: clip.durationMs, volume: 1, muted: false }],
  };
  drafts = [draft];
  ipcMain.removeHandler('montage-v2:list-drafts');
  ipcMain.handle('montage-v2:list-drafts', () => { reads++; return drafts.filter(item => item.updatedAt + retentionMs > Date.now()); });
  await js("location.hash = 'capture'");
  await wait(() => js('Boolean(document.querySelector(".montage-v2-drafts"))'), 'draft strip');
  for (const [width, height] of [[1080,720], [1420,900], [1920,1080]]) {
    window.setMinimumSize(1,1); window.setContentSize(width,height);
    const [ow,oh]=window.getSize(), [cw,ch]=window.getContentSize();
    window.setSize(ow+width-cw,oh+height-ch);
    await wait(() => js(`innerWidth === ${width} && innerHeight === ${height}`), 'viewport');
    await capture(`${width}x${height}-draft-retention`);
    const result=await js(`(() => { const label=document.querySelector('.montage-v2-drafts__label small'); const strip=document.querySelector('.montage-v2-drafts').getBoundingClientRect(); return { text:label.textContent, title:label.title, overflow:document.documentElement.scrollWidth>innerWidth, fits:strip.right<=innerWidth && strip.bottom<=innerHeight }; })()`);
    assert(result.text==='Saved for 3 hours' && result.title.includes('last save'), `${width}: retention is clear`);
    assert(!result.overflow && result.fits, `${width}: draft strip fits without overflow`);
  }
  draft.updatedAt=Date.now()-retentionMs+1500;
  window.webContents.reload();
  await wait(() => js('Boolean(document.querySelector(".montage-v2-drafts"))'), 'unexpired draft after reload');
  const before=reads;
  await wait(() => js('!document.querySelector(".montage-v2-drafts")'), 'expired draft disappears without navigation');
  assert(reads===before+1, 'Expiry requests the canonical draft library once');
  await delay(300);
  assert(reads===before+1, 'Empty draft library has no refresh polling');
  await capture('expired-draft-removed');
  assert(!window.isVisible(), 'Review remained hidden');
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({output,checks:report.checks.length,screenshots:report.screenshots.length}));
  clearTimeout(watchdog); app.exit(0);
} catch(error) { console.error(error,output); report.failure=String(error); await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)); clearTimeout(watchdog); app.exit(1); }});
