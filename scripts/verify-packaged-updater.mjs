import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagedDirectory = resolve(process.argv[2] ?? join(root, 'dist', 'win-unpacked'));
const archivePath = join(packagedDirectory, 'resources', 'app.asar');
const updateConfigPath = join(packagedDirectory, 'resources', 'app-update.yml');
const executablePath = join(packagedDirectory, 'switchboard.exe');

assert(existsSync(archivePath), `Packaged app archive is missing: ${archivePath}`);
assert(existsSync(updateConfigPath), `Packaged update configuration is missing: ${updateConfigPath}`);
assert(existsSync(executablePath), `Packaged executable is missing: ${executablePath}`);

const workspacePackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const packagedPackage = JSON.parse(extractText('package.json'));
const updaterPackage = JSON.parse(extractText('node_modules\\electron-updater\\package.json'));
const mainSource = extractText('out\\main\\index.js');
const updateConfig = parseFlatYaml(readFileSync(updateConfigPath, 'utf8'));

assert(packagedPackage.version === workspacePackage.version, 'Packaged version does not match package.json.');
assert(updaterPackage.version === workspacePackage.dependencies['electron-updater'], 'Packaged electron-updater version does not match package.json.');
assert(updateConfig.provider === 'github', 'Packaged updater provider must be GitHub.');
assert(updateConfig.owner === 'IEver3st' && updateConfig.repo === 'switchboard', 'Packaged updater feed must target IEver3st/switchboard.');
assert(
  /updaterModule\.autoUpdater\s*\?\?\s*updaterModule\.default\?\.autoUpdater/.test(mainSource),
  'Packaged main bundle does not contain the CommonJS autoUpdater fallback.',
);

const runtime = await verifyElectronRuntime();
assert(runtime.ok === true, runtime.error ?? 'Packaged updater runtime verification failed.');
assert(runtime.updater === 'NsisUpdater', `Expected NsisUpdater, received ${runtime.updater ?? 'nothing'}.`);

console.log(`Packaged updater verified for Switchboard ${packagedPackage.version}: ${runtime.updater}.`);

function extractText(relativePath) {
  return asar.extractFile(archivePath, relativePath).toString('utf8');
}

function parseFlatYaml(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.+)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim()]));
}

async function verifyElectronRuntime() {
  const directory = mkdtempSync(join(tmpdir(), 'switchboard-updater-'));
  const verdictPath = join(directory, 'verdict.json');

  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  environment.SWITCHBOARD_VERIFY_PACKAGED_UPDATER = '1';
  environment.SWITCHBOARD_PACKAGED_UPDATER_VERDICT = verdictPath;
  const child = spawn(executablePath, [], {
    env: environment,
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    const deadline = Date.now() + 15_000;
    while (!existsSync(verdictPath) && Date.now() < deadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    if (!existsSync(verdictPath)) {
      throw new Error('Electron updater runtime verification timed out.');
    }
    return JSON.parse(readFileSync(verdictPath, 'utf8'));
  } finally {
    if (child.exitCode === null) child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
