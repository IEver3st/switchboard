import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const userData = await mkdtemp(resolve(tmpdir(), 'switchboard-audio-sync-review-'));
const env = { ...process.env, SWITCHBOARD_AUDIO_SYNC_REVIEW_DATA: userData, SWITCHBOARD_NATIVE_REVIEW: '1',
  SWITCHBOARD_NATIVE_REVIEW_HIDDEN: '1', SWITCHBOARD_NATIVE_FIXTURES: '1',
  SWITCHBOARD_DEVELOPMENT_CAPTURE_HOST: resolve(root, 'engines/capture-host-tests/bin/Debug/net10.0-windows/Capture.Host.Tests.exe') };
delete env.ELECTRON_RUN_AS_NODE;
for (const phase of ['write', 'restart']) {
  await new Promise((done, reject) => {
    const child = spawn(electronPath, [resolve(root, 'scripts/audio-sync-native-harness.mjs'), phase], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? done() : reject(new Error(`Audio sync ${phase} review failed: ${code}`)));
  });
}
console.log(`Audio sync native fixture review passed. Isolated profile: ${userData}`);
