import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import asar from '@electron/asar';

const targetVersion = process.argv[2]?.trim();
const installDirectory = resolve(process.argv[3]
  ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'switchboard'));
const executablePath = join(installDirectory, 'switchboard.exe');
const archivePath = join(installDirectory, 'resources', 'app.asar');

assert(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(targetVersion ?? ''), 'Usage: bun run verify:installed-update -- X.Y.Z [install-directory]');
assert(existsSync(executablePath), `Installed executable is missing: ${executablePath}`);
assert(existsSync(archivePath), `Installed app archive is missing: ${archivePath}`);

const installedVersion = readInstalledVersion();
assert(installedVersion !== targetVersion, `Switchboard ${targetVersion} is already installed; an older build is required.`);

const directory = mkdtempSync(join(tmpdir(), 'switchboard-installed-update-'));
const verdictPath = join(directory, 'verdict.json');
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
environment.SWITCHBOARD_VERIFY_PACKAGED_UPDATER = '1';
environment.SWITCHBOARD_PACKAGED_UPDATER_VERDICT = verdictPath;
environment.SWITCHBOARD_PACKAGED_UPDATER_TARGET_VERSION = targetVersion;

spawn(executablePath, [], {
  env: environment,
  stdio: 'ignore',
  windowsHide: true,
  detached: true,
}).unref();

try {
  await waitFor(() => existsSync(verdictPath), 5 * 60_000, 'The installed updater did not finish downloading the release.');
  const verdict = JSON.parse(readFileSync(verdictPath, 'utf8'));
  assert(verdict.ok === true, verdict.error ?? 'The installed updater reported a failure.');
  assert(verdict.updater === 'NsisUpdater', `Expected NsisUpdater, received ${verdict.updater ?? 'nothing'}.`);
  assert(verdict.version === targetVersion, `Updater downloaded ${verdict.version ?? 'no version'} instead of ${targetVersion}.`);

  await waitFor(() => {
    try {
      return readInstalledVersion() === targetVersion;
    } catch {
      return false;
    }
  }, 3 * 60_000, `The NSIS installer did not apply Switchboard ${targetVersion}.`);

  console.log(`Installed updater verified: Switchboard ${installedVersion} -> ${targetVersion} via ${verdict.updater}.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

function readInstalledVersion() {
  return JSON.parse(asar.extractFile(archivePath, 'package.json').toString('utf8')).version;
}

async function waitFor(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
