import type { CaptureHostSnapshot, EngineStatus } from '../../shared/contracts';

const defaultTelemetryIntervalMs = 5_000;

function captureTransitionSignature(snapshot: CaptureHostSnapshot): string {
  const { runtime, storage, capabilities, sources } = snapshot;
  return JSON.stringify({
    state: runtime.state,
    sourceId: runtime.activeSource?.id ?? null,
    saveQueueDepth: runtime.saveQueueDepth,
    warning: runtime.warning ?? null,
    error: runtime.error ?? null,
    lastSavedAt: runtime.lastSavedAt ?? null,
    reaction: {
      state: runtime.reactionClipping.state,
      reactionsDetected: runtime.reactionClipping.reactionsDetected,
      lastReactionAt: runtime.reactionClipping.lastReactionAt,
      message: runtime.reactionClipping.message,
    },
    storage: {
      lowSpace: storage.lowSpace,
      criticalSpace: storage.criticalSpace,
      warning: storage.warning ?? null,
    },
    capabilities,
    sources: sources.map((source) => [source.id, source.available]),
  });
}

export class CaptureSnapshotUpdateGate {
  private lastAppliedAt = Number.NEGATIVE_INFINITY;
  private transitionSignature: string | null = null;

  public constructor(private readonly intervalMs = defaultTelemetryIntervalMs) {}

  public shouldApply(snapshot: CaptureHostSnapshot, now = Date.now()): boolean {
    const nextSignature = captureTransitionSignature(snapshot);
    const transitionChanged = nextSignature !== this.transitionSignature;
    if (!transitionChanged && now - this.lastAppliedAt < this.intervalMs) return false;
    this.transitionSignature = nextSignature;
    this.lastAppliedAt = now;
    return true;
  }
}

export function isMaterialEngineStatusChange(previous: EngineStatus | undefined, next: EngineStatus): boolean {
  return !previous
    || previous.state !== next.state
    || previous.pid !== next.pid
    || previous.message !== next.message;
}
