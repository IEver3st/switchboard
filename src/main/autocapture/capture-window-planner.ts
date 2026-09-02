import { randomUUID } from 'node:crypto';
import type { ClipEventMarker, GameEvent } from '../../shared/contracts';

export type PendingCaptureWindow = {
  id: string;
  gameId: string;
  providerId: string;
  startedAt: number;
  endsAt: number;
  events: GameEvent[];
};

export function planCaptureWindow(
  event: GameEvent,
  preRollMs: number,
  postRollMs: number,
): PendingCaptureWindow {
  return {
    id: randomUUID(),
    gameId: event.gameId,
    providerId: event.providerId,
    startedAt: Math.max(0, event.timestamp - Math.max(0, preRollMs)),
    endsAt: event.timestamp + Math.max(0, postRollMs),
    events: [event],
  };
}

export function mergeCaptureWindows(
  current: PendingCaptureWindow,
  next: PendingCaptureWindow,
  mergeThresholdMs: number,
  maximumDurationMs: number,
): PendingCaptureWindow | null {
  if (current.gameId !== next.gameId || current.providerId !== next.providerId) return null;
  if (next.startedAt > current.endsAt + Math.max(0, mergeThresholdMs)) return null;
  const startedAt = Math.min(current.startedAt, next.startedAt);
  const endsAt = Math.max(current.endsAt, next.endsAt);
  if (endsAt - startedAt > maximumDurationMs) return null;
  return {
    ...current,
    startedAt,
    endsAt,
    events: [...current.events, ...next.events].slice(0, 128),
  };
}

export function addDerivedMultiKill(events: readonly GameEvent[]): GameEvent[] {
  const output = [...events];
  if (events.some((event) => event.type === 'multi_kill')) return output;
  const kills = events.filter((event) => event.type === 'kill' || event.type === 'headshot');
  if (kills.length < 2) return output;
  const last = kills.at(-1)!;
  output.push({
    id: `${last.id}:derived-multi-${kills.length}`,
    gameId: last.gameId,
    providerId: last.providerId,
    type: 'multi_kill',
    timestamp: last.timestamp,
    confidence: last.confidence,
    label: `${kills.length} Kills`,
    metadata: { count: Math.min(20, kills.length), derived: true },
    source: last.source,
  });
  return output;
}

export function markersForClip(events: readonly GameEvent[], clipStartedAt: number, durationMs: number): ClipEventMarker[] {
  return events
    .map((event) => ({
      id: event.id,
      type: event.type,
      timestampMs: Math.min(durationMs, Math.max(0, Math.round(event.timestamp - clipStartedAt))),
      ...(event.label ? { label: event.label } : {}),
      ...(event.metadata ? { metadata: event.metadata } : {}),
    }))
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .slice(0, 128);
}

export function autoCaptureTitle(game: string, events: readonly GameEvent[]): string {
  const nativeOrDerivedMulti = events.filter((event) => event.type === 'multi_kill').at(-1);
  const kills = events.filter((event) => event.type === 'kill' || event.type === 'headshot').length;
  if (nativeOrDerivedMulti?.label) return `${game} - ${nativeOrDerivedMulti.label}`;
  if (kills > 1) return `${game} - ${kills} Kills`;
  const priority = ['match_win', 'round_win', 'headshot', 'kill', 'objective', 'assist', 'knockdown', 'death'] as const;
  const highlight = priority.map((type) => events.find((event) => event.type === type)).find(Boolean) ?? events[0];
  return `${game} - ${highlight?.label ?? eventTypeLabel(highlight?.type ?? 'highlight')}`;
}

export function eventTypeLabel(type: GameEvent['type']): string {
  const labels: Record<GameEvent['type'], string> = {
    kill: 'Kill',
    headshot: 'Headshot',
    multi_kill: 'Multi-kill',
    assist: 'Assist',
    knockdown: 'Knockdown',
    death: 'Death',
    round_win: 'Round Win',
    round_loss: 'Round Loss',
    match_win: 'Match Win',
    match_loss: 'Match Loss',
    objective: 'Objective',
    achievement: 'Achievement',
    highlight: 'Highlight',
    custom: 'Highlight',
  };
  return labels[type];
}
