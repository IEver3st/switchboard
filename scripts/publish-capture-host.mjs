import { copyFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.switchboard', 'build', 'capture-host');
const project = join(root, 'engines', 'capture-host', 'Capture.Host.csproj');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const publish = spawnSync(
  'dotnet',
  ['publish', project, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', output],
  { cwd: root, encoding: 'utf8', stdio: 'inherit' },
);
if (publish.status !== 0) process.exit(publish.status ?? 1);

function findExecutable(environmentName, filename) {
  const configured = process.env[environmentName];
  if (configured && existsSync(configured)) return resolve(configured);
  for (const pathEntry of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(pathEntry.replace(/^"|"$/g, ''), filename);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const ffmpeg = findExecutable('SWITCHBOARD_FFMPEG', 'ffmpeg.exe');
const ffprobe = findExecutable('SWITCHBOARD_FFPROBE', 'ffprobe.exe')
  ?? (ffmpeg ? join(dirname(ffmpeg), 'ffprobe.exe') : null);
if (!ffmpeg || !ffprobe || !existsSync(ffprobe)) {
  throw new Error('A full FFmpeg build with ffmpeg.exe and ffprobe.exe is required to package Capture.Host.');
}

const ffmpegOutput = join(output, 'ffmpeg');
await mkdir(ffmpegOutput, { recursive: true });
await Promise.all([
  copyFile(ffmpeg, join(ffmpegOutput, 'ffmpeg.exe')),
  copyFile(ffprobe, join(ffmpegOutput, 'ffprobe.exe')),
]);
console.log(`Capture.Host and FFmpeg staged in ${output}`);
