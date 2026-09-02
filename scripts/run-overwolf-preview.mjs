import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const executable = require('@overwolf/ow-electron');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

const child = spawn(executable, ['.', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: environment,
  stdio: 'inherit',
});

child.once('error', (error) => {
  console.error('Failed to start the Overwolf Electron preview.', error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
