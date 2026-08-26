import { Box, Boxes, Download, Puzzle, RefreshCw, ShieldCheck, Usb, type LucideIcon } from 'lucide-react';
import type { ModuleKind, ModuleManifest, SystemSnapshot } from '../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { StatusDot, Surface } from '@/components/shared/surface';
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
    <div className="flex flex-1 flex-col gap-4 p-5">
      <Surface className="flex items-center gap-6 px-5 py-3.5">
        <SummaryStat label="Installed" value={`${installed.length}`} detail={`${snapshot.modules.filter((module) => module.enabled).length} enabled`} />
        <Separator orientation="vertical" className="h-8" />
        <SummaryStat label="Module storage" value={formatMb(diskUsage)} detail="Capture engine is 84 MB" />
        <Separator orientation="vertical" className="h-8" />
        <SummaryStat label="Trust policy" value="Official only" detail="Signed package manifests" />
        <div className="ml-auto">
          <Button size="sm" variant="ghost"><RefreshCw className="size-3.5" /> Check updates</Button>
        </div>
      </Surface>

      <Surface className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="m-0 text-sm font-semibold text-foreground">Installed modules</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Only enabled modules may claim devices or start an engine process.</p>
          </div>
        </div>
        <div className="divide-y divide-border">
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
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="m-0 text-sm font-semibold text-foreground">Available for this setup</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">The core can offer a module after VID/PID detection without downloading it first.</p>
        </div>
        <div className="divide-y divide-border">
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

      <div className="flex items-center gap-2.5 px-1 text-[10px] text-muted-foreground/80">
        <ShieldCheck className="size-3.5 text-success" />
        <span>Device code does not ship in the core bundle. Realtime engines remain separate processes.</span>
        <span className="ml-auto uppercase tracking-[0.12em]">SHA-256 · signed manifest · atomic rollback</span>
      </div>
    </div>
  );
}

function ModuleRow({ module, pending, onToggle }: { module: ModuleManifest; pending: boolean; onToggle: (enabled: boolean) => void }) {
  const Icon = kindIcon[module.kind];
  return (
    <div className="flex min-h-[68px] items-center gap-4 px-5 py-3">
      <div className={cn('grid size-9 shrink-0 place-items-center rounded-md border', module.enabled ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground')}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-foreground">{module.name}</span>
          <Badge variant={module.official ? 'success' : 'warning'}>{module.official ? 'Official' : 'Community'}</Badge>
          <StatusDot active={module.enabled} />
        </div>
        <div className="mt-0.5 max-w-3xl truncate text-[11px] text-muted-foreground">{module.description}</div>
      </div>
      <div className="hidden w-40 shrink-0 gap-1.5 lg:flex">
        {module.capabilities.slice(0, 3).map((capability) => (
          <span key={capability} className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{capability.replaceAll('-', ' ')}</span>
        ))}
      </div>
      <div className="w-20 shrink-0 text-right">
        <div className="text-[11px] font-medium tabular-nums text-foreground">{module.sizeMb < 10 ? `${module.sizeMb.toFixed(1)} MB` : `${Math.round(module.sizeMb)} MB`}</div>
        <div className="mt-0.5 text-[9px] text-muted-foreground/70">v{module.version}</div>
      </div>
      <Button
        size="sm"
        variant={module.enabled ? 'danger' : module.installed ? 'secondary' : 'primary'}
        disabled={pending}
        onClick={() => onToggle(!module.enabled)}
        className="w-24 shrink-0"
      >
        {!module.installed ? <Download className="size-3.5" /> : null}
        {module.enabled ? 'Disable' : module.installed ? 'Enable' : 'Install'}
      </Button>
    </div>
  );
}

function SummaryStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/80">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tracking-[-0.02em] text-foreground">{value}</div>
      <div className="mt-0.5 text-[9px] text-muted-foreground/70">{detail}</div>
    </div>
  );
}
