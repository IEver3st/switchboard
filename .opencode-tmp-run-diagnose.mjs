import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname);
const script = join(projectRoot, '.opencode-tmp-diagnose-popup.mjs');
const cleanEnvironment = { ...process.env };
delete cleanEnvironment.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [script], { cwd: projectRoot, env: cleanEnvironment, stdio: 'inherit' });
child.once('exit', (code) => process.exit(code ?? 1));
