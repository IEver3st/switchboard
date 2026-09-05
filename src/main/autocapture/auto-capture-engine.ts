import type {
  AutoCaptureRuntime,
  AutoCaptureSettings,
  GameEvent,
  GameEventType,
} from '../../shared/contracts';
import { defaultAutoCaptureEventEnabled } from '../../shared/auto-capture';
import {
  addDerivedMultiKill,
  mergeCaptureWindows,
  planCaptureWindow,
  type PendingCaptureWindow,
} from './capture-window-planner';
import { EventDeduplicator } from './event-deduplicator';
import type { AutoCaptureLog } from './provider';

const finalizeSegmentSlackMs = 1_250;
const maximumPendingWindows = 8;
const maximumEventAgeMs = 60_000;
const maximumFutureSkewMs = 5_000;

export type AutoCapturePreserveRequest = PendingCaptureWindow & {
  events: GameEvent[];
};

export type AutoCaptureEventPolicy = {
  enabled: boolean;
  preRollSeconds: number;
  postRollSeconds: number;
  mergeNearbyEvents: boolean;
  mergeThresholdSeconds: number;
};

export type AutoCaptureEngineOptions = {
  getSettings: () => AutoCaptureSettings;
  getMaximumWindowMs: () => number;
  preserve: (request: AutoCapturePreserveRequest) => Promise<void>;
  onRuntime: (runtime: AutoCaptureRuntime) => void;
  log: AutoCaptureLog;
  now?: () => number;
  setTimer?: (listener: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
};

type ScheduledWindow = PendingCaptureWindow & { timer: NodeJS.Timeout | null };

export class AutoCaptureEngine {
  private readonly deduplicator = new EventDeduplicator();
  private readonly pending = new Map<string, ScheduledWindow>();
  private readonly now: () => number;
  private readonly setTimer: (listener: () => void, delayMs: number) => NodeJS.Timeout;
  private readonly clearTimer: (timer: NodeJS.Timeout) => void;
  private activeGameId: string | null = null;
  private activeProviderId: string | null = null;
  private listening = false;
  private providerError: string | null = null;
  private saving = 0;
  private disposed = false;
  private runtime: AutoCaptureRuntime = {
    state: 'disabled',
    activeGameId: null,
    activeProviderId: null,
    pendingCapture: null,
    eventsReceived: 0,
    eventsDeduplicated: 0,
    eventsIgnored: 0,
    clipsCreated: 0,
    lastEvent: null,
    lastError: null,
  };

  public constructor(private readonly options: AutoCaptureEngineOptions) {
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((listener, delayMs) => setTimeout(listener, delayMs));
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.publish();
  }

  public setActiveProvider(gameId: string | null, providerId: string | null, listening: boolean): void {
    if (listening || providerId !== this.activeProviderId) {
      if (this.providerError && this.runtime.lastError === this.providerError) this.runtime.lastError = null;
      this.providerError = null;
    }
    this.activeGameId = gameId;
    this.activeProviderId = providerId;
    this.listening = listening;
    this.publish();
  }

  public setDegraded(message: string): void {
    this.providerError = message;
    this.runtime.lastError = message;
    this.listening = false;
    this.publish('degraded');
  }

  public handleEvent(event: GameEvent, policy?: AutoCaptureEventPolicy): boolean {
    if (this.disposed) return false;
    this.runtime.eventsReceived += 1;
    this.runtime.lastEvent = {
      type: event.type,
      at: event.timestamp,
      ...(event.label ? { label: event.label } : {}),
    };

    const settings = this.options.getSettings();
    const gameSettings = settings.games[event.gameId];
    const now = this.now();
    if (!(policy?.enabled ?? settings.enabled)
      || (!policy && gameSettings?.enabled === false)
      || (!policy && !eventEnabled(event.type, gameSettings?.events))
      || event.timestamp < now - maximumEventAgeMs
      || event.timestamp > now + maximumFutureSkewMs) {
      this.runtime.eventsIgnored += 1;
      this.options.log('event_ignored', { game: event.gameId, provider: event.providerId, type: event.type });
      this.publish();
      return false;
    }

    if (this.deduplicator.isDuplicate(event)) {
      this.runtime.eventsDeduplicated += 1;
      this.options.log('event_deduplicated', { game: event.gameId, provider: event.providerId, type: event.type });
      this.publish();
      return false;
    }

    const maximumWindowMs = Math.max(15_000, this.options.getMaximumWindowMs());
    const requestedPreMs = (policy?.preRollSeconds ?? (gameSettings && !gameSettings.useGlobalTiming
      ? gameSettings.preRollSeconds ?? settings.preRollSeconds
      : settings.preRollSeconds)) * 1_000;
    const requestedPostMs = (policy?.postRollSeconds ?? (gameSettings && !gameSettings.useGlobalTiming
      ? gameSettings.postRollSeconds ?? settings.postRollSeconds
      : settings.postRollSeconds)) * 1_000;
    const postRollMs = Math.min(requestedPostMs, maximumWindowMs);
    const preRollMs = Math.min(requestedPreMs, Math.max(0, maximumWindowMs - postRollMs));
    const next = planCaptureWindow(event, preRollMs, postRollMs);
    const latest = [...this.pending.values()].at(-1);
    const mergeNearbyEvents = policy?.mergeNearbyEvents ?? settings.mergeNearbyEvents;
    const mergeThresholdMs = mergeNearbyEvents
      ? (policy?.mergeThresholdSeconds ?? settings.mergeThresholdSeconds) * 1_000
      : 0;
    const merged = latest && mergeNearbyEvents
      ? mergeCaptureWindows(latest, next, mergeThresholdMs, maximumWindowMs)
      : null;

    if (merged && latest) {
      if (latest.timer) this.clearTimer(latest.timer);
      const scheduled = this.schedule(merged);
      this.pending.set(latest.id, scheduled);
      this.options.log('capture_window_extended', {
        game: event.gameId,
        provider: event.providerId,
        events: scheduled.events.length,
        durationMs: scheduled.endsAt - scheduled.startedAt,
      });
    } else {
      if (this.pending.size >= maximumPendingWindows) {
        this.runtime.eventsIgnored += 1;
        this.runtime.lastError = 'Auto Capture reached its bounded pending-window limit; the newest event was ignored.';
        this.publish('degraded');
        return false;
      }
      this.pending.set(next.id, this.schedule(next));
      this.options.log('capture_window_created', {
        game: event.gameId,
        provider: event.providerId,
        type: event.type,
        durationMs: next.endsAt - next.startedAt,
      });
    }
    this.options.log('event_received', { game: event.gameId, provider: event.providerId, type: event.type, timestamp: event.timestamp });
    this.publish();
    return true;
  }

  public async flush(reason: string): Promise<void> {
    const now = this.now();
    const windows = [...this.pending.values()];
    for (const window of windows) {
      if (window.timer) this.clearTimer(window.timer);
      window.timer = null;
    }
    await Promise.allSettled(windows.map((window) => this.finalize(window.id, Math.min(window.endsAt, now), reason)));
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.flush('shutdown');
    this.disposed = true;
    this.deduplicator.clear();
    this.activeGameId = null;
    this.activeProviderId = null;
    this.listening = false;
    this.publish();
  }

  private schedule(window: PendingCaptureWindow): ScheduledWindow {
    const delayMs = Math.max(0, window.endsAt + finalizeSegmentSlackMs - this.now());
    const timer = this.setTimer(() => { void this.finalize(window.id, window.endsAt, 'stable'); }, delayMs);
    timer.unref?.();
    return { ...window, timer };
  }

  private async finalize(id: string, endsAt: number, reason: string): Promise<void> {
    const window = this.pending.get(id);
    if (!window) return;
    this.pending.delete(id);
    if (window.timer) this.clearTimer(window.timer);
    const boundedEnd = Math.max(window.startedAt + 1, endsAt);
    this.saving += 1;
    this.publish();
    try {
      const events = addDerivedMultiKill(window.events);
      await this.options.preserve({ ...window, endsAt: boundedEnd, events });
      this.runtime.clipsCreated += 1;
      this.runtime.lastError = null;
      this.options.log('clip_saved', {
        game: window.gameId,
        provider: window.providerId,
        events: events.length,
        durationMs: boundedEnd - window.startedAt,
        reason,
      });
    } catch (error) {
      this.runtime.lastError = error instanceof Error ? error.message : String(error);
      this.options.log('clip_save_failed', {
        game: window.gameId,
        provider: window.providerId,
        error: this.runtime.lastError,
      });
    } finally {
      this.saving -= 1;
      this.publish();
    }
  }

  private publish(forcedState?: AutoCaptureRuntime['state']): void {
    const settings = this.options.getSettings();
    const automationEnabled = settings.enabled || settings.reactionClipping.enabled;
    const latest = [...this.pending.values()].at(-1);
    const state = forcedState
      ?? (!automationEnabled || this.disposed
        ? 'disabled'
        : this.saving > 0
          ? 'saving'
          : latest
            ? 'pending'
            : this.providerError
              ? 'degraded'
              : this.listening
                ? 'listening'
                : 'idle');
    this.runtime = {
      ...this.runtime,
      state,
      activeGameId: this.activeGameId,
      activeProviderId: this.activeProviderId,
      pendingCapture: latest ? {
        startedAt: latest.startedAt,
        endsAt: latest.endsAt,
        eventCount: latest.events.length,
      } : null,
    };
    this.options.onRuntime(structuredClone(this.runtime));
  }
}

export function eventEnabled(
  type: GameEventType,
  preferences: Partial<Record<GameEventType, boolean>> | undefined,
): boolean {
  const configured = preferences?.[type];
  if (configured !== undefined) return configured;
  return defaultAutoCaptureEventEnabled(type);
}
