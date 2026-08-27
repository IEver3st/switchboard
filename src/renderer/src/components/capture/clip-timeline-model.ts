export const minimumClipDurationMs = 100;

export type TimelineInteraction =
  | 'idle'
  | 'scrubbing'
  | 'dragging-trim-start'
  | 'dragging-trim-end';

export interface TimelineValues {
  currentMs: number;
  startMs: number;
  endMs: number;
  durationMs: number;
}

export function timeFromTimelinePoint(clientX: number, left: number, width: number, durationMs: number): number {
  if (width <= 0 || durationMs <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
  return Math.round(ratio * durationMs);
}

export function applyTimelineInteraction(
  interaction: Exclude<TimelineInteraction, 'idle'>,
  requestedMs: number,
  values: TimelineValues,
): TimelineValues {
  const durationMs = Math.max(0, Math.round(values.durationMs));
  const currentMs = clampMs(values.currentMs, 0, durationMs);
  const startMs = clampMs(values.startMs, 0, Math.max(0, durationMs - minimumClipDurationMs));
  const endMs = clampMs(values.endMs, Math.min(durationMs, startMs + minimumClipDurationMs), durationMs);
  const nextMs = clampMs(requestedMs, 0, durationMs);

  if (interaction === 'scrubbing') {
    return { currentMs: nextMs, startMs, endMs, durationMs };
  }

  if (interaction === 'dragging-trim-start') {
    return {
      currentMs,
      startMs: Math.min(nextMs, endMs - minimumClipDurationMs),
      endMs,
      durationMs,
    };
  }

  return {
    currentMs,
    startMs,
    endMs: Math.max(nextMs, startMs + minimumClipDurationMs),
    durationMs,
  };
}

export function applyTrimKeyboard(
  interaction: 'dragging-trim-start' | 'dragging-trim-end',
  key: string,
  values: TimelineValues,
  stepMs: number,
): TimelineValues | null {
  const activeMs = interaction === 'dragging-trim-start' ? values.startMs : values.endMs;
  let requestedMs: number;

  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      requestedMs = activeMs - stepMs;
      break;
    case 'ArrowRight':
    case 'ArrowUp':
      requestedMs = activeMs + stepMs;
      break;
    case 'PageDown':
      requestedMs = activeMs - stepMs * 10;
      break;
    case 'PageUp':
      requestedMs = activeMs + stepMs * 10;
      break;
    case 'Home':
      requestedMs = interaction === 'dragging-trim-start' ? 0 : values.startMs + minimumClipDurationMs;
      break;
    case 'End':
      requestedMs = interaction === 'dragging-trim-start' ? values.endMs - minimumClipDurationMs : values.durationMs;
      break;
    default:
      return null;
  }

  return applyTimelineInteraction(interaction, requestedMs, values);
}

export function applyPlayheadKeyboard(key: string, values: TimelineValues, stepMs: number): TimelineValues | null {
  let requestedMs: number;
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      requestedMs = values.currentMs - stepMs;
      break;
    case 'ArrowRight':
    case 'ArrowUp':
      requestedMs = values.currentMs + stepMs;
      break;
    case 'PageDown':
      requestedMs = values.currentMs - stepMs * 10;
      break;
    case 'PageUp':
      requestedMs = values.currentMs + stepMs * 10;
      break;
    case 'Home':
      requestedMs = 0;
      break;
    case 'End':
      requestedMs = values.durationMs;
      break;
    default:
      return null;
  }
  return applyTimelineInteraction('scrubbing', requestedMs, values);
}

export function chooseTimelineTickInterval(durationMs: number, width: number): number {
  const candidates = [100, 200, 500, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000];
  const targetTickCount = Math.max(2, Math.floor(width / 74));
  const minimumInterval = Math.max(1, durationMs / targetTickCount);
  return candidates.find((candidate) => candidate >= minimumInterval) ?? candidates.at(-1)!;
}

function clampMs(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
