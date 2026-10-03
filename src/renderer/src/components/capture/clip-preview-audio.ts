import type { ClipAudioTrackTrim } from '../../../../shared/contracts';

export function clipPreviewTrackVolume(
  trackLevel: number,
  masterVolume: number,
  muted: boolean,
  currentMs: number,
  trim?: ClipAudioTrackTrim | null,
): number {
  if (muted || trackLevel <= 0) return 0;
  if (trim && (currentMs < trim.startMs || currentMs >= trim.endMs)) return 0;
  const level = Math.min(100, Math.max(0, trackLevel)) / 100;
  return Math.min(1, Math.max(0, masterVolume)) * level;
}

export function clipPreviewNeedsSync(previewSeconds: number, videoSeconds: number): boolean {
  return !Number.isFinite(previewSeconds) || Math.abs(previewSeconds - videoSeconds) > 0.08;
}

// A finished media element restarts from zero when play() is called, so a track
// shorter than the video must stay paused past its end instead of being re-synced.
export function clipPreviewExhausted(durationSeconds: number, targetSeconds: number): boolean {
  return Number.isFinite(durationSeconds) && targetSeconds >= durationSeconds - 0.02;
}
