// Protocol fixture only; these counters are not live measurements.
const { createInterface } = require('node:readline');
const mode = process.argv[2];
if (mode === 'never-ready') setInterval(() => {}, 1000);
else setTimeout(() => {
  process.stdout.write('{"type":"ready"}\n');
  createInterface({ input: process.stdin }).on('line', () => {
    if (mode === 'hang') return;
    process.stdout.write(JSON.stringify(mode === 'malformed' ? {} : {
      processes: [], requested: 0, inaccessible: 0, durationMs: 1, monitorPid: process.pid,
    }) + '\n');
  });
}, Number(process.argv[3] ?? 0));
