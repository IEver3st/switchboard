import {
  AudioLines,
  Disc3,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { PageId, SystemSnapshot } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';

const navigation: Array<{ id: PageId; label: string; icon: LucideIcon; engine?: 'audio' | 'capture' }> = [
  { id: 'devices', label: 'Devices', icon: SlidersHorizontal },
  { id: 'audio', label: 'Audio', icon: AudioLines, engine: 'audio' },
  { id: 'capture', label: 'Capture', icon: Disc3, engine: 'capture' },
];

export function Sidebar({
  snapshot,
  page,
  onNavigate,
}: {
  snapshot: SystemSnapshot;
  page: PageId;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <aside className="flex w-[68px] shrink-0 flex-col items-center bg-chrome py-2">
      <div className="app-drag flex h-[38px] w-full shrink-0 items-center justify-center">
        <img src="./switchboard-mark.png" alt="" className="size-[22px] object-contain opacity-90" draggable={false} />
      </div>
      <nav aria-label="Primary" className="mt-8 flex w-full flex-col items-center gap-1.5 px-1.5">
        {navigation.map(({ id, label, icon: Icon, engine }) => {
          const active = page === id;
          const running = engine ? snapshot.engines.find((candidate) => candidate.kind === engine)?.state === 'running' : undefined;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-[56px] w-full flex-col items-center justify-center gap-1 rounded-[6px] transition-colors duration-150 no-drag',
                active ? 'bg-surface-interactive text-foreground' : 'text-text-secondary hover:bg-surface-interactive hover:text-foreground',
              )}
            >
              {active ? <span className="absolute left-0 top-1/2 h-[18px] w-0.5 -translate-y-1/2 rounded-full bg-primary" /> : null}
              <span className="relative">
                <Icon className={cn('size-[20px] text-text-muted', active && 'text-foreground')} strokeWidth={1.75} />
                {typeof running === 'boolean' ? (
                  <span
                    className={cn(
                      'absolute -right-1 -top-1 size-[6px] rounded-full ring-2 ring-background',
                      running ? 'bg-success' : 'bg-status-neutral',
                    )}
                  />
                ) : null}
              </span>
              <span className="text-[10px] font-medium leading-none tracking-[-0.01em]">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center px-1.5 pb-1">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          aria-label="Settings"
          aria-current={page === 'settings' || page === 'modules' ? 'page' : undefined}
          title="Settings"
          className={cn(
            'relative grid size-9 place-items-center rounded-[6px] transition-colors duration-150 no-drag',
            page === 'settings' || page === 'modules' ? 'bg-surface-interactive text-foreground' : 'text-text-muted hover:bg-surface-interactive hover:text-foreground',
          )}
        >
          {page === 'settings' || page === 'modules' ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" /> : null}
          <Settings className={cn('size-[18px]', (page === 'settings' || page === 'modules') && 'text-foreground')} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
}
