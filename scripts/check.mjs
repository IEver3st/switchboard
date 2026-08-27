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
  'electron.vite.config.ts',
  'src/main/index.ts',
  'src/main/ipc.ts',
  'src/preload/index.ts',
  'src/shared/contracts.ts',
  'src/renderer/src/App.tsx',
  'resources/engine-workers/audio-worker.cjs',
  'engines/audio-host/Audio.Host.csproj',
  'engines/capture-host/Capture.Host.csproj',
  'preview/index.html',
  'preview/styles.css',
  'preview/app.js',
  'scripts/build-standalone-preview.mjs',
  'scripts/worker-smoke.cjs',
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

const mainSource = read('src/main/index.ts');
assert(mainSource.includes('contextIsolation: true'), 'Electron renderer must use contextIsolation.');
assert(mainSource.includes('sandbox: true'), 'Electron renderer must use Chromium sandboxing.');
assert(mainSource.includes('nodeIntegration: false'), 'Electron renderer must disable Node integration.');
assert(mainSource.includes("setWindowOpenHandler(() => ({ action: 'deny' }))"), 'New-window creation must be denied by default.');
assert(mainSource.includes("will-navigate"), 'Renderer navigation must be restricted.');
assert(mainSource.includes("setPermissionRequestHandler"), 'Renderer permissions must be denied by default.');
assert(mainSource.includes("before-quit"), 'Engine cleanup must participate in a graceful quit sequence.');

const preloadSource = read('src/preload/index.ts');
assert(preloadSource.includes("contextBridge.exposeInMainWorld('switchboard'"), 'Preload must expose the narrow Switchboard API.');
assert(!preloadSource.includes('ipcRenderer.send('), 'Preload must not expose an unrestricted ipcRenderer.send surface.');

const captureHeaderSource = read('src/renderer/src/components/capture/CaptureHeader.tsx');
assert(
  !captureHeaderSource.includes('function ReplayStatus(')
    && !captureHeaderSource.includes('aria-label="Replay buffer"')
    && !captureHeaderSource.includes('state.saveReplay')
    && /<section aria-label="Capture controls"[^>]*>\s*<div className="capture-config-grid/.test(captureHeaderSource),
  'CaptureHeader must keep the removed replay status/action row out of the capture workspace.',
);

const ipcSource = read('src/main/ipc.ts');
assert(ipcSource.includes('assertTrustedSender'), 'IPC handlers must validate their sender.');
assert(ipcSource.includes('.parse('), 'IPC payloads must be schema validated.');
assert(ipcSource.includes('event.sender.id'), 'IPC must be pinned to the current main renderer webContents.');
assert(!ipcSource.includes('Boolean(input)') && !ipcSource.includes('Number(input)'), 'IPC must not use lossy Boolean/Number coercion.');
assert(ipcSource.includes('await controller.initialize();'), 'The initial renderer snapshot must wait for real controller initialization.');

const appSource = read('src/renderer/src/App.tsx');
const startupScreenSource = read('src/renderer/src/components/layout/startup-screen.tsx');
assert(
  !appSource.includes('minimumStartupDuration')
    && !appSource.includes('setTimeout')
    && !startupScreenSource.includes('setTimeout'),
  'The startup screen must not impose a minimum duration or artificial delay.',
);
assert(
  mainSource.includes('const initialization = controller.initialize();')
    && mainSource.includes('showWindow();\n    await initialization;'),
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
assert(stateStore.includes('setRendererActive'), 'Performance telemetry must account for renderer destruction in tray mode.');

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
