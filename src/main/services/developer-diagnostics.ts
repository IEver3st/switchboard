import { randomUUID } from 'node:crypto';
import { developerDiagnosticInputSchema, type DeveloperDiagnosticEvent, type DeveloperDiagnosticInput } from '../../shared/contracts';

type EventSource = DeveloperDiagnosticEvent['source'];
type EventData = DeveloperDiagnosticInput['data'];
const maximumEvents = 2_000;
const maximumBytes = 2 * 1024 * 1024;
const maximumEventBytes = 8 * 1024;

/** Event-driven developer trace. No timer, file handle, or retained events while disabled. */
export class DeveloperDiagnosticsCollector {
  private active = false;
  private sessionId = '';
  private startedAt: string | null = null;
  private sequence = 0;
  private entries: Array<{ event: DeveloperDiagnosticEvent; bytes: number }> = [];
  private bytes = 0;
  private discardedEvents = 0;
  private rateWindow = 0;
  private rateCount = 0;
  private sink: ((event: DeveloperDiagnosticEvent) => void) | undefined;

  public get enabled(): boolean { return this.active; }
  public get recordingId(): string | null { return this.active ? this.sessionId : null; }

  public setSink(sink: ((event: DeveloperDiagnosticEvent) => void) | undefined): void { this.sink = sink; }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.active) return;
    this.active = enabled;
    this.entries = [];
    this.bytes = 0;
    this.sequence = 0;
    this.discardedEvents = 0;
    this.rateWindow = 0;
    this.rateCount = 0;
    this.sessionId = enabled ? randomUUID() : '';
    this.startedAt = enabled ? new Date().toISOString() : null;
    if (enabled) this.record('main', 'info', 'diagnostics.enabled');
  }

  public record(source: EventSource, level: DeveloperDiagnosticInput['level'], event: string, data: EventData = {}): void {
    if (!this.active) return;
    this.receive(source, { level, event, data });
  }

  public receive(source: EventSource, input: unknown): void {
    if (!this.active) return;
    // Bound event floods before parsing, redacting, serializing, or writing them.
    const now = Date.now();
    if (now - this.rateWindow >= 1_000) { this.rateWindow = now; this.rateCount = 0; }
    if (++this.rateCount > 120) { this.discardedEvents++; return; }
    const parsed = developerDiagnosticInputSchema.safeParse(input);
    if (!parsed.success) { this.discardedEvents++; return; }
    const data: EventData = {};
    for (const [key, value] of Object.entries(parsed.data.data)) {
      if (/password|secret|token|authorization|cookie|credential/i.test(key)) { data[key] = '<redacted>'; continue; }
      data[key] = typeof value === 'string' ? redactDiagnosticText(value) : value;
    }
    const event: DeveloperDiagnosticEvent = {
      ...parsed.data, data, schemaVersion: 1, kind: 'developer-event', sessionId: this.sessionId,
      sequence: ++this.sequence, sampledAt: new Date(now).toISOString(), source,
    };
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (bytes > maximumEventBytes) { this.discardedEvents++; return; }
    this.entries.push({ event, bytes });
    this.bytes += bytes;
    while (this.entries.length > maximumEvents || this.bytes > maximumBytes) {
      this.bytes -= this.entries.shift()!.bytes;
      this.discardedEvents++;
    }
    try { this.sink?.(event); }
    catch { this.discardedEvents++; }
  }

  public snapshot() {
    return {
      enabled: this.active, sessionId: this.sessionId || null, startedAt: this.startedAt,
      discardedEvents: this.discardedEvents,
      limits: 'Latest 2,000 events / 2 MiB; 8 KiB per event; 120 events per second. Discarded events include evictions, rate limits, and invalid records.',
      events: this.entries.map(({ event }) => structuredClone(event)),
    };
  }

  public async trace<T>(source: EventSource, operation: string, action: () => T | Promise<T>): Promise<T> {
    if (!this.active) return action();
    const session = this.sessionId;
    const request = randomUUID();
    const started = performance.now();
    this.record(source, 'debug', 'operation.started', { operation, request });
    try {
      const result = await action();
      if (session === this.sessionId) this.record(source, 'debug', 'operation.completed', {
        operation, request, elapsedMs: performance.now() - started,
      });
      return result;
    } catch (error) {
      if (session === this.sessionId) this.record(source, 'error', 'operation.failed', {
        operation, request, elapsedMs: performance.now() - started,
        error: (error instanceof Error ? error.stack ?? error.message : String(error)).slice(0, 4096),
      });
      throw error;
    }
  }

  public dispose(): void { this.setEnabled(false); this.sink = undefined; }
}

export function redactDiagnosticText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9+/_=.-]+/gi, '<credentials>')
    .replace(/\bBasic\s+[A-Za-z0-9+/]{8,}={0,2}/gi, '<credentials>')
    .replace(/\b(?:password|token|secret|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '<credentials>')
    .replace(/\b(?:https?|wss?):\/\/[^\s<>"']+/gi, '<url>')
    .replace(/\bfile:\/\/[^\r\n<>"']*/gi, '<path>')
    .replace(/(?:[a-z]:[\\/]|\\\\)[^\r\n<>"'|]*/gi, '<path>')
    .replace(/\/(?:home|Users|tmp|var)\/[^\r\n<>"'|]*/g, '<path>')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<email>')
    .slice(0, 4096);
}

export const developerDiagnostics = new DeveloperDiagnosticsCollector();
