import {
  AudioLines,
  Boxes,
  Disc3,
  Settings2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { PageId, SystemSnapshot } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';

const navigation: Array<{ id: PageId; label: string; icon: LucideIcon; engine?: 'audio' | 'capture' }> = [
  { id: 'devices', label: 'Devices', icon: SlidersHorizontal },
  { id: 'audio', label: 'Audio', icon: AudioLines, engine: 'audio' },
  { id: 'capture', label: 'Capture', icon: Disc3, engine: 'capture' },
  { id: 'modules', label: 'Modules', icon: Boxes },
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
    <aside className="flex w-16 shrink-0 flex-col items-center border-r border-border bg-card py-2">
      <nav aria-label="Primary" className="flex w-full flex-col items-center gap-0.5 px-2">
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
                'relative flex h-13 w-full flex-col items-center justify-center gap-1 rounded-md transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {active ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" /> : null}
              <span className="relative">
                <Icon className={cn('size-[17px]', active && 'text-primary')} strokeWidth={1.8} />
                {typeof running === 'boolean' ? (
                  <span
                    className={cn(
                      'absolute -right-1 -top-1 size-[6px] rounded-full ring-2 ring-card',
                      running ? 'bg-success' : 'bg-[#4e5560]',
                    )}
                  />
                ) : null}
              </span>
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center px-2">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          aria-current={page === 'settings' ? 'page' : undefined}
          className={cn(
            'relative flex h-13 w-full flex-col items-center justify-center gap-1 rounded-md transition-colors',
            page === 'settings' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {page === 'settings' ? <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" /> : null}
          <Settings2 className={cn('size-[17px]', page === 'settings' && 'text-primary')} strokeWidth={1.8} />
          <span className="text-[9px] font-medium leading-none">Settings</span>
        </button>
      </div>
    </aside>
  );
}
