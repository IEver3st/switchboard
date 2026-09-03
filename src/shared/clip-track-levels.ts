import type { ClipAudioChannel, DefaultClipTrackLevels } from './contracts';

export const CLIP_TRACK_CHANNELS: readonly ClipAudioChannel[] = ['game', 'chat', 'microphone', 'media'];

export function isClipAudioChannel(value: unknown): value is ClipAudioChannel {
  return value === 'game' || value === 'chat' || value === 'microphone' || value === 'media';
}

export function defaultClipTrackLevelForChannel(
  channel: ClipAudioChannel | null | undefined,
  defaults: DefaultClipTrackLevels | null | undefined,
): number {
  if (!channel || !defaults) return 100;
  const level = defaults[channel];
  return Number.isInteger(level) && level >= 0 && level <= 100 ? level : 100;
}

export function resolveClipTrackLevel(
  levels: readonly number[] | undefined,
  trackIndex: number,
  channel: ClipAudioChannel | null | undefined,
  defaults: DefaultClipTrackLevels | null | undefined,
): number {
  const explicit = levels?.[trackIndex];
  if (typeof explicit === 'number' && Number.isInteger(explicit)) {
    return Math.min(100, Math.max(0, explicit));
  }
  return defaultClipTrackLevelForChannel(channel, defaults);
}

export function channelForClipTrack(
  channels: readonly (ClipAudioChannel | null | undefined)[] | undefined,
  trackIndex: number,
): ClipAudioChannel | undefined {
  const channel = channels?.[trackIndex];
  return channel && isClipAudioChannel(channel) ? channel : undefined;
}

/**
 * Store a per-clip track level while treating the configured defaults as
 * "unset". Missing intermediate tracks are filled with their channel default
 * so touching one fader never resets an untouched track to 100, and trailing
 * tracks that match their default are trimmed to keep new clips inheriting
 * future default changes.
 */
export function applyClipTrackLevel(
  levels: readonly number[] | undefined,
  channels: readonly (ClipAudioChannel | null | undefined)[] | undefined,
  defaults: DefaultClipTrackLevels | null | undefined,
  trackIndex: number,
  level: number,
): number[] {
  const next = [...(levels ?? [])];
  while (next.length <= trackIndex) {
    const fillIndex = next.length;
    next.push(defaultClipTrackLevelForChannel(channelForClipTrack(channels, fillIndex), defaults));
  }
  next[trackIndex] = Math.min(100, Math.max(0, Math.round(level)));
  while (next.length > 0) {
    const lastIndex = next.length - 1;
    const lastDefault = defaultClipTrackLevelForChannel(channelForClipTrack(channels, lastIndex), defaults);
    if (next[lastIndex] !== lastDefault) break;
    next.pop();
  }
  return next;
}

export function normalizeClipTrackLevels(
  levels: readonly number[] | undefined,
  channels: readonly (ClipAudioChannel | null | undefined)[] | undefined,
  defaults: DefaultClipTrackLevels | null | undefined,
): number[] | undefined {
  const next = [...(levels ?? [])];
  while (next.length > 0) {
    const lastIndex = next.length - 1;
    const lastDefault = defaultClipTrackLevelForChannel(channelForClipTrack(channels, lastIndex), defaults);
    if (next[lastIndex] !== lastDefault) break;
    next.pop();
  }
  return next.length > 0 ? next : undefined;
}

/** Expand sparse per-clip levels into effective levels for every known channel. */
export function effectiveClipTrackLevels(
  levels: readonly number[] | undefined,
  channels: readonly (ClipAudioChannel | null | undefined)[] | undefined,
  defaults: DefaultClipTrackLevels | null | undefined,
): number[] {
  const length = Math.max(levels?.length ?? 0, channels?.length ?? 0);
  return Array.from({ length }, (_, trackIndex) =>
    resolveClipTrackLevel(levels, trackIndex, channelForClipTrack(channels, trackIndex), defaults));
}

/** True when the effective mix differs from a flat 100% mix (or trims exist). */
export function hasEffectiveClipMixChanged(
  levels: readonly number[] | undefined,
  channels: readonly (ClipAudioChannel | null | undefined)[] | undefined,
  defaults: DefaultClipTrackLevels | null | undefined,
): boolean {
  return effectiveClipTrackLevels(levels, channels, defaults).some((level) => level !== 100);
}
