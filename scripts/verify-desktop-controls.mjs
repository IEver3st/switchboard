import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const executable = resolve('engines/capture-host/bin/Debug/net10.0-windows/Capture.Host.exe');
const children = new Set();
function start(quickControlsEnabled) {
  const child = spawn(executable, ['--desktop-controls'], { windowsHide: true, stdio: 'pipe' });
  children.add(child);
  const events = []; let buffer = '';
  child.stdout.setEncoding('utf8'); child.stderr.resume(); child.stdin.on('error', () => {});
  child.stdout.on('data', chunk => {
    buffer += chunk; let end;
    while ((end = buffer.indexOf('\n')) >= 0) { events.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1); }
  });
  child.once('exit', () => children.delete(child));
  child.stdin.write(JSON.stringify({ quickControlsEnabled, quickShortcut: 'Control+Alt+Space', executables: ['node.exe'] }) + '\n');
  return { child, events };
}
async function until(predicate) {
  const deadline = Date.now() + 8000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out waiting for native desktop helper.'); await new Promise(resolve => setTimeout(resolve, 25)); }
}
async function close(instance, killed = false) {
  const done = once(instance.child, 'exit');
  if (killed) instance.child.kill(); else instance.child.stdin.end();
  await done;
}
const watchdog = setTimeout(() => { for (const child of children) child.kill(); process.exitCode = 2; }, 25000);
try {
  for (let cycle = 0; cycle < 3; cycle++) {
    const current = start(true);
    await until(() => current.events.some(event => event.type === 'ready' || event.type === 'error'));
    assert(!current.events.some(event => event.type === 'error'), JSON.stringify(current.events));
    await until(() => current.events.some(event => event.type === 'applications' && event.executables.includes('node.exe')));
    assert(current.events.some(event => event.type === 'metrics' && event.pid === current.child.pid));
    if (cycle === 0) {
      const conflict = start(true);
      await until(() => conflict.events.some(event => event.type === 'error'));
      assert(conflict.events.find(event => event.type === 'error').message.includes('already in use'));
      await until(() => conflict.child.exitCode !== null);
    }
    await close(current, cycle === 1);
  }
  const applicationsOnly = start(false);
  await until(() => applicationsOnly.events.some(event => event.type === 'ready'));
  await close(applicationsOnly);
  console.log(JSON.stringify({ passed: true, cycles: 3, checked: ['native shortcut registration', 'conflict error', 'application matching', 'metrics', 'EOF cleanup', 'killed-host re-registration', 'applications without shortcut'], excluded: ['global key injection', 'visible panel focus', 'physical devices'] }));
} finally {
  clearTimeout(watchdog);
  for (const child of children) child.kill();
}
