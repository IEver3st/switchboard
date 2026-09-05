import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
} else if (command === 'mouse-hotspots') {
  await runElectron('scripts/verify-mouse-hotspots.mjs');
} else if (command === 'equipment') {
  await runElectron('scripts/verify-keyboard-workbench.mjs');
  await runElectron('scripts/verify-microphone-workbench.mjs');
  await runElectron('scripts/verify-equipment-states.mjs');
} else if (command === 'huntsman') {
  await runElectron('scripts/verify-huntsman-ui.mjs');
} else if (command === 'games') {
  await runElectron('scripts/verify-game-detection-ui.mjs');
} else if (command === 'audio-noise') {
  await runElectron('scripts/capture-native-ui.mjs', '--verify-audio-noise');
} else if (command === 'audio-mixer') {
  await runElectron('scripts/verify-audio-mixer-ui.mjs');
} else if (command === 'audio-polish') {
  await runElectron('scripts/capture-audio-polish-ui.mjs');
} else if (command === 'clip-editor') {
  await runElectron('scripts/verify-clip-editor-ui.mjs', ...commandArguments);
} else if (command === 'montage') {
  await runElectron('scripts/verify-montage-ui.mjs');
} else if (command === 'montage-redesign') {
  await runElectron('scripts/verify-montage-redesign.mjs');
} else if (command === 'capture-scale') {
  await runElectron('scripts/capture-scale-qa.mjs', ...commandArguments);
} else if (command === 'capture-window-previews') {
  const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-window-previews-'));
  cleanEnvironment.SWITCHBOARD_CAPTURE_WINDOW_PREVIEW_USER_DATA = isolatedUserData;
  try {
    await runElectron('scripts/verify-capture-window-previews.mjs');
  } finally {
    delete cleanEnvironment.SWITCHBOARD_CAPTURE_WINDOW_PREVIEW_USER_DATA;
    await rm(isolatedUserData, { recursive: true, force: true });
  }
} else if (command === 'onboarding') {
  await runElectron('scripts/capture-onboarding-review.mjs');
} else if (command === 'onboarding-animation') {
  await runElectron('scripts/measure-onboarding-animation.mjs', ...commandArguments);
} else if (command === 'startup') {
  const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-startup-measure-'));
  cleanEnvironment.SWITCHBOARD_STARTUP_USER_DATA = isolatedUserData;
  cleanEnvironment.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
  try {
    await runElectron('scripts/measure-startup.mjs', ...commandArguments);
  } finally {
    delete cleanEnvironment.SWITCHBOARD_STARTUP_USER_DATA;
    delete cleanEnvironment.SWITCHBOARD_NATIVE_REVIEW_HIDDEN;
    await rm(isolatedUserData, { recursive: true, force: true });
  }
} else if (command === 'settings-navigation') {
  const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-settings-measure-'));
  cleanEnvironment.SWITCHBOARD_SETTINGS_MEASURE_USER_DATA = isolatedUserData;
  cleanEnvironment.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
  try {
    await runElectron('scripts/measure-settings-navigation.mjs', ...commandArguments);
  } finally {
    delete cleanEnvironment.SWITCHBOARD_SETTINGS_MEASURE_USER_DATA;
    delete cleanEnvironment.SWITCHBOARD_NATIVE_REVIEW_HIDDEN;
    await rm(isolatedUserData, { recursive: true, force: true });
  }
} else if (command === 'idle') {
  const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-idle-measure-'));
  cleanEnvironment.SWITCHBOARD_IDLE_USER_DATA = isolatedUserData;
  cleanEnvironment.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
  try {
    await runElectron('scripts/measure-idle.mjs', ...commandArguments);
  } finally {
    delete cleanEnvironment.SWITCHBOARD_IDLE_USER_DATA;
    delete cleanEnvironment.SWITCHBOARD_NATIVE_REVIEW_HIDDEN;
    await rm(isolatedUserData, { recursive: true, force: true });
  }
} else if (command === 'route-navigation') {
  const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-route-measure-'));
  cleanEnvironment.SWITCHBOARD_ROUTE_MEASURE_USER_DATA = isolatedUserData;
  cleanEnvironment.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
  try {
    await runElectron('scripts/measure-route-navigation.mjs', ...commandArguments);
  } finally {
    delete cleanEnvironment.SWITCHBOARD_ROUTE_MEASURE_USER_DATA;
    delete cleanEnvironment.SWITCHBOARD_NATIVE_REVIEW_HIDDEN;
    await rm(isolatedUserData, { recursive: true, force: true });
  }
} else if (command === 'app-updates') {
  await runElectron('scripts/verify-app-update-ui.mjs');
} else if (command === 'device-popovers') {
  await runElectron('scripts/verify-logitech-lighting-studio.mjs', '--interaction-only');
} else if (command === 'module-authoring') {
  await runElectron('scripts/verify-module-authoring-ui.mjs');
} else {
  throw new Error(`Unknown native review command: ${command ?? '(missing)'}`);
}
