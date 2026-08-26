import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = '978576aa8400552a4ce9730838c635aa30db5e61';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkout = join(root, '.switchboard', 'cache', `DeepFilterNet-${revision}`);
const output = join(root, '.switchboard', 'build', 'noise-native');
const patch = join(root, 'native', 'deepfilternet-no-embedded-model.patch');

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed${capture ? `: ${result.stderr}` : '.'}`);
  return String(result.stdout ?? '').trim();
}

if (!existsSync(checkout)) {
  await mkdir(dirname(checkout), { recursive: true });
  run('git', ['clone', '--filter=blob:none', 'https://github.com/Rikorose/DeepFilterNet.git', checkout]);
  run('git', ['checkout', revision], checkout);
}
const head = run('git', ['rev-parse', 'HEAD'], checkout, true);
if (head !== revision) throw new Error(`DeepFilterNet checkout is ${head}; expected ${revision}. Remove only ${checkout} and retry.`);

const cargoToml = join(checkout, 'libDF', 'Cargo.toml');
const cargoText = await readFile(cargoToml, 'utf8');
if (cargoText.includes('capi = ["tract", "default-model", "dep:ndarray"]')) {
  run('git', ['apply', '--whitespace=nowarn', patch], checkout);
} else if (!cargoText.includes('capi = ["tract", "dep:ndarray"]')) {
  throw new Error('Pinned libDF feature layout did not match the reviewed source.');
}

run('cargo', [
  'cbuild', '--manifest-path', join(checkout, 'libDF', 'Cargo.toml'), '--release',
  '--target', 'x86_64-pc-windows-msvc', '--no-default-features', '--features', 'capi',
], checkout);

const candidates = [
  join(checkout, 'target', 'x86_64-pc-windows-msvc', 'release', 'df.dll'),
  join(checkout, 'target', 'x86_64-pc-windows-msvc', 'release', 'deepfilter.dll'),
  join(checkout, 'target', 'release', 'df.dll'),
  join(checkout, 'target', 'release', 'deepfilter.dll'),
];
const builtDll = candidates.find(existsSync);
if (!builtDll) throw new Error('cargo-c completed but no libDF Windows DLL was found.');

await mkdir(output, { recursive: true });
const stagedDll = join(output, 'df.dll');
await copyFile(builtDll, stagedDll);
const sha256 = createHash('sha256').update(await readFile(stagedDll)).digest('hex').toUpperCase();
await writeFile(join(output, 'deepfilternet-native-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  upstreamRepository: 'https://github.com/Rikorose/DeepFilterNet',
  upstreamRevision: revision,
  upstreamVersion: 'v0.5.6',
  codeLicense: 'MIT OR Apache-2.0',
  embeddedModel: false,
  artifact: 'df.dll',
  sha256,
  target: 'x86_64-pc-windows-msvc',
}, null, 2)}\n`, 'utf8');
console.log(`Optional libDF staged in ${output} (${sha256}). No model weights were embedded.`);
