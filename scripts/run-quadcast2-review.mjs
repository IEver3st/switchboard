import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

await new Promise((resolveRun, rejectRun) => {
  const child = spawn(electronPath, [join(projectRoot, 'scripts', 'verify-quadcast2-ui.mjs')], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
  });
  child.once('error', rejectRun);
  child.once('exit', (code, signal) => {
    if (code === 0) resolveRun();
    else rejectRun(new Error(`QuadCast 2 review exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
  });
});
