import type { AudioHostSnapshot, CaptureHostSnapshot, EngineStatus } from '../../shared/contracts';

const defaultTelemetryIntervalMs = 5_000;
const defaultAudioDiagnosticsIntervalMs = 30_000;

function audioTransitionSignature(snapshot: AudioHostSnapshot): string {
  const {
    localSnrDb: _localSnrDb,
    p50Ms: _p50Ms,
    p95Ms: _p95Ms,
    p99Ms: _p99Ms,
    maximumMs: _maximumMs,
    captureCallbackP99Ms: _captureCallbackP99Ms,
    ...diagnosticState
  } = snapshot.noiseSuppression;
  return JSON.stringify({ ...snapshot, noiseSuppression: diagnosticState });
}

export class AudioSnapshotUpdateGate {
  private lastAppliedAt = Number.NEGATIVE_INFINITY;
  private transitionSignature: string | null = null;

  public constructor(private readonly intervalMs = defaultAudioDiagnosticsIntervalMs) {}

  public shouldApply(snapshot: AudioHostSnapshot, now = Date.now()): boolean {
    const nextSignature = audioTransitionSignature(snapshot);
    const transitionChanged = nextSignature !== this.transitionSignature;
    if (!transitionChanged && now - this.lastAppliedAt < this.intervalMs) return false;
    this.transitionSignature = nextSignature;
    this.lastAppliedAt = now;
    return true;
  }
}

export class AudioMeterDemandGate {
  private rendererActive = true;
  private rendererRequested = false;

  public get enabled(): boolean {
    return this.rendererActive && this.rendererRequested;
  }

  public setRendererActive(active: boolean): boolean {
    const before = this.enabled;
    this.rendererActive = active;
    return before !== this.enabled;
  }

  public setRendererRequested(requested: boolean): boolean {
    const before = this.enabled;
    this.rendererRequested = requested;
    return before !== this.enabled;
  }
}

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
