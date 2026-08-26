import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2];
const cleanEnvironment = { ...process.env };
delete cleanEnvironment.ELECTRON_RUN_AS_NODE;

const runElectron = (script, ...arguments_) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(electronPath, [join(projectRoot, script), ...arguments_], {
      cwd: projectRoot,
      env: cleanEnvironment,
      stdio: 'inherit'
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`Electron review exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });

if (command === 'capture') {
  await runElectron('scripts/capture-native-ui.mjs');
} else if (command === 'verify') {
  await runElectron('scripts/verify-native-ui.mjs', '--phase=write');
  await runElectron('scripts/verify-native-ui.mjs', '--phase=verify');
} else {
  throw new Error(`Unknown native review command: ${command ?? '(missing)'}`);
}
