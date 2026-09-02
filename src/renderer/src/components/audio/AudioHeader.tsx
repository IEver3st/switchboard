import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Cable, Gamepad2, MessageCircle, Mic2, Music2, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { AudioSupportLevel } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';

export const audioWorkspaceTabs = ['mixer', 'game', 'chat', 'media', 'microphone'] as const;
export type AudioWorkspaceTab = (typeof audioWorkspaceTabs)[number];

const tabLabels: Record<AudioWorkspaceTab, string> = {
  mixer: 'Mixer',
  game: 'Game',
  chat: 'Chat',
  media: 'Media',
  microphone: 'Microphone',
};

const tabIcons: Record<AudioWorkspaceTab, LucideIcon> = {
  mixer: SlidersHorizontal,
  game: Gamepad2,
  chat: MessageCircle,
  media: Music2,
  microphone: Mic2,
};

const tabColors: Record<AudioWorkspaceTab, string> = {
  mixer: 'var(--accent-brand)',
  game: 'var(--channel-game)',
  chat: 'var(--channel-chat)',
  media: 'var(--channel-media)',
  microphone: 'var(--channel-microphone)',
};

export function AudioHeader({
  value,
  onChange,
  tabs = audioWorkspaceTabs,
  statusLine,
  end,
}: {
  value: AudioWorkspaceTab;
  onChange: (tab: AudioWorkspaceTab) => void;
  tabs?: readonly AudioWorkspaceTab[];
  statusLine: string;
  end?: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const currentIndex = tabs.indexOf(value);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    onChange(next);
    requestAnimationFrame(() => document.getElementById(`audio-tab-${next}`)?.focus());
  };

  return (
    <header className="audio-header">
      <div className="audio-header__identity">
        <h2>Audio</h2>
        <p aria-live="polite">{statusLine}</p>
      </div>
      <nav
        role="tablist"
        aria-label="Audio workspace"
        className="audio-header__tabs"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const Icon = tabIcons[tab];
          const selected = value === tab;
          return (
            <button
              key={tab}
              id={`audio-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`audio-panel-${tab}`}
              data-audio-tab={tab}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab)}
              className={cn('audio-header__tab', selected && 'is-active')}
              style={{ '--tab-color': tabColors[tab] } as CSSProperties}
            >
              <Icon aria-hidden="true" />
              {tabLabels[tab]}
            </button>
          );
        })}
      </nav>
      <div className="audio-header__end">{end}</div>
    </header>
  );
}

export function audioStatusLine({
  tab,
  engineRunning,
  realtimeMetering,
  routingSupport,
}: {
  tab: AudioWorkspaceTab;
  engineRunning: boolean;
  realtimeMetering: AudioSupportLevel;
  routingSupport: AudioSupportLevel;
}) {
  if (!engineRunning) return 'Audio engine off — turn on in Settings';
  if (tab === 'mixer' && realtimeMetering !== 'available') return 'Live levels unavailable';
  if (tab === 'mixer' && routingSupport === 'unavailable') return 'App routing unavailable';
  return tab === 'mixer' ? 'Personal mix · Live levels' : 'Live processing controls';
}
