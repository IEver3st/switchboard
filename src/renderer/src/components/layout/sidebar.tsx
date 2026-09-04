import {
  AudioWaveform,
  Cable,
  CircleDot,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { PageId, SystemSnapshot } from '../../../../shared/contracts';
import { visiblePagesForProfile } from '../../../../shared/workspace-profile';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

const navigation: Array<{ id: PageId; label: string; icon: LucideIcon; engine?: 'audio' | 'capture' }> = [
  { id: 'devices', label: 'Devices', icon: Cable },
  { id: 'audio', label: 'Audio', icon: AudioWaveform, engine: 'audio' },
  { id: 'capture', label: 'Capture', icon: CircleDot, engine: 'capture' },
];

export function Sidebar({
  snapshot,
  page,
  onNavigate,
  onNavigateIntent,
}: {
  snapshot: SystemSnapshot;
  page: PageId;
  onNavigate: (page: PageId) => void;
  onNavigateIntent?: (page: PageId) => void;
}) {
  const visible = new Set<PageId>(visiblePagesForProfile(snapshot.settings));
  const visibleNavigation = navigation.filter(({ id }) => visible.has(id));
  return (
    <aside className="switchboard-sidebar flex w-[72px] shrink-0 flex-col items-center bg-chrome py-2">
      <div className="app-drag flex h-[46px] w-full shrink-0 items-center justify-center">
        <img src="./switchboard-mark.png" alt="" className="size-10 object-contain opacity-90" draggable={false} />
      </div>
      <nav aria-label="Primary" className="mt-3 flex w-full flex-col items-center gap-1 px-2">
        {visibleNavigation.map(({ id, label, icon: Icon, engine }) => {
          const active = page === id;
          const running = engine ? snapshot.engines.find((candidate) => candidate.kind === engine)?.state === 'running' : undefined;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              onPointerEnter={() => onNavigateIntent?.(id)}
              onFocus={() => onNavigateIntent?.(id)}
              aria-current={active ? 'page' : undefined}
              data-active={active || undefined}
              className="switchboard-sidebar__item no-drag"
            >
              <span className="switchboard-sidebar__icon">
                <Icon aria-hidden="true" strokeWidth={active ? 2 : 1.65} />
                {typeof running === 'boolean' ? (
                  <span
                    className={cn(
                      'switchboard-sidebar__engine-state',
                      running ? 'bg-success' : 'bg-status-neutral',
                    )}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span className="switchboard-sidebar__label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center px-2 pb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              onPointerEnter={() => onNavigateIntent?.('settings')}
              onFocus={() => onNavigateIntent?.('settings')}
              aria-label="Settings"
              aria-current={page === 'settings' || page === 'modules' ? 'page' : undefined}
              className="switchboard-sidebar__settings no-drag"
            >
              <Settings aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
