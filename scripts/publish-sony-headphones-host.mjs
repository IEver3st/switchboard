import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.switchboard', 'build', 'sony-headphones-host');
const project = join(root, 'engines', 'sony-headphones-host', 'Sony.Headphones.Host.csproj');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const publish = spawnSync('dotnet', [
  'publish', project, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', output,
], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
if (publish.status !== 0) process.exit(publish.status ?? 1);

console.log(`Sony.Headphones.Host staged in ${output}`);
