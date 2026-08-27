import type { ClipEditorSegment } from './clip-project-model';
import { minimumClipDurationMs } from './clip-timeline-model';

export type MontageTrimEdge = 'start' | 'end';

export function applyMontageSegmentTrim(
  segment: ClipEditorSegment,
  edge: MontageTrimEdge,
  requestedSourceMs: number,
): ClipEditorSegment {
  if (edge === 'start') {
    const trimStartMs = clamp(requestedSourceMs, 0, segment.trimEndMs - minimumClipDurationMs);
    return { ...segment, trimStartMs };
  }
  const trimEndMs = clamp(requestedSourceMs, segment.trimStartMs + minimumClipDurationMs, segment.source.durationMs);
  return { ...segment, trimEndMs };
}

export function trimSourceTimeFromPointerDelta(
  edge: MontageTrimEdge,
  initialSourceMs: number,
  deltaX: number,
  timelineWidth: number,
  montageDurationMs: number,
): number {
  if (timelineWidth <= 0 || montageDurationMs <= 0) return initialSourceMs;
  const deltaMs = Math.round(deltaX / timelineWidth * montageDurationMs);
  return edge === 'start' ? initialSourceMs + deltaMs : initialSourceMs + deltaMs;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
