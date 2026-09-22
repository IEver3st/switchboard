import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = await mkdtemp(join(tmpdir(), 'switchboard-clip-share-runner-'));
const bundlePath = join(workspace, 'verify-clip-share.mjs');
try {
  execFileSync('bun', [
    'build', 'scripts/verify-clip-share.ts', '--target=node', '--external', 'electron', '--outfile', bundlePath,
  ], { cwd: projectRoot, stdio: 'inherit' });
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [bundlePath], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Clip share verification exited with code ${result.status ?? result.signal}.`);
} finally {
  assert.equal(dirname(resolve(workspace)), resolve(tmpdir()));
  assert(workspace.includes('switchboard-clip-share-runner-'));
  await rm(workspace, { recursive: true, force: true });
}
