import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2];
const commandArguments = process.argv.slice(3);
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
} else if (command === 'g502') {
  await runElectron('scripts/verify-g502-fix-native.mjs');
} else if (command === 'mouse') {
  await runElectron('scripts/verify-mouse-device-polish-ui.mjs');
} else if (command === 'huntsman') {
  await runElectron('scripts/verify-huntsman-ui.mjs');
} else if (command === 'games') {
  await runElectron('scripts/verify-game-detection-ui.mjs');
} else if (command === 'audio-noise') {
  await runElectron('scripts/capture-native-ui.mjs', '--verify-audio-noise');
} else if (command === 'audio-mixer') {
  await runElectron('scripts/verify-audio-mixer-ui.mjs');
} else if (command === 'clip-editor') {
  await runElectron('scripts/verify-clip-editor-ui.mjs', ...commandArguments);
} else if (command === 'montage') {
  await runElectron('scripts/verify-montage-ui.mjs');
} else if (command === 'capture-scale') {
  await runElectron('scripts/capture-scale-qa.mjs', ...commandArguments);
} else if (command === 'app-updates') {
  await runElectron('scripts/verify-app-update-ui.mjs');
} else if (command === 'device-popovers') {
  await runElectron('scripts/verify-logitech-lighting-studio.mjs', '--interaction-only');
} else {
  throw new Error(`Unknown native review command: ${command ?? '(missing)'}`);
}
