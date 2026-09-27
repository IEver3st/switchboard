import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn('node_modules/electron/dist/electron.exe',['design-qa/marketing-customization-20260915/session.mjs'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);child.on('exit',c=>console.log('EXIT',c));
