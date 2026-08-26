import {
  AudioLines,
  Boxes,
  CircleGauge,
  Cpu,
  Disc3,
  MonitorDot,
  Settings2,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { PageId, SystemSnapshot } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';
import { StatusDot } from '@/components/shared/surface';

const navigation: Array<{ id: PageId; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Overview', icon: CircleGauge },
  { id: 'devices', label: 'Devices', icon: SlidersHorizontal },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'capture', label: 'Capture', icon: Disc3 },
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
  const audio = snapshot.engines.find((engine) => engine.kind === 'audio');
  const capture = snapshot.engines.find((engine) => engine.kind === 'capture');

  return (
    <aside className="flex w-[214px] shrink-0 flex-col border-r border-[var(--border)] bg-[#101216] px-3 py-3">
      <nav className="space-y-1">
        {navigation.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          const count = id === 'devices' ? snapshot.devices.filter((device) => device.connected).length : id === 'modules' ? snapshot.modules.filter((module) => module.enabled).length : undefined;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={cn(
                'flex h-9 w-full items-center gap-3 rounded-[7px] px-3 text-left text-[13px] font-medium transition-colors',
                active
                  ? 'bg-[#1c2027] text-[#f4f5f6] shadow-[inset_2px_0_0_var(--accent)]'
                  : 'text-[#8f97a3] hover:bg-[#171a20] hover:text-[#d9dde2]',
              )}
            >
              <Icon className={cn('size-[16px]', active && 'text-[var(--accent)]')} strokeWidth={1.8} />
              <span className="flex-1">{label}</span>
              {typeof count === 'number' ? <span className="text-[11px] tabular-nums text-[#646c77]">{count}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-[var(--border)] pt-4">
        <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#555d68]">Runtime</div>
        <div className="mt-3 space-y-2 px-3">
          <RuntimeRow label="Audio host" running={audio?.state === 'running'} memory={audio?.memoryMb ?? 0} />
          <RuntimeRow label="Capture host" running={capture?.state === 'running'} memory={capture?.memoryMb ?? 0} />
        </div>
      </div>

      <div className="mt-auto space-y-2">
        <div className="rounded-[8px] border border-[var(--border)] bg-[#13161b] p-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-[#a7aeb8]">
            <Cpu className="size-3.5 text-[#747d89]" />
            Performance guard
          </div>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-[19px] font-semibold tracking-[-0.04em] text-[#eef0f2]">{Math.round(snapshot.performance.totalMemoryMb)}</span>
            <span className="pb-0.5 text-[10px] text-[#646d79]">MB total</span>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-[#282d35]">
            <div
              className="h-full bg-[var(--success)] transition-[width]"
              style={{ width: `${Math.min(100, (snapshot.performance.totalMemoryMb / snapshot.performance.budgetMemoryMb) * 100)}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-[7px] px-3 text-[13px] font-medium transition-colors',
            page === 'settings' ? 'bg-[#1c2027] text-white' : 'text-[#8f97a3] hover:bg-[#171a20] hover:text-[#d9dde2]',
          )}
        >
          <Settings2 className="size-[16px]" strokeWidth={1.8} />
          Settings
        </button>
      </div>
    </aside>
  );
}

function RuntimeRow({ label, running, memory }: { label: string; running: boolean; memory: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <StatusDot active={running} />
      <span className="flex-1 text-[#7f8793]">{label}</span>
      <span className="tabular-nums text-[#555d68]">{running ? `${Math.round(memory)} MB` : 'off'}</span>
    </div>
  );
}
