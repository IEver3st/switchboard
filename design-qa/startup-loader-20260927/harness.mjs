// Review-only harness: renders the built renderer in hidden 1080x720 windows with a
// stub preload so the pre-snapshot startup states can be captured.
import { app, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const cases = [
  { name: '1080x720-starting', mode: 'pending', waitMs: 700 },
  { name: '1080x720-starting-reduced-motion', mode: 'pending', waitMs: 700, reduced: true },
  { name: '1080x720-before-show-delay', mode: 'pending', waitMs: 0 },
  { name: '1080x720-failed', mode: 'fail', waitMs: 700 },
  ...(process.argv.includes('--quick') ? [] : [{ name: '1080x720-stalled', mode: 'pending', waitMs: 12_600 }]),
];

app.on('window-all-closed', () => undefined);
app.whenReady().then(async () => { try {
  const report = [];
  for (const c of cases) {
    const window = new BrowserWindow({
      show: false, useContentSize: true, width: 1080, height: 720, backgroundColor: '#0d1015',
      webPreferences: { preload: join(here, 'preload.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false,
        additionalArguments: [`--startup-mode=${c.mode}`] },
    });
    const errors = [];
    window.webContents.on('console-message', (d) => { if (d.level === 'error') errors.push(d.message); });
    console.log('case', c.name);
    await window.loadFile(join(root, 'out', 'renderer', 'index.html')).catch((e) => console.log('loadFile rejected (ignored):', e.code));
    if (c.reduced) {
      window.webContents.debugger.attach('1.3');
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await window.webContents.debugger.sendCommand('Page.reload', {});
      await new Promise((r) => window.webContents.once('did-finish-load', r));
    }
    if (c.waitMs) await delay(c.waitMs);
    const state = await window.webContents.executeJavaScript(`(() => {
      const s = document.querySelector('.startup-screen'); const seq = document.querySelector('.startup-sequence');
      const spin = document.querySelector('.startup-spinner');
      return { present: Boolean(s), state: s?.dataset.state, role: s?.getAttribute('role'), ariaBusy: s?.getAttribute('aria-busy'),
        ariaLive: s?.getAttribute('aria-live'), visibleText: [...document.querySelectorAll('.startup-sequence__message')].filter((e) => getComputedStyle(e).visibility === 'visible').map((e) => e.textContent), sequenceOpacity: seq && getComputedStyle(seq).opacity,
        spinnerAnimation: spin && getComputedStyle(spin).animationName, spinnerDisplay: spin && getComputedStyle(spin).display,
        dragRegion: getComputedStyle(document.querySelector('.startup-screen__drag')).getPropertyValue('-webkit-app-region') || getComputedStyle(document.querySelector('.startup-screen__drag')).appRegion,
        reloadVisible: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Reload' && getComputedStyle(b).visibility === 'visible'),
        mark: Boolean(document.querySelector('img.startup-mark')?.complete),
        overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
        viewport: [innerWidth, innerHeight] };
    })()`);
    state.animations = await window.webContents.executeJavaScript(`document.getAnimations().map((a) => [a.animationName, a.playState, Math.round(a.currentTime)])`);
    // Hidden review windows do not produce compositor frames on their own; force one.
    window.webContents.invalidate();
    await window.webContents.executeJavaScript('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    await writeFile(join(here, `${c.name}.png`), (await window.webContents.capturePage()).toPNG());
    report.push({ ...c, state, errors });
    window.destroy();
  }
  await writeFile(join(here, 'evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  app.exit(0);
} catch (error) { console.error(error); app.exit(1); } });
