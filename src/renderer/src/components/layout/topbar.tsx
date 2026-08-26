import { Activity, ShieldCheck } from 'lucide-react';
import type { PageId, SystemSnapshot } from '../../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatMb } from '@/lib/format';

const labels: Record<PageId, { title: string; description: string }> = {
  overview: { title: 'Overview', description: 'The parts of your setup that are active right now.' },
  devices: { title: 'Devices', description: 'Choose a connected device to open its controls.' },
  audio: { title: 'Audio', description: 'Route, mix, and process audio without a monolithic suite.' },
  capture: { title: 'Capture', description: 'A disk-backed replay buffer in its own process.' },
  modules: { title: 'Modules', description: 'Install only the device families and engines you use.' },
  settings: { title: 'Settings', description: 'Lifecycle, diagnostics, and performance budgets.' },
};

export function Topbar({ page, snapshot }: { page: PageId; snapshot: SystemSnapshot }) {
  const copy = labels[page];
  const withinBudget = snapshot.performance.totalMemoryMb <= snapshot.performance.budgetMemoryMb;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-6 border-b border-border px-5">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="m-0 text-sm font-semibold tracking-[-0.01em] text-foreground">{copy.title}</h1>
        <p className="truncate text-xs text-muted-foreground">{copy.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
          <Activity className="size-3.5" />
          {snapshot.performance.totalCpuPercent.toFixed(1)}% CPU
          <Separator orientation="vertical" className="h-3" />
          {formatMb(snapshot.performance.totalMemoryMb)}
        </span>
        <Badge variant={withinBudget ? 'success' : 'warning'}>
          <ShieldCheck className="size-3" />
          {withinBudget ? 'Within budget' : 'Budget exceeded'}
        </Badge>
      </div>
    </header>
  );
}
