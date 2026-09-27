import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { WebContents } from 'electron';
import type { DeveloperDiagnosticEvent } from '../../shared/contracts';
import { developmentProfileRequestSchema, type DevelopmentProfileRequest } from '../../shared/development-feedback';
import { redactDiagnosticText } from './developer-diagnostics';
import { recordDevelopmentProfiles, summarizeCpuProfile, type ProfileResult } from './development-profiler';
import type { ResourceTelemetrySample } from './resource-journal';

type Recording = ReturnType<typeof summarizeCpuProfile> & { target: string; file?: string; error?: string };
type ProfileBatch = { id: string; reason: string; at: string; recordings: Recording[] };
type Options = {
  directory: string;
  resourceDirectory: string;
  getRenderer: () => WebContents | null;
  record?: typeof recordDevelopmentProfiles;
  now?: () => number;
};

/** Local dev feedback. Reuses the resource tick; no polling timer or listening port. */
export class DevelopmentFeedback {
  public readonly sessionId = randomUUID();
  public readonly directory: string;
  private readonly now: () => number;
  private readonly startedAt: string;
  private sample: ResourceTelemetrySample | null = null;
  private events: DeveloperDiagnosticEvent[] = [];
  private issues: DeveloperDiagnosticEvent[] = [];
  private profiles: ProfileBatch[] = [];
  private requests: Array<{ id: string; error?: string; profileId?: string }> = [];
  private history: Array<{ at: string; rendererActive: boolean; memoryMb: number; cpuPercent: number; loopDelayMs: number | null }> = [];
  private activeProfile: { id: string; reason: string; startedAt: string } | null = null;
  private profileTask: Promise<ProfileBatch> | null = null;
  private profileAbort: AbortController | null = null;
  private requestTask: Promise<void> | null = null;
  private writeTask: Promise<void> | null = null;
  private writeAgain = false;
  private writeTimer: NodeJS.Timeout | null = null;
  private lastAutomaticProfile = -Infinity;
  private slowSamples = 0;
  private automaticProfiles = 0;
  private startupProfileRequested = false;
  private started = false;
  private stopped = false;
  private writeError: string | null = null;
  private startupTask: Promise<void> | null = null;

  public constructor(private readonly options: Options) {
    this.now = options.now ?? Date.now;
    this.startedAt = new Date(this.now()).toISOString();
    this.directory = join(options.directory, `session-${this.now()}-${process.pid}-${this.sessionId}`);
  }

  public start(): Promise<void> {
    return this.startupTask ??= this.startOnce();
  }

  private async startOnce(): Promise<void> {
    await mkdir(join(this.directory, 'requests'), { recursive: true });
    await this.pruneSessions();
    this.started = true;
    await this.flush();
    await atomicJson(join(this.options.directory, 'latest.json'), {
      schemaVersion: 1, sessionId: this.sessionId, directory: basename(this.directory), pid: process.pid, startedAt: this.startedAt,
    });
  }

  public recordEvent(event: DeveloperDiagnosticEvent): void {
    if (this.stopped) return;
    this.events.push(event);
    if (this.events.length > 60) this.events.shift();
    if (event.level === 'warning' || event.level === 'error') {
      this.issues.push(event);
      if (this.issues.length > 20) this.issues.shift();
    }
    this.scheduleWrite();
  }

  public recordSample(sample: ResourceTelemetrySample): void {
    if (this.stopped) return;
    this.sample = sample;
    this.history.push({ at: sample.sampledAt, rendererActive: sample.rendererActive, memoryMb: sample.totals.attributedMemoryMb,
      cpuPercent: sample.totals.cpuPercent, loopDelayMs: sample.debug?.eventLoopDelayMaxMs ?? null });
    if (this.history.length > 12) this.history.shift();
    const slow = (sample.debug?.eventLoopDelayMaxMs ?? 0) >= 100
      || sample.totals.cpuPercent >= Math.max(5, sample.budget.cpuPercent * 2);
    this.slowSamples = slow ? this.slowSamples + 1 : 0;
    // Memory alone does not trigger CPU sampling. Ignore isolated spikes; 5-minute cooldown.
    if (this.slowSamples >= 2) this.automaticProfile('sustained-slowdown');
    if (this.started) {
      this.requestTask ??= this.drainRequests().catch(error => { this.writeError = safeError(error); })
        .finally(() => { this.requestTask = null; });
    }
    this.scheduleWrite();
  }

  public automaticProfile(reason: 'startup' | 'sustained-slowdown'): void {
    if (reason === 'startup' && this.startupProfileRequested) return;
    if (this.stopped || this.profileTask || this.automaticProfiles >= 3 || this.now() - this.lastAutomaticProfile < 300_000) return;
    if (reason === 'startup') this.startupProfileRequested = true;
    this.lastAutomaticProfile = this.now();
    this.automaticProfiles++;
    void this.profile({ id: randomUUID(), sessionId: this.sessionId, durationMs: 3_000, target: 'both' }, reason)
      .catch(error => { this.writeError = safeError(error); });
  }

  public profile(request: DevelopmentProfileRequest, reason = 'requested'): Promise<ProfileBatch> {
    if (this.stopped) return Promise.reject(new Error('Development feedback stopped.'));
    if (this.profileTask) return Promise.reject(new Error('A CPU profile is already running.'));
    this.activeProfile = { id: request.id, reason, startedAt: new Date(this.now()).toISOString() };
    this.profileAbort = new AbortController();
    const signal = this.profileAbort.signal;
    this.profileTask = this.recordProfile(request, reason, signal).finally(() => {
      this.activeProfile = null;
      this.profileAbort = null;
      this.profileTask = null;
      this.scheduleWrite();
    });
    this.scheduleWrite();
    return this.profileTask;
  }

  private async recordProfile(request: DevelopmentProfileRequest, reason: string, signal: AbortSignal): Promise<ProfileBatch> {
    await this.start();
    signal.throwIfAborted();
    const result = await (this.options.record ?? recordDevelopmentProfiles)(request, this.options.getRenderer(), signal);
    const batch: ProfileBatch = { id: request.id, reason, at: new Date(this.now()).toISOString(), recordings: [] };
    for (const item of result) batch.recordings.push(await this.saveProfile(request.id, item));
    this.profiles.push(batch);
    while (this.profiles.length > 4) {
      for (const recording of this.profiles.shift()!.recordings) {
        if (recording.file) await unlink(join(this.directory, recording.file)).catch(() => {});
      }
    }
    return batch;
  }

  private async saveProfile(id: string, result: ProfileResult): Promise<Recording> {
    if (!result.profile) return { target: result.target, durationMs: 0, samples: 0, hotspots: [], error: safeError(result.error ?? 'No profile returned.') };
    const payload = JSON.stringify(result.profile);
    if (Buffer.byteLength(payload) > 8 * 1024 * 1024) return { target: result.target, durationMs: 0, samples: 0, hotspots: [], error: 'Profile exceeded the 8 MiB file limit.' };
    const file = `${id}-${result.target}.cpuprofile`;
    try { await writeFile(join(this.directory, file), payload, 'utf8'); }
    catch (error) {
      await unlink(join(this.directory, file)).catch(() => {});
      return { target: result.target, durationMs: 0, samples: 0, hotspots: [], error: safeError(error) };
    }
    return { target: result.target, file, ...summarizeCpuProfile(result.profile) };
  }

  private async drainRequests(): Promise<void> {
    const directory = join(this.directory, 'requests');
    const files = (await readdir(directory)).filter(file => /^[a-f0-9-]{36}\.json$/.test(file)).slice(0, 8);
    for (const file of files) {
      if (this.stopped) break;
      const path = join(directory, file);
      const id = file.slice(0, -5);
      try {
        if ((await stat(path)).size > 4096) throw new Error('Profile request exceeds 4 KiB.');
        const request = developmentProfileRequestSchema.parse(JSON.parse(await readFile(path, 'utf8')));
        if (request.id !== id || request.sessionId !== this.sessionId) throw new Error('Profile request belongs to a different session.');
        const batch = await this.profile(request);
        this.requests.push({ id, profileId: batch.id });
      } catch (error) { this.requests.push({ id, error: safeError(error) }); }
      finally { await unlink(path).catch(() => {}); }
      this.requests = this.requests.slice(-10);
      await this.flush();
    }
  }

  private scheduleWrite(): void {
    if (!this.started || this.stopped || this.writeTimer) return;
    this.writeTimer = setTimeout(() => { this.writeTimer = null; void this.flush(); }, 1_000);
    this.writeTimer.unref();
  }

  public flush(): Promise<void> {
    if (!this.started) return Promise.resolve();
    this.writeAgain = true;
    return this.writeTask ??= this.writeStatus().finally(() => { this.writeTask = null; });
  }

  private async writeStatus(): Promise<void> {
    while (this.writeAgain) {
      this.writeAgain = false;
      try {
        await atomicJson(join(this.directory, 'status.json'), {
          schemaVersion: 1, sessionId: this.sessionId, pid: process.pid, startedAt: this.startedAt,
          updatedAt: new Date(this.now()).toISOString(), state: this.stopped ? 'stopped' : 'running',
          sample: this.sample, history: this.history, issues: this.issues, events: this.events,
          profiles: this.profiles, activeProfile: this.activeProfile, requests: this.requests, writeError: this.writeError,
          resourceDirectory: this.options.resourceDirectory,
          limits: '5s samples; 60 events / 20 warnings and errors; 4 profile batches, 8 MiB per profile; 3 automatic batches per session, 5m cooldown. Instrumented dev data is not a release budget measurement.',
        });
      } catch (error) { this.writeError = safeError(error); }
    }
  }

  public async dispose(): Promise<void> {
    this.stopped = true;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    this.profileAbort?.abort();
    await this.startupTask?.catch(() => {});
    await this.profileTask?.catch(() => {});
    await this.requestTask?.catch(() => {});
    await this.flush();
  }

  private async pruneSessions(): Promise<void> {
    const entries = (await readdir(this.options.directory)).filter(name => /^session-\d+-\d+-[a-f0-9-]{36}$/.test(name))
      .sort().reverse();
    let retained = 0;
    for (const name of entries) {
      const directory = resolve(this.options.directory, name);
      if (directory === resolve(this.directory)) continue;
      try {
        const status = JSON.parse(await readFile(join(directory, 'status.json'), 'utf8'));
        if (status.state === 'running' && Number.isInteger(status.pid)) {
          try { process.kill(status.pid, 0); continue; } catch { /* Ended process. */ }
        }
      } catch { /* Incomplete old session. */ }
      if (++retained <= 2) continue;
      // Only generated child directories inside our diagnostics root are eligible.
      if (resolve(directory, '..') === resolve(this.options.directory)) await rm(directory, { recursive: true, force: true });
    }
  }
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2), 'utf8');
  await rename(`${path}.tmp`, path);
}
function safeError(error: unknown): string { return redactDiagnosticText(error instanceof Error ? error.message : String(error)); }
