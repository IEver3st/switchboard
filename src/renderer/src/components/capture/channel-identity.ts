import type { ClipAudioChannel } from '../../../../shared/contracts';

export const channelColors: Record<ClipAudioChannel, string> = {
  game: 'var(--channel-game)',
  chat: 'var(--channel-chat)',
  media: 'var(--channel-media)',
  microphone: 'var(--channel-microphone)',
};

/** Tracks without a recorded role keep a neutral color. */
export function channelColor(channel: ClipAudioChannel | undefined): string {
  return channel ? channelColors[channel] : 'var(--text-muted)';
}
