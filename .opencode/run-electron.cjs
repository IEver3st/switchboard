const electronPath = require('electron');
const { spawn } = require('child_process');
const { resolve } = require('node:path');

const target = process.argv[2];
if (!target) throw new Error('usage: node run-audio-polish.cjs <script>');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [resolve(__dirname, target), ...process.argv.slice(3)], {
  cwd: resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 1));
