'use strict';

// The audio utility worker was the only bundled engine worker and was removed with
// the audio system. Capture runs out of process in Capture.Host, so there is nothing
// to smoke test here. Fail loudly if a worker reappears without a smoke test.
const { existsSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const workerDirectory = join(resolve(__dirname, '..'), 'resources', 'engine-workers');
const workers = existsSync(workerDirectory)
  ? readdirSync(workerDirectory).filter((name) => name.endsWith('.cjs'))
  : [];

if (workers.length > 0) {
  console.error(`Engine workers have no smoke test: ${workers.join(', ')}`);
  process.exit(1);
}
console.log('No utility engine workers are bundled; worker smoke test skipped.');
