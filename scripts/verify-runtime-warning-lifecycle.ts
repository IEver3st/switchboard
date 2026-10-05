// Bundle with Bun (--target=node --external=electron), then run with Electron.
// Uses a synthetic capture host: no window, device access, or real audio/capture.
import { app } from 'electron';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineSupervisor } from '../src/main/services/engine-supervisor';

app.setPath('userData', mkdtempSync(join(tmpdir(), 'switchboard-warning-check-')));
const warnings: string[] = [];
process.on('warning', warning => warnings.push(warning.message));
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  warnings.push(args.map(String).join(' '));
  originalWarn(...args);
};
const children: ChildProcessWithoutNullStreams[] = [];
const supervisor = new EngineSupervisor(() => {});
const hostSource = `
  setTimeout(() => {
    const lines = require('node:readline').createInterface({ input: process.stdin });
    const commands = [];
    lines.on('line', line => {
      const message = JSON.parse(line);
      commands.push(message.command);
      if (message.command === 'shutdown') process.exit(0);
      if (message.command === 'hang') return;
      process.stdout.write(JSON.stringify({type:'response', requestId:message.requestId,
        result:{command:message.command, commands, bytes:message.payload?.length ?? 0}}) + '\\n');
    });
  }, 250);
`;
(supervisor as unknown as { spawnCaptureHost: () => ChildProcessWithoutNullStreams }).spawnCaptureHost = () => {
  const child = spawn(process.execPath, ['-e', hostSource], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  children.push(child);
  return child;
};

void app.whenReady().then(run);

async function run() {
  const deadline = setTimeout(() => {
    console.error('Native lifecycle verification exceeded 30 seconds.');
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    app.exit(1);
  }, 30_000);
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      await supervisor.start('capture');
      const configured = supervisor.request<{ command: string; bytes: number }>('capture', 'configure', 'x'.repeat(128 * 1024));
      const started = supervisor.request<{ command: string; commands: string[] }>('capture', 'start');
      const [config, start] = await Promise.all([configured, started]);
      assert.equal(config.bytes, 128 * 1024);
      assert.deepEqual(start.commands, ['configure', 'start']);
      await supervisor.stop('capture');
      assert.equal(supervisor.hasLiveProcess('capture'), false);
      assert.equal(children.at(-1)!.stdin.listenerCount('drain'), 0);
    }

    await supervisor.start('capture');
    const failed = supervisor.request('capture', 'hang').then(() => false, () => true);
    const crashed = children.at(-1)!;
    const exited = once(crashed, 'exit');
    crashed.kill();
    await exited;
    assert.equal(await failed, true);
    assert.equal(supervisor.hasLiveProcess('capture'), false);
    await supervisor.start('capture');
    assert.equal((await supervisor.request<{ command: string }>('capture', 'start')).command, 'start');

    // A lost stdin with a still-running child must not prevent shutdown cleanup.
    children.at(-1)!.stdin.destroy();
    await once(children.at(-1)!.stdin, 'close');
    await supervisor.stop('capture');
    assert.equal(supervisor.hasLiveProcess('capture'), false);
    assert.deepEqual(warnings, []);
    console.log(JSON.stringify({ realPipeOrdering: 'passed', hostStartStopCycles: 3, killedHostRecovery: 'passed', brokenPipeShutdown: 'passed', warnings }));
    await supervisor.dispose();
    app.exit(0);
  } catch (error) {
    console.error(error);
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
    app.exit(1);
  } finally {
    clearTimeout(deadline);
  }
}
