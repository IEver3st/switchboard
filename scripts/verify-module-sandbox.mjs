import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { build } from 'vite';

const projectRoot = resolve(import.meta.dirname, '..');
const outputDirectory = resolve(projectRoot, 'out', 'module-sandbox-review');
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(projectRoot, 'scripts', 'module-sandbox-harness.ts'),
    target: 'node22',
    outDir: outputDirectory,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: ['electron'],
      output: { entryFileNames: 'harness.mjs', format: 'es' },
    },
  },
});

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
await new Promise((resolveRun, rejectRun) => {
  const child = spawn(electronPath, [resolve(outputDirectory, 'harness.mjs')], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
  });
  child.once('error', rejectRun);
  child.once('exit', (code, signal) => {
    if (code === 0) resolveRun();
    else rejectRun(new Error(`Module sandbox review exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
  });
});
