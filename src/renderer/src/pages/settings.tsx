import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, LoaderCircle } from 'lucide-react';
import type { SystemSnapshot } from '../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SelectField, ToggleRow } from '@/components/shared/controls';
import { cn } from '@/lib/cn';
import { formatMb } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

type SettingsSection = 'general' | 'performance' | 'diagnostics' | 'about';

const sections: Array<{ id: SettingsSection; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'performance', label: 'Performance' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'about', label: 'About' },
];

export function SettingsPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const [section, setSection] = useState<SettingsSection>('general');

  return (
    <div className="grid w-full flex-1 grid-cols-[180px_1fr] gap-0">
      <nav aria-label="Settings sections" className="border-r border-border px-3 py-5">
        <div className="flex flex-col gap-0.5">
          {sections.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              aria-current={section === id ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center rounded-md px-3 text-left text-[13px] font-medium transition-colors',
                section === id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <ScrollArea className="h-full">
        <div className="mx-auto max-w-2xl px-8 py-6">
          {section === 'general' ? <GeneralSection snapshot={snapshot} /> : null}
          {section === 'performance' ? <PerformanceSection snapshot={snapshot} /> : null}
          {section === 'diagnostics' ? <DiagnosticsSection snapshot={snapshot} /> : null}
          {section === 'about' ? <AboutSection snapshot={snapshot} /> : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-2">
      <h2 className="m-0 text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function GeneralSection({ snapshot }: { snapshot: SystemSnapshot }) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  return (
    <section aria-label="General">
      <SectionHeader title="General" description="Lifecycle behavior. The renderer can be destroyed in tray mode while device and engine hosts continue independently." />
      <div className="divide-y divide-border">
        <ToggleRow label="Launch at startup" description="Start the core only. Optional engines remain off until required." checked={snapshot.settings.launchAtStartup} onCheckedChange={(checked) => void updateSettings({ launchAtStartup: checked })} />
        <ToggleRow label="Close to tray" description="Keep hotkeys and connected device profiles available." checked={snapshot.settings.closeToTray} onCheckedChange={(checked) => void updateSettings({ closeToTray: checked })} />
        <ToggleRow label="Destroy renderer in tray" description="Release the Chromium page instead of merely hiding it." checked={snapshot.settings.destroyRendererInTray} onCheckedChange={(checked) => void updateSettings({ destroyRendererInTray: checked })} />
        <ToggleRow label="Automatic module updates" description="Verify signatures, install atomically, and retain one rollback copy." checked={snapshot.settings.automaticModuleUpdates} onCheckedChange={(checked) => void updateSettings({ automaticModuleUpdates: checked })} />
      </div>
    </section>
  );
}

function PerformanceSection({ snapshot }: { snapshot: SystemSnapshot }) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  return (
    <section aria-label="Performance">
      <SectionHeader title="Performance" description="A regression should fail release validation instead of becoming normal." />
      <div className="divide-y divide-border">
        <BudgetRow label="Memory" value={snapshot.performance.totalMemoryMb} budget={snapshot.performance.budgetMemoryMb} unit="MB" />
        <BudgetRow label="Idle CPU" value={snapshot.performance.totalCpuPercent} budget={snapshot.performance.budgetCpuPercent} unit="%" />
        <ToggleRow label="Performance guard" description="Warn when sustained runtime usage crosses the configured budget." checked={snapshot.settings.performanceGuard} onCheckedChange={(checked) => void updateSettings({ performanceGuard: checked })} />
        <div className="grid grid-cols-3 gap-2 py-4">
          <SmallMetric label="Core" value={`${snapshot.performance.coreMemoryMb} MB`} />
          <SmallMetric label="Renderer" value={`${snapshot.performance.rendererMemoryMb} MB`} />
          <SmallMetric label="Processes" value={`${snapshot.performance.activeProcesses}`} />
        </div>
      </div>
    </section>
  );
}

function DiagnosticsSection({ snapshot }: { snapshot: SystemSnapshot }) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  return (
    <section aria-label="Diagnostics">
      <SectionHeader title="Diagnostics" description="Diagnostics stay local and are redacted before an issue draft is created." />
      <div className="divide-y divide-border">
        <div className="flex items-center justify-between gap-6 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">Telemetry</div>
            <div className="mt-0.5 text-xs leading-4 text-muted-foreground/80">Hard-disabled in the prototype and schema.</div>
          </div>
          <Badge variant="success">Off</Badge>
        </div>
        <div className="flex items-center justify-between gap-6 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">Local retention</div>
            <div className="mt-0.5 text-xs leading-4 text-muted-foreground/80">Engine crashes, process samples, and module load failures.</div>
          </div>
          <SelectField
            value={String(snapshot.settings.diagnosticsRetentionDays)}
            onChange={(value) => void updateSettings({ diagnosticsRetentionDays: Number(value) })}
            ariaLabel="Diagnostics retention"
            options={[1, 3, 7, 14, 30].map((days) => ({ value: String(days), label: days === 1 ? '1 day' : `${days} days` }))}
          />
        </div>
      </div>
    </section>
  );
}

function AboutSection({ snapshot }: { snapshot: SystemSnapshot }) {
  return (
    <section aria-label="About">
      <SectionHeader title="About" description="Build and implementation status of this prototype." />
      <div className="divide-y divide-border">
        <div className="flex items-center justify-between gap-6 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">Version</div>
            <div className="mt-0.5 text-xs leading-4 text-muted-foreground/80">Control plane prototype, simulation mode.</div>
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">v{snapshot.version}</span>
        </div>
        <div className="flex items-center justify-between gap-6 py-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">Updates</div>
            <div className="mt-0.5 text-xs leading-4 text-muted-foreground/80">Signed packages install atomically with one rollback copy.</div>
          </div>
          <UpdateControl />
        </div>
      </div>

      <h3 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">Implementation status</h3>
      <div className="divide-y divide-border border-t border-border">
        <StatusLine label="Electron process isolation" value="Implemented" />
        <StatusLine label="Module state persistence" value="Implemented" />
        <StatusLine label="Capture worker" value="Simulated" />
        <StatusLine label="Virtual audio driver" value="Scaffolded" />
      </div>
      <Button variant="secondary" size="sm" className="mt-5">Open architecture notes</Button>
    </section>
  );
}

type UpdateState = 'idle' | 'checking' | 'downloading' | 'current';

function UpdateControl() {
  const [state, setState] = useState<UpdateState>('idle');
  const timers = useRef<number[]>([]);

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
  }, []);

  const begin = () => {
    if (state !== 'idle') return;
    setState('checking');
    timers.current.push(window.setTimeout(() => setState('downloading'), 1100));
    timers.current.push(window.setTimeout(() => setState('current'), 3200));
    timers.current.push(window.setTimeout(() => setState('idle'), 6800));
  };

  return (
    <Button
      variant={state === 'current' ? 'ghost' : 'secondary'}
      size="sm"
      onClick={begin}
      disabled={state === 'checking' || state === 'downloading'}
      aria-live="polite"
      className={cn('min-w-36 justify-center', state === 'current' && 'text-success hover:text-success')}
    >
      {state === 'idle' ? (
        <><ArrowDownToLine className="size-3.5" /> Check for updates</>
      ) : null}
      {state === 'checking' ? (
        <><LoaderCircle className="size-3.5 animate-spin" /> Checking…</>
      ) : null}
      {state === 'downloading' ? (
        <><ArrowDownToLine className="size-3.5 animate-download-dip text-primary" /> Downloading…</>
      ) : null}
      {state === 'current' ? (
        <><Check className="size-3.5" /> Up to date</>
      ) : null}
    </Button>
  );
}

function BudgetRow({ label, value, budget, unit }: { label: string; value: number; budget: number; unit: string }) {
  const ratio = Math.min(1, value / budget);
  return (
    <div className="py-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{unit === 'MB' ? formatMb(value) : `${value.toFixed(1)}${unit}`} / {budget}{unit}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-input">
        <div className="h-full rounded-full bg-success" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted p-3">
      <div className="text-[9px] uppercase tracking-[0.11em] text-muted-foreground/80">{label}</div>
      <div className="mt-1.5 text-xs font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  const implemented = value === 'Implemented';
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Badge variant={implemented ? 'success' : 'warning'}>{value}</Badge>
    </div>
  );
}
