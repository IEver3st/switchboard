import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Cable, Gamepad2, MessageCircle, Mic2, Music2, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { AudioCapabilities, AudioDependencyState, AudioSupportLevel } from '../../../../shared/contracts';
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
  engineRunning,
  onOpenSettings,
  end,
}: {
  value: AudioWorkspaceTab;
  onChange: (tab: AudioWorkspaceTab) => void;
  tabs?: readonly AudioWorkspaceTab[];
  statusLine: string;
  engineRunning: boolean;
  onOpenSettings: () => void;
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
      <div className="audio-header__top">
        <div className="audio-header__identity">
          <h2>Audio</h2>
          <p aria-live="polite">{statusLine}</p>
        </div>
        <div className="audio-header__engine" data-running={engineRunning}>
          <span className="audio-header__engine-dot" aria-hidden="true" />
          <span>{engineRunning ? 'Audio engine on' : 'Audio engine off'}</span>
          {!engineRunning ? (
            <button type="button" className="audio-header__engine-action" onClick={onOpenSettings}>
              <Cable aria-hidden="true" />
              Audio settings
            </button>
          ) : null}
        </div>
      </div>
      <div className="audio-header__bar">
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
      </div>
    </header>
  );
}

export function audioStatusLine({
  tab,
  engineRunning,
  realtimeMetering,
  routingSupport,
  processingSupport,
  routingBackend,
  setupPhase,
}: {
  tab: AudioWorkspaceTab;
  engineRunning: boolean;
  realtimeMetering: AudioSupportLevel;
  routingSupport: AudioSupportLevel;
  processingSupport: AudioSupportLevel;
  routingBackend?: AudioCapabilities['routingBackend'];
  setupPhase?: AudioDependencyState['phase'];
}) {
  if (setupPhase === 'restart-required') return 'Restart Windows to finish audio driver setup. Your mix is saved.';
  if (!engineRunning) return 'Turn on the audio engine in Settings to hear and adjust live audio. Your mix is saved.';
  if (tab === 'mixer' && routingBackend === 'none') return 'App mixing needs the VB-CABLE driver. Install it in Settings → Audio.';
  if (tab === 'mixer' && (routingSupport === 'unavailable' || processingSupport === 'unavailable')) return 'Audio routing is unavailable. Your mix settings are saved.';
  if (tab === 'mixer' && realtimeMetering !== 'available') return 'Live levels are unavailable. Faders still change the mix.';
  if (tab !== 'mixer' && processingSupport !== 'available') return 'Processing is unavailable for this channel. Changes are saved.';
  return tab === 'mixer' ? "Set each channel's level in the selected mix." : 'Shape this channel with EQ and processing.';
}
