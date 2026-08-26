import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'native', 'noise-bridge', 'Cargo.toml');
const sourceDll = join(root, 'native', 'noise-bridge', 'target', 'release', 'switchboard_noise.dll');
const output = join(root, '.switchboard', 'build', 'noise-native');

export async function buildNoiseNative() {
  const build = spawnSync('cargo', ['build', '--locked', '--manifest-path', manifestPath, '--release'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (build.status !== 0) throw new Error(`Native noise bridge build failed with exit code ${build.status ?? 1}.`);

  await mkdir(output, { recursive: true });
  const stagedDll = join(output, 'switchboard_noise.dll');
  await copyFile(sourceDll, stagedDll);
  const sha256 = createHash('sha256').update(await readFile(stagedDll)).digest('hex').toUpperCase();
  const manifest = {
    schemaVersion: 1,
    backend: 'RNNoise via nnnoiseless',
    upstreamRepository: 'https://github.com/jneem/nnnoiseless',
    upstreamRevision: '924a2dd143ccad7bce9e5bda061b60ca32911a67',
    upstreamVersion: '0.5.2',
    license: 'BSD-3-Clause',
    artifact: 'switchboard_noise.dll',
    sha256,
    target: 'x86_64-pc-windows-msvc',
  };
  await writeFile(join(output, 'noise-native-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { output, sha256 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildNoiseNative();
  console.log(`Noise backend staged in ${result.output} (${result.sha256})`);
}
