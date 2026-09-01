import type { AutoCaptureProvider, Clip, GameEventType } from './contracts';

export const defaultAutoCaptureEventPreferences: Readonly<Record<GameEventType, boolean>> = {
  kill: true,
  headshot: true,
  multi_kill: true,
  assist: true,
  death: false,
  round_win: true,
  round_loss: false,
  match_win: true,
  match_loss: false,
  objective: true,
  achievement: true,
  highlight: true,
  custom: false,
};

export function defaultAutoCaptureEventEnabled(type: GameEventType): boolean {
  return defaultAutoCaptureEventPreferences[type];
}

export function gameEventTypeLabel(type: GameEventType): string {
  const labels: Record<GameEventType, string> = {
    kill: 'Kills',
    headshot: 'Headshots',
    multi_kill: 'Multi-kills',
    assist: 'Assists',
    death: 'Deaths',
    round_win: 'Round wins',
    round_loss: 'Round losses',
    match_win: 'Match wins',
    match_loss: 'Match losses',
    objective: 'Objective events',
    achievement: 'Achievements',
    highlight: 'Highlights',
    custom: 'Custom events',
  };
  return labels[type];
}

export function providerCapabilitySummary(provider: Pick<AutoCaptureProvider, 'capabilities'>): string {
  return provider.capabilities.events.map(gameEventTypeLabel).join(', ');
}

export function autoCaptureClipSummary(clip: Pick<Clip, 'autoCapture'>): string | null {
  const events = clip.autoCapture?.events ?? [];
  if (events.length === 0) return null;
  const multi = events.filter((event) => event.type === 'multi_kill').at(-1);
  if (multi?.label) return multi.label;
  const kills = events.filter((event) => event.type === 'kill' || event.type === 'headshot').length;
  if (kills > 1) return `${kills} Kills`;
  const marker = events[0];
  return marker?.label ?? (marker ? singularEventLabel(marker.type) : null);
}

export function singularEventLabel(type: GameEventType): string {
  const plural = gameEventTypeLabel(type);
  const singular: Partial<Record<GameEventType, string>> = {
    kill: 'Kill',
    headshot: 'Headshot',
    multi_kill: 'Multi-kill',
    assist: 'Assist',
    death: 'Death',
    round_win: 'Round Win',
    round_loss: 'Round Loss',
    match_win: 'Match Win',
    match_loss: 'Match Loss',
    objective: 'Objective',
    achievement: 'Achievement',
    highlight: 'Highlight',
    custom: 'Custom Event',
  };
  return singular[type] ?? plural;
}
