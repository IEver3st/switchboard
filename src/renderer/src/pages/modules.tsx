import { Box, Boxes, Download, Puzzle, RefreshCw, Usb, type LucideIcon } from 'lucide-react';
import type { ModuleKind, ModuleManifest, SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
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
  const enabledCount = snapshot.modules.filter((module) => module.enabled).length;

  return (
    <div className="min-h-full px-5 py-5 sm:px-6">
      <div className="mx-auto w-full max-w-[840px]">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="m-0 text-[14px] font-semibold tracking-[-0.02em] text-foreground">Modules</h2>
          <p className="mt-1 max-w-[52ch] text-[11px] leading-[1.5] text-muted-foreground">
            Add hardware, audio, and capture features. Turn on only what you use.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline" aria-live="polite">
            {installed.length} installed · {enabledCount} enabled
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground sm:hidden">
            {installed.length} installed
          </span>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2.5 text-[11px] text-muted-foreground hover:text-foreground" aria-label="Check for module updates">
            <RefreshCw className="size-3.5" aria-hidden />
            Check updates
          </Button>
        </div>
      </header>

      <section className="mt-6" aria-labelledby="installed-heading">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 id="installed-heading" className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Installed
          </h3>
          <span className="text-[10px] tabular-nums text-muted-foreground/70">{available.length} available</span>
        </div>

        {installed.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No modules installed.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {installed.map((module) => (
              <InstalledRow
                key={module.id}
                module={module}
                pending={actionPending === `module:${module.id}`}
                onToggle={(enabled) => void setModuleState({ moduleId: module.id, enabled })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8" aria-labelledby="available-heading">
        <div className="border-b border-border pb-2">
          <h3 id="available-heading" className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Available for this setup
          </h3>
        </div>

        {available.length === 0 ? (
          <p className="py-6 text-[11px] text-muted-foreground">All detected modules are installed.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {available.map((module) => (
              <AvailableRow
                key={module.id}
                module={module}
                pending={actionPending === `module:${module.id}`}
                onInstall={() => void setModuleState({ moduleId: module.id, enabled: true })}
              />
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

function InstalledRow({
  module,
  pending,
  onToggle,
}: {
  module: ModuleManifest;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const Icon = kindIcon[module.kind];
  return (
    <div className={cn('flex items-center gap-4 py-3.5', !module.enabled && 'opacity-[0.92]')}>
      <div
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-[6px] border',
          module.enabled ? 'border-border-strong bg-surface-interactive text-text-secondary' : 'border-border bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        <Icon className="size-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">{module.name}</span>
          <span
            className={cn(
              'hidden shrink-0 text-[9px] font-medium uppercase tracking-[0.08em] sm:inline',
              module.official ? 'text-muted-foreground/70' : 'text-warning',
            )}
          >
            {module.official ? 'Official' : 'Community'}
          </span>
          {!module.enabled ? <span className="shrink-0 text-[10px] text-muted-foreground/60">Disabled</span> : null}
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">{module.description}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className={cn('hidden text-[11px] font-medium sm:inline', module.enabled ? 'text-foreground' : 'text-muted-foreground')}>
          {module.enabled ? 'Enabled' : 'Off'}
        </span>
        <Switch
          checked={module.enabled}
          disabled={pending}
          aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${module.name}`}
          onCheckedChange={onToggle}
          className="no-drag"
        />
      </div>
    </div>
  );
}

function AvailableRow({
  module,
  pending,
  onInstall,
}: {
  module: ModuleManifest;
  pending: boolean;
  onInstall: () => void;
}) {
  const Icon = kindIcon[module.kind];
  return (
    <div className="flex items-center gap-4 py-3.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-[6px] border border-border bg-muted text-muted-foreground" aria-hidden>
        <Icon className="size-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">{module.name}</span>
          <span
            className={cn(
              'hidden shrink-0 text-[9px] font-medium uppercase tracking-[0.08em] sm:inline',
              module.official ? 'text-muted-foreground/70' : 'text-warning',
            )}
          >
            {module.official ? 'Official' : 'Community'}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">{module.description}</p>
      </div>

      <Button
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={onInstall}
        aria-label={`Install ${module.name}`}
        className="h-7 shrink-0 gap-1.5 px-3 text-xs no-drag"
      >
        <Download className="size-3.5" aria-hidden />
        Install
      </Button>
    </div>
  );
}
