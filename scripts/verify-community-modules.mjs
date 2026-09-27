import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const userData = await mkdtemp(resolve(tmpdir(), 'switchboard-community-review-'));
const env = { ...process.env, SWITCHBOARD_COMMUNITY_REVIEW_DATA: userData, SWITCHBOARD_NATIVE_REVIEW: '1', SWITCHBOARD_NATIVE_REVIEW_HIDDEN: '1', SWITCHBOARD_NATIVE_FIXTURES: '1' };
delete env.ELECTRON_RUN_AS_NODE;
for (const phase of ['write', 'restart']) {
  await new Promise((done, reject) => {
    const child = spawn(electronPath, [resolve(root, 'scripts/community-modules-native-harness.mjs'), phase], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? done() : reject(new Error(`Community module ${phase} review failed: ${code}`)));
  });
}
console.log(`Native module review passed; isolated state: ${userData}`);
