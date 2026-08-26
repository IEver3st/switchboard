import {
  ArrowRight,
  AudioLines,
  BatteryMedium,
  CircleStop,
  Disc3,
  Gauge,
  Layers3,
  Mic2,
  MousePointer2,
  Play,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { DeviceGlyph } from '@/components/shared/device-glyph';
import { SectionHeading, StatusDot, Surface } from '@/components/shared/surface';
import { cn } from '@/lib/cn';
import { formatMb } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

export function OverviewPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setPage = useSystemStore((state) => state.setPage);
  const selectDevice = useSystemStore((state) => state.selectDevice);
  const setAudioEnabled = useSystemStore((state) => state.setAudioEnabled);
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const actionPending = useSystemStore((state) => state.actionPending);
  const audioEngine = snapshot.engines.find((engine) => engine.kind === 'audio');
  const captureEngine = snapshot.engines.find((engine) => engine.kind === 'capture');
  const activeModules = snapshot.modules.filter((module) => module.enabled).length;

  return (
    <div className="grid min-h-full grid-cols-12 gap-4 p-6">
      <Surface className="col-span-8 flex min-h-[194px] flex-col justify-between overflow-hidden p-5">
        <div className="flex items-start justify-between gap-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#68717d]">
              <span className="size-1.5 rounded-full bg-[var(--success)]" />
              Lightweight by default
            </div>
            <h2 className="max-w-xl text-[27px] font-semibold leading-[1.12] tracking-[-0.04em] text-[#f4f5f6]">
              Your hardware, audio, and clips without another always-on suite.
            </h2>
            <p className="mt-3 max-w-xl text-[13px] leading-5 text-[#7f8894]">
              Device families and realtime engines are isolated. Disable a capability and its process disappears.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-x-7 gap-y-4 border-l border-[var(--border)] pl-7">
            <HeroMetric label="Active modules" value={String(activeModules)} />
            <HeroMetric label="Processes" value={String(snapshot.performance.activeProcesses)} />
            <HeroMetric label="Memory" value={formatMb(snapshot.performance.totalMemoryMb)} />
            <HeroMetric label="CPU" value={`${snapshot.performance.totalCpuPercent.toFixed(1)}%`} />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 border-t border-[var(--border)] pt-4">
          <Button variant="primary" size="sm" onClick={() => setPage('modules')}>
            Manage modules <ArrowRight className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPage('settings')}>
            View performance guard
          </Button>
        </div>
      </Surface>

      <Surface className="col-span-4 min-h-[194px] p-5">
        <SectionHeading eyebrow="Runtime" title="Engines" description="Nothing starts until its feature is enabled." />
        <div className="mt-3 divide-y divide-[var(--border)]">
          <EngineRow
            icon={AudioLines}
            label="Audio router"
            status={audioEngine?.state ?? 'stopped'}
            detail={audioEngine?.state === 'running' ? `${Math.round(audioEngine.memoryMb)} MB · ${audioEngine.cpuPercent.toFixed(1)}% CPU` : 'No process'}
            action={
              <Button
                size="sm"
                variant={snapshot.audio.enabled ? 'danger' : 'secondary'}
                disabled={actionPending === 'audio:enabled'}
                onClick={() => void setAudioEnabled(!snapshot.audio.enabled)}
              >
                {snapshot.audio.enabled ? <CircleStop className="size-3.5" /> : <Play className="size-3.5" />}
                {snapshot.audio.enabled ? 'Stop' : 'Start'}
              </Button>
            }
          />
          <EngineRow
            icon={Disc3}
            label="Instant replay"
            status={captureEngine?.state ?? 'stopped'}
            detail={captureEngine?.state === 'running' ? `${Math.round(captureEngine.memoryMb)} MB · ${snapshot.capture.runtime.bufferedSeconds}s buffered` : 'No process'}
            action={
              <Button
                size="sm"
                variant={snapshot.capture.config.enabled ? 'danger' : 'secondary'}
                disabled={actionPending === 'capture:config'}
                onClick={() => void setCaptureConfig({ enabled: !snapshot.capture.config.enabled })}
              >
                {snapshot.capture.config.enabled ? <CircleStop className="size-3.5" /> : <Play className="size-3.5" />}
                {snapshot.capture.config.enabled ? 'Stop' : 'Start'}
              </Button>
            }
          />
        </div>
      </Surface>

      <Surface className="col-span-7 p-5">
        <SectionHeading
          eyebrow="Connected"
          title="Devices"
          description="Controls are generated from capabilities exposed by each installed module."
          action={<Button size="sm" variant="ghost" onClick={() => setPage('devices')}>Open workbench <ArrowRight className="size-3.5" /></Button>}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {snapshot.devices.map((device) => (
            <button
              key={device.id}
              type="button"
              onClick={() => selectDevice(device.id)}
              className="flex items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[#14171c] p-3 text-left transition-colors hover:border-[#39404a] hover:bg-[#171b21]"
            >
              <DeviceGlyph kind={device.kind} active />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-[#e9ebee]">{device.name}</span>
                  <StatusDot active={device.connected} />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-[#69727e]">
                  <span>{device.vendor}</span>
                  <span>·</span>
                  <span>{device.connection}</span>
                  {typeof device.batteryPercent === 'number' ? (
                    <>
                      <span>·</span>
                      <BatteryMedium className="size-3" />
                      <span>{device.batteryPercent}%</span>
                    </>
                  ) : null}
                </div>
              </div>
              <ArrowRight className="size-4 text-[#59616c]" />
            </button>
          ))}
        </div>
      </Surface>

      <Surface className="col-span-5 p-5">
        <SectionHeading eyebrow="One-click" title="Quick controls" description="The most-used controls across active modules." />
        <div className="mt-3 divide-y divide-[var(--border)]">
          <QuickControl icon={MousePointer2} label="Mouse DPI" value={`${snapshot.devices[0]?.settings.activeDpi ?? 1600}`} unit="DPI" onClick={() => setPage('devices')} />
          <QuickControl icon={Mic2} label="Microphone gain" value={`${snapshot.devices[1]?.settings.gain ?? 58}`} unit="%" onClick={() => setPage('devices')} />
          <QuickControl icon={Gauge} label="Replay length" value={`${snapshot.capture.config.replaySeconds}`} unit="seconds" onClick={() => setPage('capture')} />
        </div>
      </Surface>

      <Surface className="col-span-12 p-5">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-[8px] border border-[#29473c] bg-[#13241e] text-[#6fd0aa]">
              <Layers3 className="size-[17px]" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#e9ebee]">Performance budget is healthy</div>
              <div className="mt-0.5 text-[11px] text-[#707985]">{Math.round(snapshot.performance.totalMemoryMb)} of {snapshot.performance.budgetMemoryMb} MB · {snapshot.performance.totalCpuPercent.toFixed(1)} of {snapshot.performance.budgetCpuPercent.toFixed(1)}% idle CPU target</div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-[11px]">
            <BudgetStat label="Core" value={`${snapshot.performance.coreMemoryMb} MB`} />
            <BudgetStat label="Renderer" value={`${snapshot.performance.rendererMemoryMb} MB`} />
            <BudgetStat label="Engines" value={`${Math.max(0, Math.round(snapshot.performance.totalMemoryMb - snapshot.performance.coreMemoryMb - snapshot.performance.rendererMemoryMb))} MB`} />
            <Button size="sm" variant="ghost" onClick={() => setPage('settings')}>Inspect</Button>
          </div>
        </div>
      </Surface>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[#606975]">{label}</div>
      <div className="mt-1 text-[17px] font-semibold tabular-nums tracking-[-0.03em] text-[#e9ebee]">{value}</div>
    </div>
  );
}

function EngineRow({
  icon: Icon,
  label,
  status,
  detail,
  action,
}: {
  icon: LucideIcon;
  label: string;
  status: 'stopped' | 'starting' | 'running' | 'error';
  detail: string;
  action: ReactNode;
}) {
  const running = status === 'running';
  return (
    <div className="flex items-center gap-3 py-3 first:pt-1">
      <div className={cn('grid size-8 place-items-center rounded-[7px] border', running ? 'border-[#29473c] bg-[#13241e] text-[#67c9a4]' : 'border-[var(--border)] bg-[#171a20] text-[#66707c]')}>
        <Icon className="size-[15px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[12px] font-medium text-[#dfe2e6]"><StatusDot active={running} warning={status === 'starting'} /> {label}</div>
        <div className="mt-0.5 text-[10px] text-[#646d78]">{detail}</div>
      </div>
      {action}
    </div>
  );
}

function QuickControl({ icon: Icon, label, value, unit, onClick }: { icon: LucideIcon; label: string; value: string; unit: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-3 text-left first:pt-1">
      <Icon className="size-[15px] text-[#707986]" />
      <span className="flex-1 text-[12px] font-medium text-[#cfd3d8]">{label}</span>
      <span className="text-[15px] font-semibold tabular-nums text-[#eceef0]">{value}</span>
      <span className="w-12 text-[10px] text-[#626b76]">{unit}</span>
      <ArrowRight className="size-3.5 text-[#4e5661]" />
    </button>
  );
}

function BudgetStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-[0.12em] text-[#59626d]">{label}</div>
      <div className="mt-1 font-medium tabular-nums text-[#bdc2c9]">{value}</div>
    </div>
  );
}
