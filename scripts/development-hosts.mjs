import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export function developmentHostPaths(projectRoot) {
  const root = join(projectRoot, '.switchboard', 'dev-hosts');
  const captureDirectory = join(root, 'capture');
  const audioDirectory = join(root, 'audio');
  return {
    captureDirectory,
    captureExecutable: join(captureDirectory, 'Capture.Host.exe'),
    audioDirectory,
    audioExecutable: join(audioDirectory, 'Audio.Host.exe'),
  };
}

export async function buildDevelopmentHosts(projectRoot, sourceEnvironment = process.env) {
  const paths = developmentHostPaths(projectRoot);
  await Promise.all([mkdir(paths.captureDirectory, { recursive: true }), mkdir(paths.audioDirectory, { recursive: true })]);
  await Promise.all([
    buildHost(projectRoot, 'engines/capture-host/Capture.Host.csproj', paths.captureDirectory, sourceEnvironment),
    buildHost(projectRoot, 'engines/audio-host/Audio.Host.csproj', paths.audioDirectory, sourceEnvironment),
  ]);
  return {
    ...sourceEnvironment,
    SWITCHBOARD_DEVELOPMENT_CAPTURE_HOST: paths.captureExecutable,
    SWITCHBOARD_DEVELOPMENT_AUDIO_HOST: paths.audioExecutable,
  };
}

function buildHost(projectRoot, project, output, environment) {
  return new Promise((resolveBuild, rejectBuild) => {
    const child = spawn('dotnet', [
      'build', join(projectRoot, project),
      '--configuration', 'Debug',
      '--output', output,
      '--nologo',
    ], {
      cwd: projectRoot,
      env: environment,
      windowsHide: true,
      stdio: 'inherit',
    });
    child.once('error', rejectBuild);
    child.once('exit', (code) => {
      if (code === 0) resolveBuild();
      else rejectBuild(new Error(`Native host build failed for ${project} with exit code ${code ?? 'unknown'}.`));
    });
  });
}
