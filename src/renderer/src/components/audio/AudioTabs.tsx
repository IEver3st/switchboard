import type { KeyboardEvent } from 'react';
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

export function AudioTabs({ value, onChange }: { value: AudioWorkspaceTab; onChange: (tab: AudioWorkspaceTab) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = audioWorkspaceTabs.indexOf(value);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % audioWorkspaceTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + audioWorkspaceTabs.length) % audioWorkspaceTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = audioWorkspaceTabs.length - 1;
    else return;
    event.preventDefault();
    const next = audioWorkspaceTabs[nextIndex];
    if (!next) return;
    onChange(next);
    requestAnimationFrame(() => document.getElementById(`audio-tab-${next}`)?.focus());
  };

  return (
    <div
      role="tablist"
      aria-label="Audio workspace"
      onKeyDown={onKeyDown}
      className="flex min-w-0 overflow-x-auto border-b border-border px-5"
    >
      {audioWorkspaceTabs.map((tab) => (
        <button
          key={tab}
          id={`audio-tab-${tab}`}
          type="button"
          role="tab"
          aria-selected={value === tab}
          aria-controls={`audio-panel-${tab}`}
          tabIndex={value === tab ? 0 : -1}
          onClick={() => onChange(tab)}
          className={cn(
            'relative h-10 shrink-0 border-0 bg-transparent px-4 text-[11px] font-medium text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 motion-reduce:transition-none',
            value === tab && 'text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-primary',
          )}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}
