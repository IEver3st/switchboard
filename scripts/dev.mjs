import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDevLaunchOptions } from './dev-options.mjs';
import { buildDevelopmentHosts } from './development-hosts.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cliArguments = process.argv.slice(2);
const { environment: launchEnvironment, forwardedArguments } = getDevLaunchOptions(cliArguments, process.env);
const environment = process.env.SWITCHBOARD_SKIP_NATIVE_BUILD === '1'
  ? launchEnvironment
  : await buildDevelopmentHosts(projectRoot, launchEnvironment);

const feedback = environment.SWITCHBOARD_DEV_FEEDBACK !== '0';
const feedbackDirectory = resolve(environment.SWITCHBOARD_DEV_FEEDBACK_DIRECTORY ?? join(projectRoot, '.switchboard', 'dev-feedback'));
let serverLog = '', logTimer = null, logTask = null, logDirty = false;
const flushLog = () => {
  if (logTimer) clearTimeout(logTimer);
  logTimer = null;
  logDirty = true;
  return logTask ??= (async () => {
    while (logDirty) {
      logDirty = false;
      try { await writeFile(join(feedbackDirectory, 'server.log'), serverLog, 'utf8'); } catch { /* Console output still works if local storage fails. */ }
    }
  })().finally(() => { logTask = null; });
};
if (feedback) {
  await mkdir(feedbackDirectory, { recursive: true });
  await writeFile(join(feedbackDirectory, 'server.log'), '', 'utf8');
  console.log('Dev feedback enabled. Read: bun run diagnose:dev | Profile: bun run diagnose:dev --profile');
}

const child = spawn(
  process.execPath,
  [join(projectRoot, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev', ...forwardedArguments],
  { cwd: projectRoot, env: environment, stdio: feedback ? ['inherit', 'pipe', 'pipe'] : 'inherit' },
);

if (feedback) {
  for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      output.write(chunk);
      serverLog = (serverLog + chunk).slice(-256 * 1024);
      if (!logTimer) { logTimer = setTimeout(() => void flushLog(), 1_000); logTimer.unref(); }
    });
  }
  child.once('close', () => void flushLog());
}

child.once('error', (error) => {
  console.error('Failed to start the Electron development server.', error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
