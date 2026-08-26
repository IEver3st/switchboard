import { BatteryCharging, Cable, Check, ChevronRight, Crosshair, Lightbulb, MousePointer2, Radio, RotateCcw, SlidersHorizontal, Usb } from 'lucide-react';
import type { Device, DeviceSettingValue, SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { DeviceGlyph } from '@/components/shared/device-glyph';
import { SelectField } from '@/components/shared/controls';
import { SectionHeading, StatusDot, Surface } from '@/components/shared/surface';
import { cn } from '@/lib/cn';
import { useSystemStore } from '@/stores/use-system-store';

export function DevicesPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const selectedDeviceId = useSystemStore((state) => state.selectedDeviceId);
  const selectDevice = useSystemStore((state) => state.selectDevice);
  const selected = snapshot.devices.find((device) => device.id === selectedDeviceId) ?? snapshot.devices[0];

  if (!selected) {
    return <div className="p-6 text-[13px] text-[var(--muted)]">No supported devices detected.</div>;
  }

  return (
    <div className="grid min-h-full grid-cols-[248px_1fr] gap-4 p-6">
      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5e6772]">Connected hardware</div>
          <div className="mt-1 text-[12px] text-[#818a95]">{snapshot.devices.length} devices · 2 modules</div>
        </div>
        <div className="p-2">
          {snapshot.devices.map((device) => {
            const active = device.id === selected.id;
            return (
              <button
                key={device.id}
                type="button"
                onClick={() => selectDevice(device.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[8px] p-2.5 text-left transition-colors',
                  active ? 'bg-[#1c2027]' : 'hover:bg-[#171a20]',
                )}
              >
                <DeviceGlyph kind={device.kind} active={active} />
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-[12px] font-semibold', active ? 'text-[#f0f1f3]' : 'text-[#b3b9c1]')}>{device.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#626b76]"><StatusDot active={device.connected} /> {device.connection}</div>
                </div>
                <ChevronRight className="size-3.5 text-[#4d5560]" />
              </button>
            );
          })}
        </div>
        <div className="mx-4 mt-3 border-t border-[var(--border)] pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5e6772]">Discovery</div>
          <div className="mt-3 rounded-[8px] border border-[var(--border)] bg-[#14171b] p-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-[#aeb4bc]"><Usb className="size-3.5" /> HID watcher active</div>
            <div className="mt-1.5 text-[10px] leading-4 text-[#626b76]">Only installed vendor modules receive matching VID/PID events.</div>
          </div>
        </div>
      </Surface>

      <div className="min-w-0 space-y-4">
        <DeviceHeader device={selected} />
        {selected.kind === 'mouse' ? <MouseControls device={selected} /> : null}
        {selected.kind === 'microphone' ? <MicrophoneControls device={selected} /> : null}
      </div>
    </div>
  );
}

function DeviceHeader({ device }: { device: Device }) {
  return (
    <Surface className="flex items-center gap-5 p-5">
      <DeviceGlyph kind={device.kind} active large />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#66707c]"><StatusDot active={device.connected} /> {device.vendor} · {device.connection}</div>
        <h2 className="mt-1 text-[25px] font-semibold tracking-[-0.035em] text-[#f2f3f5]">{device.name}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {device.capabilities.map((capability) => (
            <span key={capability} className="rounded-[5px] border border-[var(--border)] bg-[#15181d] px-2 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[#737c88]">{capability}</span>
          ))}
        </div>
      </div>
      <div className="grid min-w-40 grid-cols-2 gap-x-6 gap-y-3 border-l border-[var(--border)] pl-6">
        <HeaderStat icon={device.connection === 'wireless' ? Radio : Cable} label="Connection" value={device.connection ?? 'unknown'} />
        {typeof device.batteryPercent === 'number' ? <HeaderStat icon={BatteryCharging} label="Battery" value={`${device.batteryPercent}%`} /> : <HeaderStat icon={Usb} label="Power" value="USB" />}
        <HeaderStat icon={Check} label="Module" value="Loaded" />
        <HeaderStat icon={SlidersHorizontal} label="Profile" value="Desktop" />
      </div>
    </Surface>
  );
}

function MouseControls({ device }: { device: Device }) {
  const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
  const activeDpi = asNumber(device.settings.activeDpi, 1600);
  const stages = asNumberArray(device.settings.dpiStages, [800, 1600, 3200]);
  const pollingRate = asNumber(device.settings.pollingRate, 1000);
  const onboardMemory = asBoolean(device.settings.onboardMemory, true);
  const lightingEnabled = asBoolean(device.settings.lightingEnabled, false);

  return (
    <div className="grid grid-cols-12 gap-4">
      <Surface className="col-span-8 p-5">
        <SectionHeading eyebrow="Pointer" title="Sensitivity" description="Stages are stored by the Logitech HID++ module and rendered by the shared mouse capability UI." action={<Button size="sm" variant="ghost"><RotateCcw className="size-3.5" /> Reset</Button>} />
        <div className="mt-6 flex items-end gap-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#89919c]">Active DPI</span>
              <div className="flex items-baseline gap-2"><span className="text-[29px] font-semibold tabular-nums tracking-[-0.045em] text-[#f0f1f3]">{activeDpi}</span><span className="text-[10px] text-[#646d78]">DPI</span></div>
            </div>
            <Slider
              className="mt-4"
              min={100}
              max={25600}
              step={50}
              value={[activeDpi]}
              onValueCommit={([value]) => value && void setDeviceSetting({ deviceId: device.id, key: 'activeDpi', value })}
              onValueChange={([value]) => value && void setDeviceSetting({ deviceId: device.id, key: 'activeDpi', value })}
            />
            <div className="mt-2 flex justify-between text-[9px] tabular-nums text-[#4e5661]"><span>100</span><span>25,600</span></div>
          </div>
          <div className="w-[230px] border-l border-[var(--border)] pl-7">
            <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#59626d]">Stages</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {stages.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => void setDeviceSetting({ deviceId: device.id, key: 'activeDpi', value: stage })}
                  className={cn(
                    'h-9 rounded-[7px] border text-[11px] font-semibold tabular-nums transition-colors',
                    stage === activeDpi ? 'border-[#71384a] bg-[#26171d] text-[var(--accent)]' : 'border-[var(--border)] bg-[#16191e] text-[#8d95a0] hover:border-[#3a414c]',
                  )}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Surface>

      <Surface className="col-span-4 p-5">
        <SectionHeading eyebrow="Sensor" title="Report rate" description="Written only when the value changes." />
        <div className="mt-6 flex items-center justify-between rounded-[8px] border border-[var(--border)] bg-[#15181d] p-3">
          <div><div className="text-[11px] text-[#737c87]">Polling rate</div><div className="mt-1 text-[16px] font-semibold text-[#e8eaed]">{pollingRate} Hz</div></div>
          <SelectField value={pollingRate} onChange={(value) => void setDeviceSetting({ deviceId: device.id, key: 'pollingRate', value: Number(value) })}>
            {[125, 250, 500, 1000, 2000, 4000].map((rate) => <option key={rate} value={rate}>{rate} Hz</option>)}
          </SelectField>
        </div>
        <div className="mt-4 text-[10px] leading-4 text-[#626b76]">The module advertises supported rates. Unsupported options never appear in the renderer.</div>
      </Surface>

      <Surface className="col-span-7 p-5">
        <SectionHeading eyebrow="Buttons" title="Assignments" description="A compact preview of the shared button mapping capability." />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Primary', 'Left click'],
            ['Secondary', 'Right click'],
            ['Wheel', 'Middle click'],
            ['G4', 'Back'],
            ['G5', 'Forward'],
            ['DPI Shift', '800 DPI'],
          ].map(([button, action]) => (
            <button key={button} type="button" className="flex items-center justify-between rounded-[7px] border border-[var(--border)] bg-[#15181d] px-3 py-2.5 text-left hover:border-[#39414b]">
              <span className="text-[10px] font-semibold text-[#777f8a]">{button}</span>
              <span className="text-[11px] text-[#d0d4d9]">{action}</span>
            </button>
          ))}
        </div>
      </Surface>

      <Surface className="col-span-5 p-5">
        <SectionHeading eyebrow="Hardware" title="Device behavior" />
        <div className="mt-2 divide-y divide-[var(--border)]">
          <SettingSwitch icon={Crosshair} label="Onboard memory" description="Keep the active profile on the mouse." checked={onboardMemory} onChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'onboardMemory', value: checked })} />
          <SettingSwitch icon={Lightbulb} label="Lighting" description="Off saves battery and avoids an idle RGB worker." checked={lightingEnabled} onChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'lightingEnabled', value: checked })} />
        </div>
      </Surface>
    </div>
  );
}

function MicrophoneControls({ device }: { device: Device }) {
  const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
  const gain = asNumber(device.settings.gain, 58);
  const monitoring = asNumber(device.settings.monitoring, 18);
  const muteLed = asBoolean(device.settings.muteLed, true);
  const lightingEnabled = asBoolean(device.settings.lightingEnabled, true);
  const color = asString(device.settings.lightingColor, '#ff4f7d');

  return (
    <div className="grid grid-cols-12 gap-4">
      <Surface className="col-span-7 p-5">
        <SectionHeading eyebrow="Input" title="Microphone level" description="Raw hardware controls stay in the HyperX module. DSP belongs to the optional audio engine." />
        <div className="mt-6 grid grid-cols-2 gap-8">
          <LevelControl label="Input gain" value={gain} onChange={(value) => void setDeviceSetting({ deviceId: device.id, key: 'gain', value })} />
          <LevelControl label="Direct monitoring" value={monitoring} onChange={(value) => void setDeviceSetting({ deviceId: device.id, key: 'monitoring', value })} />
        </div>
        <div className="mt-6 flex items-center gap-4 rounded-[8px] border border-[var(--border)] bg-[#15181d] p-3">
          <div className="flex-1">
            <div className="text-[11px] font-medium text-[#d4d8dd]">Live input meter</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#292e36]"><div className="h-full w-[68%] bg-[var(--success)]" /></div>
          </div>
          <span className="text-[11px] tabular-nums text-[#7d8691]">−8.4 dB</span>
        </div>
      </Surface>

      <Surface className="col-span-5 p-5">
        <SectionHeading eyebrow="Lighting" title="Status ring" description="No separate RGB runtime is needed for static state." />
        <div className="mt-5 flex items-center gap-4 rounded-[8px] border border-[var(--border)] bg-[#15181d] p-4">
          <div className="grid size-16 place-items-center rounded-full border-[6px] border-[#2b3038]" style={{ boxShadow: lightingEnabled ? `inset 0 0 0 4px ${color}` : undefined }}>
            <Mic2Glyph />
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-medium text-[#d9dce0]">Active color</div>
            <div className="mt-3 flex items-center gap-2">
              <input type="color" value={color} onChange={(event) => void setDeviceSetting({ deviceId: device.id, key: 'lightingColor', value: event.target.value })} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" />
              <span className="text-[11px] uppercase tabular-nums text-[#808994]">{color}</span>
            </div>
          </div>
        </div>
      </Surface>

      <Surface className="col-span-12 p-5">
        <SectionHeading eyebrow="Behavior" title="Hardware state" />
        <div className="mt-2 grid grid-cols-2 gap-x-8 divide-x divide-[var(--border)]">
          <SettingSwitch icon={Lightbulb} label="Lighting enabled" description="Allow the microphone module to update the ring." checked={lightingEnabled} onChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'lightingEnabled', value: checked })} />
          <div className="pl-8"><SettingSwitch icon={Check} label="Mute LED follows state" description="Mirror tap-to-mute state without polling." checked={muteLed} onChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'muteLed', value: checked })} /></div>
        </div>
      </Surface>
    </div>
  );
}

function HeaderStat({ icon: Icon, label, value }: { icon: typeof Cable; label: string; value: string }) {
  return <div><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-[#59626d]"><Icon className="size-3" /> {label}</div><div className="mt-1 text-[11px] font-medium capitalize text-[#c5cad0]">{value}</div></div>;
}

function SettingSwitch({ icon: Icon, label, description, checked, onChange }: { icon: typeof Cable; label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Icon className="size-[15px] text-[#6e7783]" />
      <div className="min-w-0 flex-1"><div className="text-[12px] font-medium text-[#d6dade]">{label}</div><div className="mt-0.5 text-[10px] text-[#626b76]">{description}</div></div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LevelControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between"><span className="text-[11px] font-medium text-[#89919c]">{label}</span><span className="text-[22px] font-semibold tabular-nums tracking-[-0.04em] text-[#eef0f2]">{value}<span className="ml-1 text-[10px] font-normal text-[#626b76]">%</span></span></div>
      <Slider className="mt-4" min={0} max={100} step={1} value={[value]} onValueChange={([next]) => typeof next === 'number' && onChange(next)} />
    </div>
  );
}

function Mic2Glyph() {
  return <div className="h-7 w-3.5 rounded-full border-2 border-[#7d8691]" />;
}

function asNumber(value: DeviceSettingValue | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
function asBoolean(value: DeviceSettingValue | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function asString(value: DeviceSettingValue | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
function asNumberArray(value: DeviceSettingValue | undefined, fallback: number[]): number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number') ? value : fallback;
}
