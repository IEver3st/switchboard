import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cliArguments = process.argv.slice(2);
const demoUpdate = cliArguments.includes('--demo-update');
const forwardedArguments = cliArguments.filter((argument) => argument !== '--demo-update');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

if (demoUpdate) {
  const existingElectronArguments = environment.ELECTRON_CLI_ARGS
    ? JSON.parse(environment.ELECTRON_CLI_ARGS)
    : [];
  environment.ELECTRON_CLI_ARGS = JSON.stringify([...existingElectronArguments, '--demo-update']);
}

const child = spawn(
  process.execPath,
  [join(projectRoot, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev', ...forwardedArguments],
  { cwd: projectRoot, env: environment, stdio: 'inherit' },
);

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
