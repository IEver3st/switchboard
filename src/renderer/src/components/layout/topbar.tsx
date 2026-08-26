import { Activity, Bell, ShieldCheck } from 'lucide-react';
import type { PageId, SystemSnapshot } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';
import { formatMb } from '@/lib/format';

const labels: Record<PageId, { title: string; description: string }> = {
  overview: { title: 'Overview', description: 'The parts of your setup that are active right now.' },
  devices: { title: 'Devices', description: 'Capability-driven controls, loaded only for connected hardware.' },
  audio: { title: 'Audio', description: 'Route, mix, and process audio without a monolithic suite.' },
  capture: { title: 'Capture', description: 'A disk-backed replay buffer in its own process.' },
  modules: { title: 'Modules', description: 'Install only the device families and engines you use.' },
  settings: { title: 'Settings', description: 'Lifecycle, diagnostics, and performance budgets.' },
};

export function Topbar({ page, snapshot }: { page: PageId; snapshot: SystemSnapshot }) {
  const copy = labels[page];
  const withinBudget = snapshot.performance.totalMemoryMb <= snapshot.performance.budgetMemoryMb;

  return (
    <header className="flex h-[70px] shrink-0 items-center justify-between border-b border-[var(--border)] px-7">
      <div>
        <h1 className="m-0 text-[20px] font-semibold tracking-[-0.025em] text-[#f4f5f6]">{copy.title}</h1>
        <p className="mt-0.5 text-[12px] text-[#717a86]">{copy.description}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-8 items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[#13161a] px-3 text-[11px] text-[#7f8792]">
          <Activity className="size-3.5" />
          <span className="tabular-nums">{snapshot.performance.totalCpuPercent.toFixed(1)}% CPU</span>
          <span className="text-[#363c45]">/</span>
          <span className="tabular-nums">{formatMb(snapshot.performance.totalMemoryMb)}</span>
        </div>
        <div
          className={cn(
            'flex h-8 items-center gap-2 rounded-[7px] border px-3 text-[11px] font-medium',
            withinBudget
              ? 'border-[#29473c] bg-[#13241e] text-[#75d1ad]'
              : 'border-[#5d3930] bg-[#2b1d18] text-[#e9aa8e]',
          )}
        >
          <ShieldCheck className="size-3.5" />
          {withinBudget ? 'Within budget' : 'Budget exceeded'}
        </div>
        <button type="button" className="grid size-8 place-items-center rounded-[7px] text-[#737c87] hover:bg-[#191c22] hover:text-[#dce0e5]">
          <Bell className="size-[16px]" />
        </button>
      </div>
    </header>
  );
}
