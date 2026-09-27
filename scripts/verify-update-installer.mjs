import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { getMakeNsisPath, getNsisPluginsPath } from 'app-builder-lib/out/toolsets/windows.js';
import { build, Platform } from 'electron-builder';

// Compile and execute only an isolated, silent NSIS fixture. It never installs
// Switchboard, writes registry/shortcuts, or starts a visible application.
assert.equal(process.platform, 'win32', 'This check requires Windows.');
const reviewRoot = resolve('.switchboard/update-installer-review');
await mkdir(reviewRoot, { recursive: true });
const root = await mkdtemp(join(reviewRoot, 'run-'));
const installDir = join(root, 'app');
const siblingDir = join(root, 'app-other');
await Promise.all([mkdir(installDir, { recursive: true }), mkdir(siblingDir, { recursive: true })]);
const compiler = await getMakeNsisPath();
const plugins = await getNsisPluginsPath();
const includes = resolve('node_modules/app-builder-lib/templates/nsis/include');
const policy = resolve('build/installer.nsh');
const log = join(root, 'result.ini');
const executable = join(root, 'fixture.exe');

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { windowsHide: true, timeout: 90_000, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk; });
    child.stderr?.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolveRun({ code, output }));
  });
}

const source = (baseline = false, uninstaller = false) => `
Unicode true
SilentInstall silent
RequestExecutionLevel user
OutFile "${executable}"
InstallDir "${installDir}"
!include LogicLib.nsh
!include FileFunc.nsh
!addincludedir "${includes}"
!addplugindir /x86-unicode "${join(plugins, 'x86-unicode')}"
!define APP_EXECUTABLE_FILENAME "fixture-host.exe"
!define isUpdated '1 == 1'
${uninstaller ? '!define BUILD_UNINSTALLER' : ''}
!include "${policy}"
!include "allowOnlyOneInstallerInstance.nsh"
LangString appRunning 1033 "Close fixture"
LangString appClosing 1033 "Closing fixture"
LangString appCannotBeClosed 1033 "Fixture is busy"
!define PRODUCT_NAME "Update fixture"
!insertmacro customHeader

!macro recordPriority PHASE
  System::Call 'kernel32::GetPriorityClass(p -1) i .r0'
  WriteINIStr "${log}" "\${PHASE}" "cpu" "$0"
  System::Call 'ntdll::NtQueryInformationProcess(p -1, i 33, *i .r0, i 4, p 0) i .r1'
  WriteINIStr "${log}" "\${PHASE}" "io" "$0"
  WriteINIStr "${log}" "\${PHASE}" "ioStatus" "$1"
!macroend

${uninstaller ? `Section
  WriteUninstaller "${join(root, 'uninstaller.exe')}"
SectionEnd
Section "Uninstall"` : 'Section'}
  !insertmacro recordPriority before
  ${baseline ? '' : '!insertmacro beginQuietUpdate'}
  !insertmacro recordPriority during
  System::Call 'kernel32::GetTickCount() i .r8'
  ${baseline ? `StrCpy $CmdPath "$SYSDIR\\cmd.exe"
  StrCpy $PowerShellPath "$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe"
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro FIND_PROCESS "fixture-host.exe" $R0
  WriteINIStr "${log}" "scan" "legacyResult" "$R0"` : `Call \${UPDATE_FUNCTION_PREFIX}FindUpdateProcesses
  WriteINIStr "${log}" "scan" "present" "$updateProcessesPresent"`}
  System::Call 'kernel32::GetTickCount() i .r9'
  IntOp $9 $9 - $8
  WriteINIStr "${log}" "scan" "ms" "$9"
  ${baseline ? '' : '!insertmacro customCheckAppRunning'}
  WriteINIStr "${log}" "install" "reached" "1"
  !insertmacro customInstall
  !insertmacro recordPriority after
SectionEnd
`;

async function compile(baseline = false, uninstaller = false) {
  const script = join(root, 'fixture.nsi');
  // These variables normally come from CHECK_APP_RUNNING in the real template.
  await writeFile(script, 'Var CmdPath\nVar PowerShellPath\n' + source(baseline, uninstaller));
  const result = await run(compiler.path, ['/V2', script], { env: { ...process.env, ...compiler.env } });
  assert.equal(result.code, 0, result.output);
}

function parseIni(text) {
  const values = {};
  let section = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('[')) section = line.slice(1, -1);
    else if (line.includes('=')) {
      const [key, value] = line.split('=');
      values[`${section}.${key}`] = Number(value);
    }
  }
  return values;
}

async function review(command = executable, expectedCode = 0) {
  await writeFile(log, '');
  const start = performance.now();
  const result = await run(command, ['/S', '--updated', ...(command === executable ? [] : [`_?=${installDir}`])]);
  assert.equal(result.code, expectedCode, result.output);
  const metrics = { ...parseIni(await readFile(log, 'utf8')), elapsedMs: Math.round(performance.now() - start) };
  if (expectedCode === 0) {
    assert.equal(metrics['install.reached'], 1);
    assert.equal(metrics['after.cpu'], metrics['before.cpu']);
    assert.equal(metrics['after.io'], metrics['before.io']);
  } else assert.equal(metrics['install.reached'], undefined, 'Busy app must prevent installation.');
  return metrics;
}

const children = [];
async function startHost(directory) {
  const host = join(directory, 'fixture-host.exe');
  await copyFile(process.execPath, host);
  const child = spawn(host, ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  await new Promise((ready, reject) => {
    child.stdout.once('data', ready);
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Fixture host exited early: ${code}`)));
  });
  return child;
}

const results = {};
try {
  await compile(true);
  results.legacy = await review();
  await compile();
  results.native = await review();
  assert.equal(results.native['scan.present'], 0);
  assert.equal(results.native['during.cpu'], 64, 'Silent update must use idle CPU priority.');
  assert.equal(results.native['during.io'], 0, 'Silent update must use very low I/O priority.');
  assert.equal(results.native['during.ioStatus'], 0);
  await startHost(siblingDir);
  results.sibling = await review();
  assert.equal(results.sibling['scan.present'], 0, 'Sibling directory must not block.');
  const host = await startHost(installDir);
  const graceful = review();
  setTimeout(() => host.kill(), 2000);
  results.graceful = await graceful;
  assert.equal(results.graceful['scan.present'], 1);
  assert.ok(results.graceful.elapsedMs >= 1800, 'Installer must wait for shutdown.');
  const blocked = await startHost(installDir);
  results.busy = await review(executable, 1618);
  assert.ok(results.busy.elapsedMs >= 30_000 && results.busy.elapsedMs < 40_000, 'Busy wait must have a wall-clock deadline.');
  assert.equal(blocked.exitCode, null, 'Installer must never force-kill a busy app.');
  blocked.kill();
  await compile(false, true);
  assert.equal((await run(executable, ['/S'])).code, 0);
  results.uninstaller = await review(join(root, 'uninstaller.exe'));
  assert.equal(results.uninstaller['during.cpu'], 64);
  assert.equal(results.uninstaller['during.io'], 0);
  // Compile both real electron-builder template passes with the production
  // include. This tiny package is never executed; it has no product identity.
  const packaged = join(root, 'packaged');
  await mkdir(join(packaged, 'resources'), { recursive: true });
  await copyFile(executable, join(packaged, 'fixture-host.exe'));
  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget('nsis'),
    prepackaged: packaged,
    publish: 'never',
    config: {
      extends: resolve('electron-builder.yml'),
      appId: 'dev.switchboard.installer-review',
      productName: 'Switchboard Installer Review',
      artifactName: 'installer-review.exe',
      directories: { output: join(root, 'package-output') },
      publish: null,
      win: { executableName: 'fixture-host', signAndEditExecutable: false },
      nsis: {
        include: policy,
        runAfterFinish: false,
        createDesktopShortcut: false,
        createStartMenuShortcut: false,
      },
    },
  });
  assert.ok(artifacts.some(path => path.endsWith('installer-review.exe')));
  results.templateCompiled = true;
  await writeFile(join(root, 'verification.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ directory: root, ...results }, null, 2));
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
}
