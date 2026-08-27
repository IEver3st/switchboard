import { Cable, Gamepad2, MessageCircle, Mic2, Music2, type LucideIcon } from 'lucide-react';
import type { AudioBusId, ClipAudioChannel } from '../../../../shared/contracts';

export type MixerChannelId = AudioBusId;
export type ColorCodedAudioChannel = AudioBusId | ClipAudioChannel;

export const mixerChannelOrder: MixerChannelId[] = ['game', 'chat', 'media', 'aux', 'mic'];

export const channelIcons: Record<MixerChannelId, LucideIcon> = {
  game: Gamepad2,
  chat: MessageCircle,
  media: Music2,
  aux: Cable,
  mic: Mic2,
};

export const channelColors: Record<ColorCodedAudioChannel, string> = {
  game: 'var(--channel-game)',
  chat: 'var(--channel-chat)',
  media: 'var(--channel-media)',
  mic: 'var(--channel-microphone)',
  microphone: 'var(--channel-microphone)',
  aux: 'var(--text-muted)',
};

export function channelColorVar(channel: MixerChannelId): { '--channel-color': string } {
  return { '--channel-color': channelColors[channel] } as { '--channel-color': string };
}

export function channelColor(channel: ColorCodedAudioChannel): string {
  return channelColors[channel];
}
