import { ArrowLeft, BatteryCharging, Cable, Check, Crosshair, Lightbulb, RotateCcw, Usb } from 'lucide-react';
import type { Device, DeviceSettingValue, SystemSnapshot } from '../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { DeviceRender } from '@/components/shared/device-render';
import { SelectField } from '@/components/shared/controls';
import { SectionHeading, StatusDot } from '@/components/shared/surface';
import { cn } from '@/lib/cn';
import { useSystemStore } from '@/stores/use-system-store';

export function DevicesPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const selectedDeviceId = useSystemStore((state) => state.selectedDeviceId);
  const selectDevice = useSystemStore((state) => state.selectDevice);
  const clearDeviceSelection = useSystemStore((state) => state.clearDeviceSelection);
  const selected = snapshot.devices.find((device) => device.id === selectedDeviceId);

  if (snapshot.devices.length === 0) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <div className="text-center">
          <Usb className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No supported devices detected</p>
          <p className="mt-1 text-xs text-muted-foreground">Install a device module and connect hardware to see it here.</p>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="device-gallery-page">
        <div className="device-gallery" role="list" aria-label="Connected devices">
          {snapshot.devices.map((device) => (
            <button
              key={device.id}
              type="button"
              role="listitem"
              onClick={() => selectDevice(device.id)}
              className="device-gallery__item"
              aria-label={`Open controls for ${device.vendor} ${device.name}`}
            >
              <DeviceRender device={device} density="gallery" />
              <span className="device-gallery__name">{device.name}</span>
              <span className="sr-only">{device.connected ? 'Connected' : 'Disconnected'}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="device-workbench">
      <button type="button" className="device-workbench__back" onClick={clearDeviceSelection}>
        <ArrowLeft aria-hidden className="size-3.5" />
        All devices
      </button>

      <div className="device-workbench__hero">
        <DeviceRender device={selected} density="hero" />
        <div className="device-workbench__identity">
          <h2>{selected.name}</h2>
          <div className="device-workbench__meta">
            <StatusDot active={selected.connected} />
            <span>{selected.vendor}</span>
            <span aria-hidden>·</span>
            <span className="capitalize">{selected.connection ?? 'unknown'}</span>
            {typeof selected.batteryPercent === 'number' ? (
              <>
                <span aria-hidden>·</span>
                <BatteryCharging aria-hidden className="size-3" />
                <span className="tabular-nums">{selected.batteryPercent}%</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="device-workbench__controls">
        {selected.kind === 'mouse' ? <MouseControls device={selected} /> : null}
        {selected.kind === 'microphone' ? <MicrophoneControls device={selected} /> : null}
        {selected.kind !== 'mouse' && selected.kind !== 'microphone' ? (
          <p className="py-8 text-center text-xs text-muted-foreground">This device does not expose a control surface yet.</p>
        ) : null}
      </div>
    </div>
  );
}

function MouseControls({ device }: { device: Device }) {
  const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
  const activeDpi = asNumber(device.settings.activeDpi, 1600);
  const stages = asNumberArray(device.settings.dpiStages, [800, 1600, 3200]);
  const pollingRate = asNumber(device.settings.pollingRate, 1000);
  const onboardMemory = asBoolean(device.settings.onboardMemory, true);
  const lightingEnabled = asBoolean(device.settings.lightingEnabled, false);
  const lightingColor = asString(device.settings.lightingColor, '#ff658a');

  return (
    <section className="device-controls">
      <SectionHeading
        eyebrow="Mouse controls"
        title="Sensitivity and behavior"
        description="Stages are stored by the Logitech HID++ module and rendered by the shared mouse capability UI."
        action={
          <Button size="sm" variant="ghost">
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        }
      />
      <div className="device-controls__grid mt-6 grid grid-cols-12 gap-x-8 gap-y-6">
        <div className="device-controls__primary col-span-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active DPI</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums tracking-[-0.04em] text-foreground">{activeDpi}</span>
              <span className="text-[10px] text-muted-foreground">DPI</span>
            </div>
          </div>
          <Slider
            className="mt-4"
            min={100}
            max={25600}
            step={50}
            value={[activeDpi]}
            aria-label="Active DPI"
            onValueCommit={([value]) => value && void setDeviceSetting({ deviceId: device.id, key: 'activeDpi', value })}
            onValueChange={([value]) => value && void setDeviceSetting({ deviceId: device.id, key: 'activeDpi', value })}
          />
          <div className="mt-2 flex justify-between text-[9px] tabular-nums text-muted-foreground/60">
            <span>100</span>
            <span>25,600</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {stages.map((stage) => (
              <button
                key={stage}
                type="button"
                onClick={() => void setDeviceSetting({ deviceId: device.id, key: 'activeDpi', value: stage })}
                aria-pressed={stage === activeDpi}
                className={cn(
                  'h-9 rounded-md border text-xs font-semibold tabular-nums transition-colors',
                  stage === activeDpi ? 'border-primary/45 bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground hover:border-input',
                )}
              >
                {stage}
              </button>
            ))}
          </div>
        </div>

        <div className="device-controls__secondary col-span-3 border-l border-border pl-8">
          <div className="text-xs font-medium text-muted-foreground">Report rate</div>
          <div className="mt-3">
            <SelectField
              value={String(pollingRate)}
              onChange={(value) => void setDeviceSetting({ deviceId: device.id, key: 'pollingRate', value: Number(value) })}
              ariaLabel="Polling rate"
              options={[125, 250, 500, 1000, 2000, 4000].map((rate) => ({ value: String(rate), label: `${rate} Hz` }))}
            />
          </div>
          <p className="mt-3 text-[10px] leading-4 text-muted-foreground/70">The module advertises supported rates. Unsupported options never appear.</p>
        </div>

        <div className="device-controls__secondary col-span-3 divide-y divide-border border-l border-border pl-8">
          <SettingSwitch icon={Crosshair} label="Onboard memory" checked={onboardMemory} onChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'onboardMemory', value: checked })} />
          <SettingSwitch icon={Lightbulb} label="Lighting" checked={lightingEnabled} onChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'lightingEnabled', value: checked })} />
          <div className="flex items-center gap-3 py-2.5">
            <span className="flex-1 text-xs font-medium text-foreground">Lighting color</span>
            <input
              type="color"
              value={lightingColor}
              aria-label="Mouse lighting color"
              disabled={!lightingEnabled}
              onChange={(event) => void setDeviceSetting({ deviceId: device.id, key: 'lightingColor', value: event.target.value })}
              className="size-7 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
        </div>
      </div>

      <div className="device-controls__assignments mt-6 border-t border-border pt-5">
        <div className="mb-3 text-xs font-medium text-muted-foreground">Button assignments</div>
        <div className="grid grid-cols-6 gap-2">
          {[
            ['Primary', 'Left click'],
            ['Secondary', 'Right click'],
            ['Wheel', 'Middle click'],
            ['G4', 'Back'],
            ['G5', 'Forward'],
            ['DPI Shift', '800 DPI'],
          ].map(([button, action]) => (
            <button key={button} type="button" className="rounded-md border border-border bg-muted px-3 py-2.5 text-left transition-colors hover:border-input">
              <div className="text-[10px] font-semibold text-muted-foreground">{button}</div>
              <div className="mt-0.5 text-[11px] text-foreground">{action}</div>
            </button>
          ))}
        </div>
      </div>
    </section>
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
    <section className="device-controls">
      <SectionHeading eyebrow="Microphone controls" title="Input level and status ring" description="Raw hardware controls stay in the HyperX module. DSP belongs to the optional audio engine." />
      <div className="device-controls__grid mt-6 grid grid-cols-12 gap-x-8 gap-y-6">
        <div className="device-controls__primary col-span-4">
          <LevelControl label="Input gain" value={gain} onChange={(value) => void setDeviceSetting({ deviceId: device.id, key: 'gain', value })} />
        </div>
        <div className="device-controls__secondary col-span-4 border-l border-border pl-8">
          <LevelControl label="Direct monitoring" value={monitoring} onChange={(value) => void setDeviceSetting({ deviceId: device.id, key: 'monitoring', value })} />
        </div>
        <div className="device-controls__secondary col-span-4 border-l border-border pl-8">
          <div className="text-xs font-medium text-muted-foreground">Status ring</div>
          <div className="mt-3 flex items-center gap-3">
            <input
              type="color"
              value={color}
              aria-label="Ring color"
              onChange={(event) => void setDeviceSetting({ deviceId: device.id, key: 'lightingColor', value: event.target.value })}
              className="size-8 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="text-[11px] uppercase tabular-nums text-muted-foreground">{color}</span>
          </div>
          <div className="mt-4 divide-y divide-border">
            <SettingSwitch icon={Lightbulb} label="Lighting" checked={lightingEnabled} onChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'lightingEnabled', value: checked })} />
            <SettingSwitch icon={Check} label="Mute LED follows state" checked={muteLed} onChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'muteLed', value: checked })} />
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-4 border-t border-border pt-5">
        <div className="flex-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-foreground">Live input meter</span>
            <span className="tabular-nums text-muted-foreground">−8.4 dB</span>
          </div>
          <div className="meter-bar mt-2 h-1.5 rounded-full" style={{ ['--meter' as string]: '68%' }} />
        </div>
      </div>
    </section>
  );
}

function SettingSwitch({ icon: Icon, label, checked, onChange }: { icon: typeof Cable; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <Icon className="size-[15px] text-muted-foreground" />
      <span className="flex-1 text-xs font-medium text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function LevelControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums tracking-[-0.04em] text-foreground">
          {value}
          <span className="ml-1 text-[10px] font-normal text-muted-foreground">%</span>
        </span>
      </div>
      <Slider className="mt-4" min={0} max={100} step={1} value={[value]} aria-label={label} onValueChange={([next]) => typeof next === 'number' && onChange(next)} />
    </div>
  );
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
