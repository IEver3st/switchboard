import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { developmentProfileRequestSchema } from '../src/shared/development-feedback';

const args = process.argv.slice(2);
const value = (name: string) => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const root = resolve(value('--directory') ?? process.env.SWITCHBOARD_DEV_FEEDBACK_DIRECTORY
  ?? join(import.meta.dirname, '..', '.switchboard', 'dev-feedback'));

try {
  if (args.includes('--help')) {
    console.log('bun run diagnose:dev [--json] [--profile] [--target=both|main|renderer] [--seconds=5] [--directory=PATH]\n'
      + 'Reads the current dev session. --profile requests a bounded recording on its next 5-second sample.');
  } else {
    const latest = JSON.parse(await readFile(join(root, 'latest.json'), 'utf8'));
    if (latest.schemaVersion !== 1 || !/^session-\d+-\d+-[a-f0-9-]{36}$/.test(latest.directory)) throw new Error('Invalid development session manifest.');
    const directory = join(root, latest.directory);
    const statusPath = join(directory, 'status.json');
    let status = JSON.parse(await readFile(statusPath, 'utf8'));
    if (status.sessionId !== latest.sessionId) throw new Error('Development session changed; run the command again.');
    if (args.includes('--profile')) {
      if (!isLive(status)) throw new Error('No responsive dev session is running. Start bun run dev first.');
      const request = developmentProfileRequestSchema.parse({
        id: randomUUID(), sessionId: latest.sessionId, durationMs: Number(value('--seconds') ?? 5) * 1_000,
        target: value('--target') ?? 'both',
      });
      const path = join(directory, 'requests', `${request.id}.json`);
      await mkdir(join(directory, 'requests'), { recursive: true });
      await writeFile(`${path}.tmp`, JSON.stringify(request), { flag: 'wx' });
      await rename(`${path}.tmp`, path);
      if (!args.includes('--json')) console.log(`Recording ${request.target} for ${request.durationMs / 1000}s on the next resource tick...`);
      const deadline = Date.now() + request.durationMs + 20_000;
      while (true) {
        status = JSON.parse(await readFile(statusPath, 'utf8'));
        const response = status.requests.find((item: any) => item.id === request.id);
        if (response?.error) throw new Error(response.error);
        if (response?.profileId) break;
        if (!isLive(status) || Date.now() > deadline) throw new Error(`No profile response. Inspect ${statusPath} for a stopped or stalled session.`);
        await delay(200);
      }
    }
    const live = isLive(status);
    if (args.includes('--json')) console.log(JSON.stringify({ ...status, live, directory }, null, 2));
    else {
      const sample = status.sample;
      const debug = sample?.debug;
      console.log(`Switchboard dev: ${live ? 'running' : status.state === 'stopped' ? 'stopped' : 'stale / exited'} | PID ${status.pid} | updated ${Math.max(0, Math.round((Date.now() - Date.parse(status.updatedAt)) / 1000))}s ago`);
      console.log(`Session: ${directory}`);
      if (sample) {
        console.log(`${sample.rendererActive ? 'Open' : 'Tray'} | ${sample.totals.attributedMemoryMb} MiB private | ${sample.totals.cpuPercent}% CPU | loop max ${debug?.eventLoopDelayMaxMs ?? '?'}ms | guard ${sample.guardState}`);
        console.log('Processes: ' + sample.electronProcesses.map((item: any) => `${item.type} ${item.privateMb} MiB / ${item.cpuPercent}%`).join(', '));
      } else console.log('Waiting for the first runtime sample (startup or runtime handoff may still be pending).');
      const operations = [...(debug?.operations ?? [])].sort((a, b) => b.totalMs - a.totalMs).slice(0, 6);
      if (operations.length) {
        console.log('\nCumulative operations (inclusive wall time; includes async waits):');
        for (const operation of operations) console.log(`  ${operation.name}: ${operation.totalMs}ms / ${operation.calls} calls, max ${operation.maxMs}ms, failed ${operation.failures}, in flight ${operation.inFlight}`);
      }
      console.log(`\nRecent warnings/errors (${status.issues.length} retained):`);
      for (const issue of status.issues.slice(-8)) console.log(`  ${issue.sampledAt} ${issue.source}/${issue.event} ${compact(JSON.stringify(issue.data), 300)}`);
      if (!status.issues.length) console.log('  None recorded.');
      if (status.activeProfile) console.log(`\nProfile running: ${status.activeProfile.reason}`);
      const profile = status.profiles.at(-1);
      if (profile) {
        console.log(`\nLatest CPU profile: ${profile.reason} at ${profile.at}`);
        for (const recording of profile.recordings) {
          if (recording.error) { console.log(`  ${recording.target}: unavailable (${recording.error})`); continue; }
          console.log(`  ${recording.target}: ${recording.samples} samples, ${Math.round(recording.durationMs)}ms; ${join(directory, recording.file)}`);
          for (const row of recording.hotspots.slice(0, 5)) {
            console.log(`    ${row.percent}% self / ${row.selfMs}ms ${row.function} (${basename(row.url.split('?')[0])}:${row.line})`);
            if (row.callers?.length) console.log('      from ' + row.callers.slice(0, 3).map((caller: any) => caller.function).join(' <- '));
          }
        }
      }
      if (status.writeError) console.log(`\nFeedback write error: ${status.writeError}`);
      console.log('\nRaw events: ' + status.resourceDirectory);
      console.log('Dev instrumentation is active; use measure:idle with feedback disabled for budget comparisons.');
      try {
        const server = await readFile(join(root, 'server.log'), 'utf8');
        const errors = server.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/).filter(line => /\berror\b|\bfailed\b/i.test(line)).slice(-4);
        if (errors.length) console.log('\nDev server warnings/errors (raw log: ' + join(root, 'server.log') + '):\n'
          + errors.map(line => compact(line, 300)).join('\n'));
      } catch { /* Running servers started before this feature have no launcher log. */ }
    }
  }
} catch (error) {
  console.error(`Development feedback: ${error instanceof Error ? error.message : String(error)}\nStart bun run dev to enable collection. Files: ${root}`);
  process.exitCode = 1;
}

function isLive(status: any): boolean {
  if (status.state !== 'running' || Date.now() - Date.parse(status.updatedAt) > 20_000 || !Number.isInteger(status.pid)) return false;
  try { process.kill(status.pid, 0); return true; } catch { return false; }
}

function compact(text: string, limit: number): string {
  const readable = text.replace(/data:[^\s"']+/g, '<data-url>').replace(/\\n/g, ' ');
  return readable.length <= limit ? readable : readable.slice(0, limit) + '... (full detail: --json)';
}
