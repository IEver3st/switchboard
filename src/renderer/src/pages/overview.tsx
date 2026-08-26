import {
  ArrowRight,
  AudioLines,
  BatteryMedium,
  CircleStop,
  Disc3,
  Gauge,
  Mic2,
  MousePointer2,
  Play,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
    <div className="flex flex-1 flex-col gap-4 p-5">
      <Surface className="flex items-center justify-between gap-8 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            Lightweight by default
          </div>
          <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-[-0.03em] text-foreground">
            Your hardware, audio, and clips without another always-on suite.
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-5">
          <HeroMetric label="Modules" value={String(activeModules)} />
          <Separator orientation="vertical" className="h-8" />
          <HeroMetric label="Processes" value={String(snapshot.performance.activeProcesses)} />
          <Separator orientation="vertical" className="h-8" />
          <HeroMetric label="Memory" value={formatMb(snapshot.performance.totalMemoryMb)} />
          <Separator orientation="vertical" className="h-8" />
          <HeroMetric label="CPU" value={`${snapshot.performance.totalCpuPercent.toFixed(1)}%`} />
        </div>
      </Surface>

      <div className="grid flex-1 grid-cols-12 gap-4">
        <Surface className="col-span-5 p-5">
          <SectionHeading eyebrow="Runtime" title="Engines" description="Nothing starts until its feature is enabled." />
          <div className="mt-3 divide-y divide-border">
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

          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">Quick controls</div>
            <div className="divide-y divide-border">
              <QuickControl icon={MousePointer2} label="Mouse DPI" value={`${snapshot.devices[0]?.settings.activeDpi ?? 1600}`} unit="DPI" onClick={() => setPage('devices')} />
              <QuickControl icon={Mic2} label="Microphone gain" value={`${snapshot.devices[1]?.settings.gain ?? 58}`} unit="%" onClick={() => setPage('devices')} />
              <QuickControl icon={Gauge} label="Replay length" value={`${snapshot.capture.config.replaySeconds}`} unit="seconds" onClick={() => setPage('capture')} />
            </div>
          </div>
        </Surface>

        <Surface className="col-span-7 p-5">
          <SectionHeading
            eyebrow="Connected"
            title="Devices"
            description="Controls are generated from capabilities exposed by each installed module."
            action={<Button size="sm" variant="ghost" onClick={() => setPage('devices')}>Open devices <ArrowRight className="size-3.5" /></Button>}
          />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {snapshot.devices.map((device) => (
              <button
                key={device.id}
                type="button"
                onClick={() => selectDevice(device.id)}
                className="flex items-center gap-3 rounded-md border border-border bg-muted p-3 text-left transition-colors hover:border-input"
              >
                <DeviceGlyph kind={device.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-foreground">{device.name}</span>
                    <StatusDot active={device.connected} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{device.vendor}</span>
                    <span aria-hidden>·</span>
                    <span className="capitalize">{device.connection}</span>
                    {typeof device.batteryPercent === 'number' ? (
                      <>
                        <span aria-hidden>·</span>
                        <BatteryMedium className="size-3" />
                        <span className="tabular-nums">{device.batteryPercent}%</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground/60" />
              </button>
            ))}
          </div>
        </Surface>
      </div>

      <Surface className="mt-auto flex items-center justify-between gap-6 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <StatusDot active />
          <span className="text-xs font-medium text-foreground">Performance budget is healthy</span>
          <span className="text-[11px] text-muted-foreground">
            {Math.round(snapshot.performance.totalMemoryMb)} of {snapshot.performance.budgetMemoryMb} MB · {snapshot.performance.totalCpuPercent.toFixed(1)} of {snapshot.performance.budgetCpuPercent.toFixed(1)}% idle CPU target
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setPage('settings')}>Inspect</Button>
      </Surface>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums tracking-[-0.03em] text-foreground">{value}</div>
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
      <div className={cn('grid size-8 place-items-center rounded-md border', running ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-muted text-muted-foreground')}>
        <Icon className="size-[15px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <StatusDot active={running} warning={status === 'starting'} /> {label}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground/80">{detail}</div>
      </div>
      {action}
    </div>
  );
}

function QuickControl({ icon: Icon, label, value, unit, onClick }: { icon: LucideIcon; label: string; value: string; unit: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 py-2.5 text-left">
      <Icon className="size-[15px] text-muted-foreground" />
      <span className="flex-1 text-xs font-medium text-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      <span className="w-12 text-[10px] text-muted-foreground/80">{unit}</span>
      <ArrowRight className="size-3.5 text-muted-foreground/60" />
    </button>
  );
}
