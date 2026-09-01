import type { GameEvent } from '../../shared/contracts';

export const defaultEventDedupeWindowMs = 500;
export const maximumDedupeFingerprints = 512;

export class EventDeduplicator {
  private readonly seenAt = new Map<string, number>();

  public constructor(
    private readonly windowMs = defaultEventDedupeWindowMs,
    private readonly maximumEntries = maximumDedupeFingerprints,
  ) {}

  public isDuplicate(event: GameEvent): boolean {
    this.prune(event.timestamp);
    const fingerprint = eventFingerprint(event);
    const previous = this.seenAt.get(fingerprint);
    this.seenAt.delete(fingerprint);
    this.seenAt.set(fingerprint, event.timestamp);
    return previous !== undefined && Math.abs(event.timestamp - previous) <= this.windowMs;
  }

  public clear(): void {
    this.seenAt.clear();
  }

  private prune(now: number): void {
    const cutoff = now - Math.max(this.windowMs * 4, 2_000);
    for (const [fingerprint, timestamp] of this.seenAt) {
      if (timestamp >= cutoff && this.seenAt.size <= this.maximumEntries) break;
      this.seenAt.delete(fingerprint);
    }
  }
}

export function eventFingerprint(event: GameEvent): string {
  return [
    event.providerId,
    event.gameId,
    event.type,
    stableMetadata(event.metadata),
  ].join('|');
}

function stableMetadata(metadata: GameEvent['metadata']): string {
  if (!metadata) return '';
  return Object.entries(metadata)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join(',');
}
