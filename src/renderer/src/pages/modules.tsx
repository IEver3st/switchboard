import { Box, Boxes, Check, Download, HardDrive, PackageCheck, Puzzle, RefreshCw, ShieldCheck, Usb, type LucideIcon } from 'lucide-react';
import type { ModuleKind, ModuleManifest, SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { SectionHeading, StatusDot, Surface } from '@/components/shared/surface';
import { cn } from '@/lib/cn';
import { formatMb } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

const kindIcon: Record<ModuleKind, LucideIcon> = {
  device: Usb,
  capture: Box,
  audio: Puzzle,
  integration: Boxes,
};

export function ModulesPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setModuleState = useSystemStore((state) => state.setModuleState);
  const actionPending = useSystemStore((state) => state.actionPending);
  const installed = snapshot.modules.filter((module) => module.installed);
  const available = snapshot.modules.filter((module) => !module.installed);
  const diskUsage = installed.reduce((sum, module) => sum + module.sizeMb, 0);

  return (
    <div className="space-y-4 p-6">
      <div className="grid grid-cols-3 gap-4">
        <SummaryMetric icon={PackageCheck} label="Installed" value={`${installed.length}`} detail={`${snapshot.modules.filter((module) => module.enabled).length} enabled`} />
        <SummaryMetric icon={HardDrive} label="Module storage" value={formatMb(diskUsage)} detail="Capture engine is 84 MB" />
        <SummaryMetric icon={ShieldCheck} label="Trust policy" value="Official only" detail="Signed package manifests" />
      </div>

      <Surface className="overflow-hidden">
        <div className="p-5 pb-3">
          <SectionHeading eyebrow="Local" title="Installed modules" description="Only enabled modules may claim devices or start an engine process." action={<Button size="sm" variant="ghost"><RefreshCw className="size-3.5" /> Check updates</Button>} />
        </div>
        <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {installed.map((module) => (
            <ModuleRow
              key={module.id}
              module={module}
              pending={actionPending === `module:${module.id}`}
              onToggle={(enabled) => void setModuleState({ moduleId: module.id, enabled })}
            />
          ))}
        </div>
      </Surface>

      <Surface className="overflow-hidden">
        <div className="p-5 pb-3">
          <SectionHeading eyebrow="Registry" title="Available for this setup" description="The core can offer a module after VID/PID detection without downloading it first." />
        </div>
        <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {available.map((module) => (
            <ModuleRow
              key={module.id}
              module={module}
              pending={actionPending === `module:${module.id}`}
              onToggle={(enabled) => void setModuleState({ moduleId: module.id, enabled })}
            />
          ))}
        </div>
      </Surface>

      <Surface className="flex items-center justify-between gap-8 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-[7px] border border-[#29473c] bg-[#13241e] text-[#67c9a4]"><Check className="size-3.5" /></div>
          <div><div className="text-[11px] font-medium text-[#d7dbe0]">Module boundary is active</div><div className="mt-0.5 text-[9px] text-[#626b76]">Device code does not ship in the core bundle. Realtime engines remain separate processes.</div></div>
        </div>
        <div className="text-[9px] uppercase tracking-[0.12em] text-[#59626d]">SHA-256 · signed manifest · atomic rollback</div>
      </Surface>
    </div>
  );
}

function ModuleRow({ module, pending, onToggle }: { module: ModuleManifest; pending: boolean; onToggle: (enabled: boolean) => void }) {
  const Icon = kindIcon[module.kind];
  return (
    <div className="flex min-h-[78px] items-center gap-4 px-5 py-3">
      <div className={cn('grid size-9 place-items-center rounded-[8px] border', module.enabled ? 'border-[#5c3743] bg-[#24171c] text-[var(--accent)]' : 'border-[var(--border)] bg-[#171a20] text-[#6a7380]')}>
        <Icon className="size-[16px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-[#e1e4e8]">{module.name}</span>
          {module.official ? <span className="rounded-[4px] border border-[#33483f] bg-[#14231e] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#6dbf9f]">Official</span> : <span className="rounded-[4px] border border-[#403b31] bg-[#201e17] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#b5a06c]">Community</span>}
          <StatusDot active={module.enabled} />
        </div>
        <div className="mt-1 max-w-3xl text-[10px] leading-4 text-[#69727d]">{module.description}</div>
        <div className="mt-1.5 flex gap-1.5">
          {module.capabilities.slice(0, 5).map((capability) => <span key={capability} className="text-[8px] uppercase tracking-[0.09em] text-[#4f5863]">{capability.replaceAll('-', ' ')}</span>)}
        </div>
      </div>
      <div className="w-20 text-right"><div className="text-[10px] font-medium tabular-nums text-[#929aa5]">{module.sizeMb < 10 ? `${module.sizeMb.toFixed(1)} MB` : `${Math.round(module.sizeMb)} MB`}</div><div className="mt-1 text-[8px] text-[#505964]">v{module.version}</div></div>
      <div className="w-24 text-right text-[9px] uppercase tracking-[0.1em] text-[#59626d]">{module.kind}</div>
      <Button
        size="sm"
        variant={module.enabled ? 'danger' : module.installed ? 'secondary' : 'primary'}
        disabled={pending}
        onClick={() => onToggle(!module.enabled)}
        className="w-24"
      >
        {!module.installed ? <Download className="size-3.5" /> : null}
        {module.enabled ? 'Disable' : module.installed ? 'Enable' : 'Install'}
      </Button>
    </div>
  );
}

function SummaryMetric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <Surface className="flex items-center gap-4 p-4">
      <div className="grid size-9 place-items-center rounded-[8px] border border-[var(--border)] bg-[#171a20] text-[#747d88]"><Icon className="size-[16px]" /></div>
      <div><div className="text-[9px] uppercase tracking-[0.12em] text-[#59626d]">{label}</div><div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[#e9ebee]">{value}</div><div className="mt-0.5 text-[9px] text-[#606975]">{detail}</div></div>
    </Surface>
  );
}
