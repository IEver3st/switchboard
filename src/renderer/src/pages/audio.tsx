import {
  Cable,
  Check,
  Gamepad2,
  Headphones,
  MessageCircle,
  Mic2,
  Music2,
  Radio,
  type LucideIcon,
} from 'lucide-react';
import type { AudioBus, SystemSnapshot } from '../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SelectField } from '@/components/shared/controls';
import { StatusDot, Surface } from '@/components/shared/surface';
import { cn } from '@/lib/cn';
import { percent } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

const busIcons: Record<AudioBus['id'], LucideIcon> = {
  game: Gamepad2,
  chat: MessageCircle,
  media: Music2,
  aux: Cable,
};

export function AudioPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setAudioEnabled = useSystemStore((state) => state.setAudioEnabled);
  const setAudioBusGain = useSystemStore((state) => state.setAudioBusGain);
  const setChatMix = useSystemStore((state) => state.setChatMix);
  const setMicProcessor = useSystemStore((state) => state.setMicProcessor);
  const actionPending = useSystemStore((state) => state.actionPending);
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const enabled = snapshot.audio.enabled;

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <Surface className="flex items-center justify-between gap-6 px-4 py-3">
        <div className="flex items-center gap-3">
          <StatusDot active={engine?.state === 'running'} />
          <span className="text-[13px] font-semibold text-foreground">Audio Router</span>
          <span className="text-xs text-muted-foreground">
            {engine?.state === 'running'
              ? `${Math.round(engine.memoryMb)} MB · ${engine.cpuPercent.toFixed(1)}% CPU · 48 kHz`
              : 'Engine stopped'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Engine</span>
          <Switch checked={enabled} disabled={actionPending === 'audio:enabled'} aria-label="Audio engine" onCheckedChange={(checked) => void setAudioEnabled(checked)} />
        </div>
      </Surface>

      <Surface className={cn('flex min-h-[380px] flex-1 flex-col p-5 transition-opacity', !enabled && 'opacity-60')}>
        <div className="grid flex-1 grid-cols-4 divide-x divide-border">
          {snapshot.audio.buses.map((bus) => (
            <BusFader key={bus.id} bus={bus} onChange={(gain) => void setAudioBusGain({ busId: bus.id, gain })} />
          ))}
        </div>

        <div className="mt-5 flex items-center gap-4 border-t border-border pt-4">
          <span className="w-16 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">ChatMix</span>
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"><Gamepad2 className="size-3" /> Game</span>
          <Slider
            min={-1}
            max={1}
            step={0.01}
            value={[snapshot.audio.chatMix]}
            aria-label="ChatMix balance"
            onValueChange={([value]) => typeof value === 'number' && void setChatMix(value)}
          />
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"><MessageCircle className="size-3" /> Chat</span>
          <span className="w-11 text-right text-xs font-semibold tabular-nums text-foreground">
            {snapshot.audio.chatMix > 0 ? `+${Math.round(snapshot.audio.chatMix * 100)}` : Math.round(snapshot.audio.chatMix * 100)}
          </span>
        </div>
      </Surface>

      <div className={cn('grid grid-cols-12 gap-4 transition-opacity', !enabled && 'opacity-60')}>
        <Surface className="col-span-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-sm font-semibold text-foreground">Routing</h2>
            <span className="text-[10px] text-muted-foreground">Physical endpoints stay independent of apps</span>
          </div>
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-3">
              <Headphones className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-muted-foreground">Personal output</div>
              </div>
              <SelectField
                value={snapshot.audio.outputDevice}
                onChange={() => undefined}
                ariaLabel="Personal output"
                options={[snapshot.audio.outputDevice, 'Speakers (Realtek Audio)'].map((device) => ({ value: device, label: device }))}
              />
            </div>
            <Separator />
            <RouteLine icon={Radio} label="Stream output" value="Switchboard Stream" trailing={<Badge variant="success">Virtual</Badge>} />
            <Separator />
            <RouteLine icon={Mic2} label="Clip mix" value="Game + Chat + Mic" trailing={<span className="text-[10px] text-muted-foreground">3 buses</span>} />
          </div>
          <div className="mt-4 space-y-1.5 border-t border-border pt-4">
            <MixOutput name="Personal" detail="Game 100 · Chat 76 · Media 42" active />
            <MixOutput name="Stream" detail="Game 100 · Chat 100 · Mic 100" active />
            <MixOutput name="Clip" detail="Game 100 · Chat 55 · Mic 100" active={snapshot.capture.config.includeMic} />
          </div>
        </Surface>

        <Surface className={cn('col-span-7 p-5')}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="m-0 text-sm font-semibold text-foreground">Microphone chain</h2>
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Mic2 className="size-3" /> {snapshot.audio.microphoneDevice}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {snapshot.audio.micProcessors.map((processor) => (
              <button
                key={processor.id}
                type="button"
                onClick={() => void setMicProcessor({ processorId: processor.id, enabled: !processor.enabled })}
                aria-pressed={processor.enabled}
                className={cn(
                  'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors',
                  processor.enabled ? 'border-primary/40 bg-primary/10' : 'border-border bg-muted hover:border-input',
                )}
              >
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-sm border', processor.enabled ? 'border-primary/50 bg-primary/15 text-primary' : 'border-input text-muted-foreground/60')}>
                  {processor.enabled ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-foreground">{processor.label}</span>
                  <span className="mt-0.5 block text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">{processor.cost} cost</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 border-t border-border pt-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-foreground">Processed microphone · monitoring {percent(snapshot.audio.monitoring)}</span>
                <span className="tabular-nums text-muted-foreground">−11.2 dB</span>
              </div>
              <div className="meter-bar mt-2 h-1.5 rounded-full" style={{ ['--meter' as string]: '61%' }} />
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}

function BusFader({ bus, onChange }: { bus: AudioBus; onChange: (gain: number) => void }) {
  const Icon = busIcons[bus.id];
  const db = bus.gain <= 0.001 ? -60 : Math.round(20 * Math.log10(bus.gain));
  return (
    <div className="flex min-w-0 flex-col items-center px-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Icon className="size-3.5 text-muted-foreground" /> {bus.label}
      </div>
      <div className="mt-1 text-[9px] text-muted-foreground/80">{bus.appCount} {bus.appCount === 1 ? 'app' : 'apps'}</div>
      <div className="mt-4 flex min-h-44 flex-1 items-stretch gap-3">
        <div className="flex w-1.5 flex-col justify-end overflow-hidden rounded-full bg-input">
          <div className="w-full rounded-full bg-success transition-[height]" style={{ height: `${Math.max(4, bus.meter * 100)}%` }} />
        </div>
        <Slider
          orientation="vertical"
          min={0}
          max={1.5}
          step={0.01}
          value={[bus.gain]}
          aria-label={`${bus.label} gain`}
          onValueChange={([value]) => typeof value === 'number' && onChange(value)}
          className="h-full w-5 flex-col"
        />
      </div>
      <div className="mt-3 text-xs font-semibold tabular-nums text-foreground">{db > 0 ? `+${db}` : db} dB</div>
      <div className="mt-1 max-w-full truncate text-[9px] text-muted-foreground/80">{bus.endpoint}</div>
    </div>
  );
}

function RouteLine({ icon: Icon, label, value, trailing }: { icon: LucideIcon; label: string; value: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="mt-0.5 truncate text-xs font-medium text-foreground">{value}</div>
      </div>
      {trailing}
    </div>
  );
}

function MixOutput({ name, detail, active }: { name: string; detail: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <StatusDot active={active} />
      <div className="flex-1 text-xs font-medium text-foreground">{name}</div>
      <span className="text-[10px] text-muted-foreground/80">{detail}</span>
    </div>
  );
}
