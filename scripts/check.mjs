import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const requiredFiles = [
  'package.json',
  'electron-builder.yml',
  'electron.vite.config.ts',
  '.github/workflows/release.yml',
  'src/main/index.ts',
  'src/main/ipc.ts',
  'src/preload/index.ts',
  'src/shared/contracts.ts',
  'src/renderer/src/App.tsx',
  'src/renderer/public/switchboard-icon.png',
  'src/renderer/public/switchboard-mark.png',
  'resources/branding/switchboard-icon.ico',
  'resources/branding/switchboard-icon.png',
  'resources/branding/switchboard-mark.png',
  'build/icon.ico',
  'resources/engine-workers/audio-worker.cjs',
  'engines/audio-host/Audio.Host.csproj',
  'engines/capture-host/Capture.Host.csproj',
  'preview/index.html',
  'preview/styles.css',
  'preview/app.js',
  'scripts/build-standalone-preview.mjs',
  'scripts/worker-smoke.cjs',
  'scripts/verify-packaged-updater.mjs',
  'scripts/verify-installed-update.mjs',
  'AGENTS.md',
  'ARCHITECTURE.md',
  'PERFORMANCE.md',
];

for (const relativePath of requiredFiles) {
  assert(fs.existsSync(path.join(root, relativePath)), `Missing required file: ${relativePath}`);
}

for (const relativePath of ['package.json', 'tsconfig.json', 'tsconfig.node.json', 'tsconfig.web.json', 'components.json']) {
  try {
    JSON.parse(read(relativePath));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.packageManager?.startsWith('bun@'), 'package.json must pin Bun through packageManager.');
assert(packageJson.main === './out/main/index.js', 'package.json main must point at the Electron main bundle.');
assert(packageJson.scripts?.check && packageJson.scripts?.['check:source'] && packageJson.scripts?.['check:types'], 'Validation scripts are missing from package.json.');
assert(packageJson.dependencies?.['electron-updater'], 'Installed builds must include electron-updater.');
assert(packageJson.scripts?.['dist:win']?.includes('electron-builder --win nsis'), 'Windows distribution must produce an NSIS installer.');
assert(packageJson.scripts?.['release:win']?.includes('--publish always'), 'Windows releases must publish update metadata and artifacts.');
assert(packageJson.scripts?.['verify:packaged-updater'], 'Windows releases must verify the packaged updater runtime.');
assert(packageJson.scripts?.['verify:installed-update'], 'Windows releases must retain an installed update acceptance check.');

const builderConfiguration = read('electron-builder.yml');
assert(builderConfiguration.includes('provider: github'), 'Application updates must use the public GitHub release provider.');
assert(builderConfiguration.includes('owner: IEver3st') && builderConfiguration.includes('repo: switchboard'), 'The update feed must target IEver3st/switchboard.');
assert(builderConfiguration.includes('- nsis'), 'Windows packaging must retain the updater-compatible NSIS target.');
assert(builderConfiguration.includes('releaseType: draft'), 'Windows releases must remain drafts until packaged updater verification passes.');

const releaseWorkflow = read('.github/workflows/release.yml');
assert(releaseWorkflow.includes("- 'v*.*.*'"), 'Windows releases must be triggered by semantic version tags.');
assert(releaseWorkflow.includes('bun run release:win'), 'The release workflow must publish the Windows installer and update feed.');
assert(releaseWorkflow.includes('latest.yml') && releaseWorkflow.includes('SHA256SUMS-Windows.txt'), 'The release workflow must verify update metadata and checksums.');
assert(releaseWorkflow.includes('bun run verify:packaged-updater'), 'The release workflow must exercise the packaged updater runtime.');
assert(releaseWorkflow.includes('gh release create') && releaseWorkflow.includes('--verify-tag --draft'), 'The release workflow must pre-create one verified draft before parallel artifact uploads.');
assert(releaseWorkflow.includes('gh release edit') && releaseWorkflow.includes('--draft=false'), 'The release workflow must publish only after draft verification.');
assert(releaseWorkflow.includes('releases/latest/download/latest.yml'), 'The release workflow must verify the anonymous public update feed.');

const defaultsSource = read('src/shared/defaults.ts');
assert(
  defaultsSource.includes(`currentVersion: '${packageJson.version}'`)
    && defaultsSource.includes(`version: '${packageJson.version}'`),
  'Shared default versions must match package.json.',
);

const mainSource = read('src/main/index.ts');
assert(mainSource.includes('contextIsolation: true'), 'Electron renderer must use contextIsolation.');
assert(mainSource.includes('sandbox: true'), 'Electron renderer must use Chromium sandboxing.');
assert(mainSource.includes('nodeIntegration: false'), 'Electron renderer must disable Node integration.');
assert(mainSource.includes("setWindowOpenHandler(() => ({ action: 'deny' }))"), 'New-window creation must be denied by default.');
assert(mainSource.includes("will-navigate"), 'Renderer navigation must be restricted.');
assert(mainSource.includes("setPermissionRequestHandler"), 'Renderer permissions must be denied by default.');
assert(mainSource.includes("before-quit"), 'Engine cleanup must participate in a graceful quit sequence.');
assert(
  mainSource.includes("getBrandIconPath(process.platform === 'win32' ? 'ico' : 'png')"),
  'Windows BrowserWindow branding must use the multi-resolution ICO asset.',
);

const sidebarSource = read('src/renderer/src/components/layout/sidebar.tsx');
const startupScreenSource = read('src/renderer/src/components/layout/startup-screen.tsx');
assert(sidebarSource.includes('./switchboard-mark.png'), 'The in-app sidebar must use the transparent four-bar mark.');
assert(startupScreenSource.includes('./switchboard-mark.png'), 'The startup animation must use the transparent four-bar mark.');

const windowsIcon = fs.readFileSync(path.join(root, 'build/icon.ico'));
const iconEntryCount = windowsIcon.readUInt16LE(4);
const iconSizes = Array.from({ length: iconEntryCount }, (_, index) => {
  const width = windowsIcon[6 + (index * 16)];
  return width === 0 ? 256 : width;
});
assert(
  windowsIcon.readUInt16LE(0) === 0
    && windowsIcon.readUInt16LE(2) === 1
    && [16, 20, 24, 32, 40, 48, 64, 128, 256].every((size) => iconSizes.includes(size)),
  'build/icon.ico must remain a valid multi-resolution Windows application icon.',
);

const preloadSource = read('src/preload/index.ts');
assert(preloadSource.includes("contextBridge.exposeInMainWorld('switchboard'"), 'Preload must expose the narrow Switchboard API.');
assert(!preloadSource.includes('ipcRenderer.send('), 'Preload must not expose an unrestricted ipcRenderer.send surface.');

const captureHeaderSource = read('src/renderer/src/components/capture/CaptureHeader.tsx');
assert(
  !captureHeaderSource.includes('function ReplayStatus(')
    && !captureHeaderSource.includes('aria-label="Replay buffer"')
    && !captureHeaderSource.includes('state.saveReplay')
    && /<section aria-label="Clips commands"[^>]*>\s*<div className="capture-command-header__top/.test(captureHeaderSource)
    && captureHeaderSource.includes('className="capture-replay-summary h-8"'),
  'CaptureHeader must keep replay configuration integrated into the unified Clips command header.',
);

const ipcSource = read('src/main/ipc.ts');
const startupReadinessSource = read('src/main/startup-readiness.ts');
assert(ipcSource.includes('assertTrustedSender'), 'IPC handlers must validate their sender.');
assert(ipcSource.includes('.parse('), 'IPC payloads must be schema validated.');
assert(ipcSource.includes('event.sender.id'), 'IPC must be pinned to the current main renderer webContents.');
assert(!ipcSource.includes('Boolean(input)') && !ipcSource.includes('Number(input)'), 'IPC must not use lossy Boolean/Number coercion.');
assert(
  ipcSource.includes('return getStartupSnapshot(controller);')
    && startupReadinessSource.includes('await controller.prepareSnapshot();')
    && !startupReadinessSource.includes('controller.initialize('),
  'The initial renderer snapshot must wait for persisted state without waiting for background services.',
);

const appSource = read('src/renderer/src/App.tsx');
assert(
  !appSource.includes('minimumStartupDuration')
    && !appSource.includes('setTimeout')
    && !startupScreenSource.includes('setTimeout'),
  'The startup screen must not impose a minimum duration or artificial delay.',
);
assert(
  mainSource.includes('const initialization = controller.initialize();')
    && /showWindow\(\);\r?\n\s+await initialization;/.test(mainSource),
  'The main window must be shown while real controller initialization is still running.',
);

const engineSupervisor = read('src/main/services/engine-supervisor.ts');
assert(
  engineSupervisor.includes('resolveAudioHost()') && engineSupervisor.includes('spawnAudioHost()'),
  'Audio must run in the isolated native Audio.Host process.',
);
assert(
  engineSupervisor.includes('resolveCaptureHost()') && engineSupervisor.includes('spawn(resolved.command'),
  'Capture must run in the isolated native Capture.Host process.',
);
assert(engineSupervisor.includes('workerMessageSchema.safeParse'), 'Engine worker messages must be schema validated.');
assert(engineSupervisor.includes('failPending'), 'Engine exits must reject pending requests.');

const stateStore = read('src/main/services/state-store.ts');
assert(stateStore.includes('{ persist: false }'), 'Runtime telemetry must support transient, non-persisted updates.');
const performanceMonitor = read('src/main/services/performance-monitor.ts');
assert(performanceMonitor.includes('rendererActive'), 'Performance telemetry must account for renderer destruction in tray mode.');
assert(performanceMonitor.includes('rollingWindowSamples'), 'Performance guard must use sustained rolling samples.');

for (const relativePath of [
  'resources/engine-workers/audio-worker.cjs',
  'preview/app.js',
  'scripts/build-standalone-preview.mjs',
  'scripts/worker-smoke.cjs',
]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relativePath)], { encoding: 'utf8' });
  if (result.status !== 0) fail(`${relativePath} failed node --check:\n${result.stderr || result.stdout}`);
}

const previewHtml = read('preview/index.html');
assert(previewHtml.includes('./styles.css'), 'Static preview must reference styles.css.');
assert(previewHtml.includes('./app.js'), 'Static preview must reference app.js.');

for (const relativePath of ['engines/audio-host/Audio.Host.csproj', 'engines/capture-host/Capture.Host.csproj']) {
  const source = read(relativePath);
  assert(source.includes('<TargetFramework>net10.0-windows</TargetFramework>'), `${relativePath} must target net10.0-windows.`);
  assert(source.includes('<Nullable>enable</Nullable>'), `${relativePath} must enable nullable reference types.`);
}

const captureSource = read('engines/capture-host/ReplayEngine.cs');
const replayRing = read('engines/capture-host/ReplaySegmentRing.cs');
assert(captureSource.includes('gfxcapture='), 'Capture host must contain the Windows Graphics Capture path.');
assert(captureSource.includes('AudioPipeCapture.CreateSystemLoopback'), 'Capture host must own real system-audio capture.');
assert(captureSource.includes('RunRemuxAsync'), 'Capture host must stream-copy replay segments into saved clips.');
assert(replayRing.includes('MaximumCacheBytes') || captureSource.includes('MaximumCacheBytes'), 'Replay cache must enforce a hard byte bound.');
assert(replayRing.includes('CreateHardLinkW'), 'Replay saves must snapshot immutable segments without copying when NTFS permits.');

const audioGraph = read('engines/audio-host/AudioGraph.cs');
assert(audioGraph.includes('ProcessMicrophone(Span<float>'), 'Audio graph must process caller-owned Span<float> buffers.');
const realtimeStart = audioGraph.indexOf('public void ProcessMicrophone');
const realtimeEnd = audioGraph.indexOf('private static void ApplyGain', realtimeStart);
const realtimePath = realtimeStart >= 0 && realtimeEnd > realtimeStart ? audioGraph.slice(realtimeStart, realtimeEnd) : '';
assert(!realtimePath.includes(' new ') && !realtimePath.includes('.Select(') && !realtimePath.includes('.Where('), 'Audio realtime callback must avoid allocations and LINQ.');

function loadTypeScript() {
  for (const candidate of [
    'typescript',
    '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js',
    '/usr/local/lib/node_modules/typescript/lib/typescript.js',
  ]) {
    try {
      const loaded = require(candidate);
      if (typeof loaded.preProcessFile === 'function') return loaded;
    } catch { }
  }
  return null;
}

const ts = loadTypeScript();
if (ts) {
  const sourceFiles = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(fullPath);
    }
  };
  walk(path.join(root, 'src'));
  sourceFiles.push(path.join(root, 'electron.vite.config.ts'));

  const extensions = ['', '.ts', '.tsx', '.js', '.cjs', '.json'];
  for (const sourceFile of sourceFiles) {
    const parsed = ts.preProcessFile(fs.readFileSync(sourceFile, 'utf8'), true, true);
    for (const imported of parsed.importedFiles) {
      const specifier = imported.fileName;
      let base;
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        base = path.resolve(path.dirname(sourceFile), specifier);
      } else if (specifier.startsWith('@/')) {
        base = path.join(root, 'src/renderer/src', specifier.slice(2));
      } else if (specifier.startsWith('@shared/')) {
        base = path.join(root, 'src/shared', specifier.slice('@shared/'.length));
      } else {
        continue;
      }

      const candidates = [
        ...extensions.map((extension) => `${base}${extension}`),
        ...extensions.slice(1).map((extension) => path.join(base, `index${extension}`)),
      ];
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        fail(`Unresolved local import '${specifier}' from ${path.relative(root, sourceFile)}`);
      }
    }
  }
}

const workerSmoke = spawnSync(process.execPath, [path.join(root, 'scripts/worker-smoke.cjs')], { encoding: 'utf8' });
if (workerSmoke.status !== 0) fail(workerSmoke.stderr || workerSmoke.stdout || 'Utility worker smoke tests failed.');
else process.stdout.write(workerSmoke.stdout);

const transpile = spawnSync(process.execPath, [path.join(root, 'scripts/transpile-check.mjs')], { encoding: 'utf8' });
if (transpile.status !== 0) fail(transpile.stderr || transpile.stdout || 'TypeScript transpilation check failed.');
else process.stdout.write(transpile.stdout);

if (failures.length > 0) {
  console.error(`\nPrototype validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log('Switchboard structure, security boundaries, imports, hosts, and static preview passed validation.');
