import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const audioWorkspaceTabs = ['mixer', 'game', 'chat', 'media', 'microphone'] as const;
export type AudioWorkspaceTab = (typeof audioWorkspaceTabs)[number];

const labels: Record<AudioWorkspaceTab, string> = {
  mixer: 'Mixer',
  game: 'Game',
  chat: 'Chat',
  media: 'Media',
  microphone: 'Microphone',
};

export function AudioTabs({ value, onChange, tools, tabs = audioWorkspaceTabs }: {
  value: AudioWorkspaceTab;
  onChange: (tab: AudioWorkspaceTab) => void;
  tools?: ReactNode;
  tabs?: readonly AudioWorkspaceTab[];
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
    <div className="audio-tabs">
      <div className="audio-tabs__row">
        <div
          role="tablist"
          aria-label="Audio workspace"
          onKeyDown={onKeyDown}
          className="audio-tabs__inner"
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              id={`audio-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={value === tab}
              aria-controls={`audio-panel-${tab}`}
              data-audio-tab={tab}
              tabIndex={value === tab ? 0 : -1}
              onClick={() => onChange(tab)}
              className={cn('audio-tabs__tab', value === tab && 'is-active')}
            >
              {labels[tab]}
            </button>
          ))}
        </div>
        {tools ? <div className="audio-tabs__tools">{tools}</div> : null}
      </div>
    </div>
  );
}
