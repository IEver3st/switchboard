import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import electron from 'electron';

// Run after bun run build. Both complete apps use fixture devices, isolated
// profiles/media, and hidden windows; production hardware owners are untouched.
const root = resolve(import.meta.dirname, '..');
const scratch = await mkdtemp(join(tmpdir(), 'switchboard-handoff-'));
const output = join(root, 'design-qa', 'runtime-handoff-20260927');
await mkdir(output, { recursive: true });
for (const role of ['installed', 'development']) {
  await mkdir(join(scratch, role), { recursive: true });
  await mkdir(join(scratch, role, 'videos'), { recursive: true });
}
const boot = join(scratch, 'boot.mjs');
await writeFile(boot, `
import { app, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const role = process.argv.at(-1);
app.setAppPath(${JSON.stringify(root)});
app.setPath('appData', ${JSON.stringify(scratch)});
app.setPath('userData', join(${JSON.stringify(scratch)}, role));
app.setPath('videos', join(${JSON.stringify(scratch)}, role, 'videos'));
await import(${JSON.stringify(pathToFileURL(join(root, 'out/main/index.js')).href)});
process.on('message', async message => {
  try {
    if (message.action === 'quit') { app.quit(); return; }
    const windows = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed());
    const standby = windows.find(w => w.webContents.getURL().startsWith('data:text/html'));
    const main = windows.find(w => w.webContents.getURL().includes('/renderer/index.html'));
    if (message.action === 'status') {
      const text = standby ? await standby.webContents.executeJavaScript('document.body?.innerText ?? ""') : '';
      const snapshot = main && !main.webContents.isLoading()
        ? await main.webContents.executeJavaScript('window.switchboard?.getSnapshot()') : null;
      process.send({ id: message.id, result: { standby: text, active: !!snapshot, retention: snapshot?.settings.diagnosticsRetentionDays } });
    } else if (message.action === 'mark') {
      if (!main) throw new Error('Main renderer unavailable');
      await main.webContents.executeJavaScript('window.switchboard.updateSettings({ diagnosticsRetentionDays: ' + message.value + ' })');
      process.send({ id: message.id, result: true });
    } else if (message.action === 'capture') {
      if (!standby) throw new Error('Standby window unavailable');
      const results = [];
      for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
        standby.setContentSize(width, height);
        await new Promise(resolve => setTimeout(resolve, 100));
        const metrics = await standby.webContents.executeJavaScript('({ overflow: document.documentElement.scrollWidth > innerWidth, preload: typeof window.switchboard, title: document.querySelector("h1")?.textContent })');
        if (metrics.overflow || metrics.preload !== 'undefined') throw new Error('Standby sandbox/layout failed');
        await writeFile(join(${JSON.stringify(output)}, message.name + '-' + width + 'x' + height + '.png'), (await standby.webContents.capturePage()).toPNG());
        results.push({ width, height, ...metrics });
      }
      process.send({ id: message.id, result: results });
    }
  } catch (error) { process.send({ id: message.id, error: String(error) }); }
});
`);

const children = [];
let requestId = 0;
function launch(role) {
  const env = { ...process.env, SWITCHBOARD_NATIVE_REVIEW: '1', SWITCHBOARD_NATIVE_FIXTURES: '1',
    SWITCHBOARD_NATIVE_REVIEW_HIDDEN: '1', SWITCHBOARD_REVIEW_RUNTIME_ROLE: role };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [boot, role], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.logs = '';
  child.on('error', error => { child.logs += String(error); });
  child.stdout.on('data', data => { child.logs += data.toString(); });
  child.stderr.on('data', data => { child.logs += data.toString(); });
  children.push(child);
  return child;
}
function request(child, action, payload = {}) {
  return new Promise((resolveRequest, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => { child.off('message', receive); reject(new Error(`${action} timed out\n${child.logs.slice(-2000)}`)); }, 15_000);
    function receive(message) {
      if (message.id !== id) return;
      clearTimeout(timer); child.off('message', receive);
      if (message.error) reject(new Error(message.error)); else resolveRequest(message.result);
    }
    child.on('message', receive);
    child.send({ id, action, ...payload }, error => {
      if (!error) return;
      clearTimeout(timer); child.off('message', receive);
      reject(new Error(`${error}\n${child.logs.slice(-3000)}`));
    });
  });
}
async function waitState(child, predicate) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`App exited: ${child.logs.slice(-3000)}`);
    const status = await request(child, 'status');
    if (predicate(status)) return status;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
  }
  throw new Error(`App did not reach expected state: ${child.logs.slice(-3000)}`);
}
async function quit(child) {
  const exited = new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => reject(new Error('App did not quit after handoff cleanup.')), 20_000);
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolveExit() : reject(new Error(`App exit ${code}`)); });
  });
  child.send({ action: 'quit' });
  await exited;
}

try {
  const installed = launch('installed');
  await waitState(installed, state => state.active);
  await request(installed, 'mark', { value: 13 });
  let dev = launch('development');
  await waitState(dev, state => state.active);
  await waitState(installed, state => state.standby.includes('Dev is in control') && !state.active);
  const sizes = await request(installed, 'capture', { name: 'standby' });
  await request(dev, 'mark', { value: 7 });
  await quit(dev);
  assert.equal((await waitState(installed, state => state.active)).retention, 13);
  dev = launch('development');
  assert.equal((await waitState(dev, state => state.active)).retention, 7);
  await waitState(installed, state => state.standby.includes('Dev is in control'));
  const died = new Promise(resolveExit => dev.once('exit', resolveExit));
  dev.kill(); await died;
  await waitState(installed, state => state.standby.includes('Dev closed unexpectedly') && !state.active);
  await request(installed, 'capture', { name: 'unexpected-exit' });
  dev = launch('development');
  await waitState(dev, state => state.active);
  await quit(dev);
  assert.equal((await waitState(installed, state => state.active)).retention, 13);
  await quit(installed);
  const result = { handoff: 'passed', settingsIsolationAndRestore: 'passed', repeatedHandoff: 'passed',
    unexpectedExitBlocks: 'passed', recoveryAfterCleanDevExit: 'passed', sizes };
  await writeFile(join(output, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
}
