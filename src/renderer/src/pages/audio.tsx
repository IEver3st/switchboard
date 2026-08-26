import {
  Activity,
  AudioLines,
  Cable,
  Check,
  Gamepad2,
  Headphones,
  MessageCircle,
  Mic2,
  Music2,
  Radio,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { AudioBus, SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SelectField } from '@/components/shared/controls';
import { SectionHeading, StatusDot, Surface } from '@/components/shared/surface';
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
    <div className="space-y-4 p-6">
      <Surface className="flex items-center justify-between gap-8 p-5">
        <div className="flex items-center gap-4">
          <div className={cn('grid size-11 place-items-center rounded-[9px] border', enabled ? 'border-[#29473c] bg-[#13241e] text-[#67c9a4]' : 'border-[var(--border)] bg-[#171a20] text-[#69727e]')}>
            <AudioLines className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#646d78]"><StatusDot active={engine?.state === 'running'} /> {engine?.state === 'running' ? 'Audio host running' : 'Audio host stopped'}</div>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.025em] text-[#eef0f2]">Audio Router</h2>
            <p className="mt-1 text-[11px] text-[#6f7884]">One 48 kHz graph for personal, stream, and clip mixes.</p>
          </div>
        </div>
        <div className="flex items-center gap-7">
          <RuntimeMetric label="Memory" value={engine?.state === 'running' ? `${Math.round(engine.memoryMb)} MB` : '0 MB'} />
          <RuntimeMetric label="CPU" value={engine?.state === 'running' ? `${engine.cpuPercent.toFixed(1)}%` : '0.0%'} />
          <RuntimeMetric label="Sample rate" value="48 kHz" />
          <div className="h-9 w-px bg-[var(--border)]" />
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-[#89919c]">Engine</span>
            <Switch checked={enabled} disabled={actionPending === 'audio:enabled'} onCheckedChange={(checked) => void setAudioEnabled(checked)} />
          </div>
        </div>
      </Surface>

      <div className={cn('grid grid-cols-12 gap-4 transition-opacity', !enabled && 'opacity-60')}>
        <Surface className="col-span-8 p-5">
          <SectionHeading eyebrow="Personal mix" title="Application buses" description="Applications target virtual endpoints. The engine produces one low-latency headphone mix." action={<Button size="sm" variant="ghost"><SlidersHorizontal className="size-3.5" /> Assign apps</Button>} />
          <div className="mt-5 grid grid-cols-4 divide-x divide-[var(--border)] rounded-[8px] border border-[var(--border)] bg-[#14171b] py-4">
            {snapshot.audio.buses.map((bus) => (
              <BusFader key={bus.id} bus={bus} onChange={(gain) => void setAudioBusGain({ busId: bus.id, gain })} />
            ))}
          </div>
          <div className="mt-4 flex items-center gap-5 rounded-[8px] border border-[var(--border)] bg-[#14171b] px-4 py-3">
            <span className="w-16 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#626b76]">ChatMix</span>
            <span className="text-[10px] font-medium text-[#89919c]">Game</span>
            <Slider min={-1} max={1} step={0.01} value={[snapshot.audio.chatMix]} onValueChange={([value]) => typeof value === 'number' && void setChatMix(value)} />
            <span className="text-[10px] font-medium text-[#89919c]">Chat</span>
            <span className="w-11 text-right text-[11px] font-semibold tabular-nums text-[#d9dce0]">{snapshot.audio.chatMix > 0 ? `+${Math.round(snapshot.audio.chatMix * 100)}` : Math.round(snapshot.audio.chatMix * 100)}</span>
          </div>
        </Surface>

        <Surface className="col-span-4 p-5">
          <SectionHeading eyebrow="Output" title="Routing" description="The physical endpoint can change without moving applications." />
          <div className="mt-4 space-y-3">
            <RouteField icon={Headphones} label="Personal output" value={snapshot.audio.outputDevice}>
              <SelectField value={snapshot.audio.outputDevice} onChange={() => undefined} className="max-w-[180px]">
                <option>{snapshot.audio.outputDevice}</option>
                <option>Speakers (Realtek Audio)</option>
              </SelectField>
            </RouteField>
            <RouteField icon={Radio} label="Stream output" value="Switchboard Stream">
              <span className="rounded-[5px] border border-[#29473c] bg-[#13241e] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#6bcaa6]">Virtual</span>
            </RouteField>
            <RouteField icon={Activity} label="Clip mix" value="Game + Chat + Mic">
              <span className="text-[10px] text-[#646d78]">3 buses</span>
            </RouteField>
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-4 text-[10px] leading-4 text-[#616a76]">
            The production path requires signed virtual audio endpoints. This prototype exercises the control plane and graph contracts.
          </div>
        </Surface>

        <Surface className="col-span-7 p-5">
          <SectionHeading eyebrow="Microphone" title="Processing chain" description="Small, allocation-free processors. Disabled nodes are skipped entirely." action={<div className="flex items-center gap-2 text-[10px] text-[#68717c]"><Mic2 className="size-3.5" /> {snapshot.audio.microphoneDevice}</div>} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {snapshot.audio.micProcessors.map((processor, index) => (
              <button
                key={processor.id}
                type="button"
                onClick={() => void setMicProcessor({ processorId: processor.id, enabled: !processor.enabled })}
                className={cn(
                  'relative flex min-h-[67px] items-center gap-3 rounded-[8px] border p-3 text-left transition-colors',
                  processor.enabled ? 'border-[#3a3440] bg-[#1c171d]' : 'border-[var(--border)] bg-[#15181d] hover:border-[#39404a]',
                )}
              >
                <div className={cn('grid size-7 place-items-center rounded-[6px] border', processor.enabled ? 'border-[#71384a] bg-[#2a1820] text-[var(--accent)]' : 'border-[var(--border)] bg-[#191c21] text-[#626b76]')}>
                  {processor.enabled ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-[#555e69]" />}
                </div>
                <div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#d9dce0]">{processor.label}</div><div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#5f6873]">{processor.cost} cost</div></div>
                {index < snapshot.audio.micProcessors.length - 1 ? <span className="absolute -right-[7px] z-10 h-px w-3 bg-[#373d46]" /> : null}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 rounded-[8px] border border-[var(--border)] bg-[#14171b] p-3">
            <div className="grid size-8 place-items-center rounded-[7px] border border-[#29473c] bg-[#13241e] text-[#67c9a4]"><Sparkles className="size-3.5" /></div>
            <div className="flex-1"><div className="text-[11px] font-medium text-[#d1d5da]">Processed microphone</div><div className="mt-0.5 text-[9px] text-[#606975]">Switchboard Microphone · monitoring {percent(snapshot.audio.monitoring)}</div></div>
            <div className="w-28"><div className="h-1.5 rounded-full bg-[#292e36]"><div className="h-full w-[61%] rounded-full bg-[var(--success)]" /></div></div>
            <span className="text-[10px] tabular-nums text-[#737c87]">−11.2 dB</span>
          </div>
        </Surface>

        <Surface className="col-span-5 p-5">
          <SectionHeading eyebrow="Mix outputs" title="Independent destinations" description="Each destination has its own bus gains without duplicating capture." />
          <div className="mt-4 space-y-2">
            <MixOutput name="Personal" detail="Game 100 · Chat 76 · Media 42" active />
            <MixOutput name="Stream" detail="Game 100 · Chat 100 · Mic 100" active />
            <MixOutput name="Clip" detail="Game 100 · Chat 55 · Mic 100" active={snapshot.capture.config.includeMic} />
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
    <div className="flex flex-col items-center px-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#cdd1d6]"><Icon className="size-3.5 text-[#707986]" /> {bus.label}</div>
      <div className="mt-1 text-[9px] text-[#59626d]">{bus.appCount} {bus.appCount === 1 ? 'app' : 'apps'}</div>
      <div className="mt-4 flex h-[150px] items-stretch gap-3">
        <div className="flex w-1.5 flex-col justify-end overflow-hidden rounded-full bg-[#272c34]"><div className="w-full rounded-full bg-[var(--success)] transition-[height]" style={{ height: `${Math.max(4, bus.meter * 100)}%` }} /></div>
        <Slider orientation="vertical" min={0} max={1.5} step={0.01} value={[bus.gain]} onValueChange={([value]) => typeof value === 'number' && onChange(value)} className="h-full w-5 flex-col" />
      </div>
      <div className="mt-3 text-[12px] font-semibold tabular-nums text-[#dfe2e6]">{db > 0 ? `+${db}` : db} dB</div>
      <div className="mt-1 text-[9px] text-[#59626d]">{bus.endpoint}</div>
    </div>
  );
}

function RuntimeMetric({ label, value }: { label: string; value: string }) {
  return <div className="text-right"><div className="text-[9px] uppercase tracking-[0.12em] text-[#59626d]">{label}</div><div className="mt-1 text-[12px] font-semibold tabular-nums text-[#d9dce0]">{value}</div></div>;
}

function RouteField({ icon: Icon, label, value, children }: { icon: LucideIcon; label: string; value: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[#15181d] p-3">
      <Icon className="size-[15px] text-[#6d7682]" />
      <div className="min-w-0 flex-1"><div className="text-[10px] text-[#69727d]">{label}</div><div className="mt-0.5 truncate text-[11px] font-medium text-[#cfd3d8]">{value}</div></div>
      {children}
    </div>
  );
}

function MixOutput({ name, detail, active }: { name: string; detail: string; active: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-[8px] border border-[var(--border)] bg-[#15181d] p-3">
      <StatusDot active={active} />
      <div className="flex-1"><div className="text-[11px] font-medium text-[#d5d9de]">{name}</div><div className="mt-0.5 text-[9px] text-[#626b76]">{detail}</div></div>
      <span className={cn('text-[9px] font-semibold uppercase tracking-[0.1em]', active ? 'text-[#67c9a4]' : 'text-[#59626d]')}>{active ? 'Active' : 'Idle'}</span>
    </div>
  );
}
