import { BrowserWindow, app } from 'electron';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const coordsFile = join(tmpdir(), 'switchboard-popup-coords.json');
const doneFile = join(tmpdir(), 'switchboard-popup-click.done');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-popup-diagnose-'));
app.setName('switchboard-popup-diagnose');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
await import(pathToFileURL(join(projectRoot, 'out/main/index.js')).href);

void app.whenReady().then(() => {
  const timeout = setTimeout(() => { console.error('DIAGNOSE TIMEOUT'); app.exit(2); }, 120000);
  run().then(() => { clearTimeout(timeout); }).catch((error) => {
    clearTimeout(timeout);
    console.error('diagnose failed', error);
    app.exit(1);
  });
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const js = async (window, expression, label) => {
  try { return await window.webContents.executeJavaScript(expression); }
  catch (error) { throw new Error(`step failed: ${label}: ${error.message}`); }
};

async function run() {
  const window = await waitForWindow();
  window.setPosition(200, 200);
  await waitForLoad(window);
  await delay(1500);

  let settingsOpen = false;
  for (let i = 0; i < 250; i++) {
    await js(window, `document.querySelector('button[aria-label="Settings"]')?.click(); true`, 'open settings attempt');
    if (await js(window, `Boolean(document.querySelector('.settings-page'))`, 'settings open?')) { settingsOpen = true; break; }
    await delay(100);
  }
  if (!settingsOpen) {
    const state = await js(window, `({ buttons: [...document.querySelectorAll('button')].slice(0, 20).map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim()), body: document.body.innerText.slice(0, 200) })`, 'page state');
    throw new Error('settings page never opened: ' + JSON.stringify(state));
  }
  await delay(300);

  await js(window, `window.switchboard.updateSettings({ closeToTray: false })`, 'change closeToTray');

  const bounds = window.getBounds();
  const dpr = await js(window, `devicePixelRatio`, 'dpr');
  const targets = await js(window, `
    (() => {
      const center = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; };
      return {
        restoreTrigger: center(document.querySelector('.settings-restore')),
        closeButton: center(document.querySelector('.settings-close')),
      };
    })()
  `, 'header control centers');
  console.log('BOUNDS', JSON.stringify({ bounds, dpr, targets }));

  // Phase 0: harness smoke test - OS click on the Devices category in the sidebar
  const category = await js(window, `
    (() => { const b = document.querySelector('[data-settings-category="devices"]'); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()
  `, 'devices category center');
  await writeFile(coordsFile, JSON.stringify({
    click: { x: Math.round((bounds.x + category.x) * dpr), y: Math.round((bounds.y + category.y) * dpr) },
  }));
  await waitForDone();
  await delay(500);
  window.focus();
  await delay(200);
  const phase0 = await js(window, `document.querySelector('.settings-breadcrumb strong')?.textContent`, 'breadcrumb after os category click');
  console.log('BREADCRUMB AFTER OS CLICK ON DEVICES CATEGORY:', phase0);

  // Phase 1: real OS click on the left, visible part of the "Restore defaults" trigger
  const triggerLeft = await js(window, `
    (() => { const b = document.querySelector('.settings-restore').getBoundingClientRect(); return { x: Math.round(b.left + 12), y: Math.round(b.top + b.height / 2) }; })()
  `, 'trigger left part');
  await writeFile(coordsFile, JSON.stringify({
    click: { x: Math.round((bounds.x + triggerLeft.x) * dpr), y: Math.round((bounds.y + triggerLeft.y) * dpr) },
  }));
  await waitForDone();
  await delay(500);
  window.focus();
  await delay(200);
  let phase1 = await js(window, `Boolean(document.querySelector('.settings-reset-confirmation'))`, 'popup after os click on trigger');
  if (!phase1) {
    const diag = await js(window, `
      (() => {
        const el = document.elementFromPoint(${triggerLeft.x}, ${triggerLeft.y});
        return { at: el ? el.tagName + '.' + (el.className?.baseVal ?? el.className) : null,
          hasTrigger: Boolean(document.querySelector('.settings-restore')),
          focus: document.hasFocus() };
      })()
    `, 'trigger diag');
    console.log('TRIGGER DIAG', JSON.stringify(diag));
    await writeFile(coordsFile, JSON.stringify({
      click: { x: Math.round((bounds.x + triggerLeft.x) * dpr), y: Math.round((bounds.y + triggerLeft.y) * dpr) },
    }));
    await waitForDone();
    await delay(600);
    phase1 = await js(window, `Boolean(document.querySelector('.settings-reset-confirmation'))`, 'popup after retry');
  }
  console.log('POPUP OPEN AFTER OS CLICK ON TRIGGER:', phase1);

  let phase2 = null;
  if (phase1) {
    const cancel = await js(window, `
      (() => {
        const cancel = [...document.querySelectorAll('.settings-reset-confirmation button')].find((b) => b.textContent?.trim() === 'Cancel');
        const b = cancel.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
      })()
    `, 'cancel center');
    await writeFile(coordsFile, JSON.stringify({
      click: { x: Math.round((bounds.x + cancel.x) * dpr), y: Math.round((bounds.y + cancel.y) * dpr) },
    }));
    await waitForDone();
    await delay(800);
    phase2 = await js(window, `!document.querySelector('.settings-reset-confirmation')`, 'popup closed after os cancel click');
    console.log('POPUP CLOSED AFTER OS CLICK ON CANCEL:', phase2);
  }

  let phase3 = null;
  if (phase2) {
    await js(window, `(() => { document.querySelector('.settings-restore')?.click(); return true; })()`, 'reopen popup');
    await delay(300);
    const before = await js(window, `(async () => (await window.switchboard.getSnapshot()).settings.closeToTray)()`, 'closeToTray before restore');
    const restore = await js(window, `
      (() => {
        const restore = [...document.querySelectorAll('.settings-reset-confirmation button')].find((b) => b.textContent?.trim() === 'Restore');
        const b = restore.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
      })()
    `, 'restore center');
    await writeFile(coordsFile, JSON.stringify({
      click: { x: Math.round((bounds.x + restore.x) * dpr), y: Math.round((bounds.y + restore.y) * dpr) },
    }));
    await waitForDone();
    await delay(2500);
    phase3 = await js(window, `(async () => {
      try {
        return {
          popupStillOpen: Boolean(document.querySelector('.settings-reset-confirmation')),
          closeToTray: (await window.switchboard.getSnapshot()).settings.closeToTray,
          closeToTrayBefore: ${JSON.stringify(null)},
        };
      } catch (e) { return { error: e?.message ?? String(e) }; }
    })()`, 'after os restore click');
    phase3.closeToTrayBefore = before;
    console.log('AFTER OS CLICK ON RESTORE:', JSON.stringify(phase3));
  }

  console.log('RESULT', JSON.stringify({ phase1, phase2, phase3 }));
  app.quit();
}

async function waitForDone() {
  for (let i = 0; i < 600; i++) {
    try {
      await import('node:fs/promises').then((fs) => fs.rm(doneFile));
      return;
    } catch {}
    await delay(100);
  }
  throw new Error('clicker never signalled');
}

async function waitForWindow() {
  for (let i = 0; i < 200; i++) {
    const candidate = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (candidate) return candidate;
    await delay(50);
  }
  throw new Error('no window');
}

async function waitForLoad(window) {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('load timeout')), 20000);
    window.webContents.once('did-finish-load', () => { clearTimeout(timeout); resolveLoad(); });
  });
}

