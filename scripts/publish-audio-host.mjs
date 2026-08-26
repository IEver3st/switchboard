import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildNoiseNative } from './build-noise-native.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.switchboard', 'build', 'audio-host');
const project = join(root, 'engines', 'audio-host', 'Audio.Host.csproj');
const native = await buildNoiseNative();

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const publish = spawnSync(
  'dotnet',
  ['publish', project, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', output, `-p:NoiseNativeDir=${native.output}`],
  { cwd: root, encoding: 'utf8', stdio: 'inherit' },
);
if (publish.status !== 0) process.exit(publish.status ?? 1);

await copyFile(join(root, 'THIRD_PARTY_NOTICES.md'), join(output, 'THIRD_PARTY_NOTICES.md'));

console.log(`Audio.Host staged in ${output}`);
