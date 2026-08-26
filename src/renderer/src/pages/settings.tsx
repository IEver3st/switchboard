import { Activity, Bug, Database, Gauge, HardDrive, Power, Shield, Trash2 } from 'lucide-react';
import type { SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { SelectField, ToggleRow } from '@/components/shared/controls';
import { SectionHeading, Surface } from '@/components/shared/surface';
import { formatMb } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

export function SettingsPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const updateSettings = useSystemStore((state) => state.updateSettings);

  return (
    <div className="grid grid-cols-12 gap-4 p-6">
      <Surface className="col-span-7 p-5">
        <SectionHeading eyebrow="Lifecycle" title="Background behavior" description="The renderer can be destroyed in tray mode while device and engine hosts continue independently." />
        <div className="mt-3 divide-y divide-[var(--border)]">
          <ToggleRow label="Launch at startup" description="Start the core only. Optional engines remain off until required." checked={snapshot.settings.launchAtStartup} onCheckedChange={(checked) => void updateSettings({ launchAtStartup: checked })} trailing={<Power className="size-3.5 text-[#68717c]" />} />
          <ToggleRow label="Close to tray" description="Keep hotkeys and connected device profiles available." checked={snapshot.settings.closeToTray} onCheckedChange={(checked) => void updateSettings({ closeToTray: checked })} trailing={<HardDrive className="size-3.5 text-[#68717c]" />} />
          <ToggleRow label="Destroy renderer in tray" description="Release the Chromium page instead of merely hiding it." checked={snapshot.settings.destroyRendererInTray} onCheckedChange={(checked) => void updateSettings({ destroyRendererInTray: checked })} trailing={<Trash2 className="size-3.5 text-[#68717c]" />} />
          <ToggleRow label="Automatic module updates" description="Verify signatures, install atomically, and retain one rollback copy." checked={snapshot.settings.automaticModuleUpdates} onCheckedChange={(checked) => void updateSettings({ automaticModuleUpdates: checked })} trailing={<Database className="size-3.5 text-[#68717c]" />} />
        </div>
      </Surface>

      <Surface className="col-span-5 p-5">
        <SectionHeading eyebrow="Guardrails" title="Performance budget" description="A regression should fail release validation instead of becoming normal." />
        <div className="mt-5 space-y-4">
          <BudgetBar label="Memory" value={snapshot.performance.totalMemoryMb} budget={snapshot.performance.budgetMemoryMb} unit="MB" />
          <BudgetBar label="Idle CPU" value={snapshot.performance.totalCpuPercent} budget={snapshot.performance.budgetCpuPercent} unit="%" />
          <div className="grid grid-cols-3 gap-2">
            <SmallMetric label="Core" value={`${snapshot.performance.coreMemoryMb} MB`} />
            <SmallMetric label="Renderer" value={`${snapshot.performance.rendererMemoryMb} MB`} />
            <SmallMetric label="Processes" value={`${snapshot.performance.activeProcesses}`} />
          </div>
          <ToggleRow label="Performance guard" description="Warn when sustained runtime usage crosses the configured budget." checked={snapshot.settings.performanceGuard} onCheckedChange={(checked) => void updateSettings({ performanceGuard: checked })} trailing={<Gauge className="size-3.5 text-[#68717c]" />} />
        </div>
      </Surface>

      <Surface className="col-span-7 p-5">
        <SectionHeading eyebrow="Privacy" title="Diagnostics" description="Diagnostics stay local and are redacted before an issue draft is created." />
        <div className="mt-3 divide-y divide-[var(--border)]">
          <div className="flex items-center justify-between gap-5 py-3">
            <div className="flex items-center gap-3"><Shield className="size-[15px] text-[#68717c]" /><div><div className="text-[12px] font-medium text-[#d6dade]">Telemetry</div><div className="mt-0.5 text-[10px] text-[#626b76]">Hard-disabled in the prototype and schema.</div></div></div>
            <span className="rounded-[5px] border border-[#29473c] bg-[#13241e] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6bcaa6]">Off</span>
          </div>
          <div className="flex items-center justify-between gap-5 py-3">
            <div className="flex items-center gap-3"><Bug className="size-[15px] text-[#68717c]" /><div><div className="text-[12px] font-medium text-[#d6dade]">Local retention</div><div className="mt-0.5 text-[10px] text-[#626b76]">Engine crashes, process samples, and module load failures.</div></div></div>
            <SelectField value={snapshot.settings.diagnosticsRetentionDays} onChange={(value) => void updateSettings({ diagnosticsRetentionDays: Number(value) })}>
              <option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option>
            </SelectField>
          </div>
        </div>
      </Surface>

      <Surface className="col-span-5 p-5">
        <SectionHeading eyebrow="Prototype" title="Implementation status" description="The desktop control plane is runnable. Native engines remain explicit next-stage work." />
        <div className="mt-4 space-y-2">
          <StatusLine icon={Activity} label="Electron process isolation" value="Implemented" />
          <StatusLine icon={Database} label="Module state persistence" value="Implemented" />
          <StatusLine icon={HardDrive} label="Capture worker" value="Simulated" />
          <StatusLine icon={Shield} label="Virtual audio driver" value="Scaffolded" />
        </div>
        <Button variant="secondary" className="mt-4 w-full">Open architecture notes</Button>
      </Surface>
    </div>
  );
}

function BudgetBar({ label, value, budget, unit }: { label: string; value: number; budget: number; unit: string }) {
  const ratio = Math.min(1, value / budget);
  return (
    <div>
      <div className="flex items-center justify-between text-[10px]"><span className="font-medium text-[#89919c]">{label}</span><span className="tabular-nums text-[#737c87]">{unit === 'MB' ? formatMb(value) : `${value.toFixed(1)}${unit}`} / {budget}{unit}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#292e36]"><div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${ratio * 100}%` }} /></div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[7px] border border-[var(--border)] bg-[#15181d] p-3"><div className="text-[8px] uppercase tracking-[0.11em] text-[#59626d]">{label}</div><div className="mt-1.5 text-[12px] font-semibold tabular-nums text-[#cfd3d8]">{value}</div></div>;
}

function StatusLine({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  const implemented = value === 'Implemented';
  return <div className="flex items-center gap-3 rounded-[7px] border border-[var(--border)] bg-[#15181d] p-3"><Icon className="size-3.5 text-[#68717c]" /><span className="flex-1 text-[10px] text-[#aeb4bc]">{label}</span><span className={implemented ? 'text-[9px] font-semibold uppercase tracking-[0.09em] text-[#67c9a4]' : 'text-[9px] font-semibold uppercase tracking-[0.09em] text-[#b69a67]'}>{value}</span></div>;
}
