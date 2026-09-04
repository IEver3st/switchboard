import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';

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
  const blockers = await findBlockingDevHosts(paths);
  if (blockers.length > 0) throw new Error(formatBlockingHostsError(blockers));
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

/**
 * Find running native hosts started from the dev-hosts output directories.
 * A previous `bun run dev` session (for example an app left in the tray) keeps
 * its executables locked, so rebuilding over them fails in dotnet with
 * MSB3026/MSB3027. The match is scoped to the dev-hosts root so packaged or
 * installed hosts are never reported.
 */
export function findBlockingDevHosts(paths) {
  if (process.platform !== 'win32') return Promise.resolve([]);
  const root = join(paths.captureDirectory, '..');
  const escapedRoot = root.replace(/'/g, "''");
  const command = `Get-CimInstance Win32_Process -Filter "Name='Capture.Host.exe' OR Name='Audio.Host.exe'" | Where-Object { $_.ExecutablePath -like '${escapedRoot}*' } | Select-Object @{n='pid';e={$_.ProcessId}}, @{n='path';e={$_.ExecutablePath}} | ConvertTo-Json -Compress`;
  return new Promise((resolveFind) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true,
      timeout: 15_000,
    }, (error, stdout) => {
      if (error) {
        resolveFind([]);
        return;
      }
      resolveFind(parseBlockingDevHosts(stdout));
    });
  });
}

export function parseBlockingDevHosts(stdout) {
  const text = stdout.trim();
  if (!text || text === 'null') return [];
  try {
    const parsed = JSON.parse(text);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    return entries
      .filter((entry) => Number.isSafeInteger(entry?.pid) && typeof entry?.path === 'string')
      .map((entry) => ({ pid: entry.pid, path: entry.path }));
  } catch {
    return [];
  }
}

export function formatBlockingHostsError(blockers) {
  const lines = blockers.map((blocker) => `  - PID ${blocker.pid}: ${blocker.path}`);
  return [
    'Cannot rebuild the native dev hosts because a previous dev session is still running and locking the output:',
    ...lines,
    'Quit the running Switchboard dev app (check the system tray) or stop those processes, then run `bun run dev` again.',
    'To reuse the already-built hosts without rebuilding, run with SWITCHBOARD_SKIP_NATIVE_BUILD=1.',
  ].join('\n');
}
