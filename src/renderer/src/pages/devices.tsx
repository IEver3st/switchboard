import { ArrowLeft, BatteryCharging, Cable, Check, Crosshair, Lightbulb, Usb } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Device, DeviceControlBinding, DeviceSettingValue, SystemSnapshot } from '../../../shared/contracts';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { DeviceRender } from '@/components/shared/device-render';
import { SelectField } from '@/components/shared/controls';
import { SectionHeading, StatusDot } from '@/components/shared/surface';
import { cn } from '@/lib/cn';
import { formatMb } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

export function DevicesPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const selectedDeviceId = useSystemStore((state) => state.selectedDeviceId);
  const selectDevice = useSystemStore((state) => state.selectDevice);
  const clearDeviceSelection = useSystemStore((state) => state.clearDeviceSelection);
  const selected = snapshot.devices.find((device) => device.id === selectedDeviceId);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const deviceButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusDeviceId = useRef<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (selected) {
        backButtonRef.current?.focus();
        return;
      }
      const deviceId = returnFocusDeviceId.current;
      if (!deviceId) return;
      deviceButtonRefs.current.get(deviceId)?.focus();
      returnFocusDeviceId.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [selected]);

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
        <div className="device-gallery-stage">
          <ul className="device-gallery" aria-label="Switchboard devices">
            {snapshot.devices.map((device) => (
              <li key={device.id} className="device-gallery__entry" data-connected={device.connected} data-kind={device.kind}>
                <button
                  ref={(node) => {
                    if (node) deviceButtonRefs.current.set(device.id, node);
                    else deviceButtonRefs.current.delete(device.id);
                  }}
                  type="button"
                  onClick={() => {
                    returnFocusDeviceId.current = device.id;
                    selectDevice(device.id);
                  }}
                  className="device-gallery__item"
                  aria-label={`Open controls for ${device.identity.manufacturer ?? ''} ${device.displayName}`.trim()}
                >
                  <DeviceRender device={device} density="gallery" />
                  <span className="device-gallery__copy">
                    <span className="device-gallery__name">{device.displayName}</span>
                    <span className="device-gallery__status">
                      <span className={cn('device-gallery__status-dot', device.connected && 'is-connected')} aria-hidden />
                      <span>{device.connected ? 'Connected' : 'Disconnected'}</span>
                      {device.kind === 'mouse' && typeof device.batteryPercent === 'number' ? (
                        <><span aria-hidden>·</span><span className="tabular-nums">{Math.round(device.batteryPercent)}%</span></>
                      ) : null}
                      {device.kind === 'microphone' && device.identity.connection ? (
                        <><span aria-hidden>·</span><span className="uppercase">{device.identity.connection}</span></>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <RuntimeStatus snapshot={snapshot} />
      </div>
    );
  }

  return (
    <div className="device-workbench">
      <div className="device-workbench__toolbar">
        <button
          ref={backButtonRef}
          type="button"
          className="device-workbench__back"
          onClick={() => {
            returnFocusDeviceId.current = selected.id;
            clearDeviceSelection();
          }}
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          All devices
        </button>
        <div className="device-workbench__identity">
          <h2>{selected.displayName}</h2>
          <div className="device-workbench__meta">
            <StatusDot active={selected.connected} />
            <span>{selected.identity.manufacturer ?? 'Unknown manufacturer'}</span>
            <span aria-hidden>·</span>
            <span className="capitalize">{selected.identity.connection ?? 'unknown'}</span>
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

      {selected.kind === 'mouse' ? (
        <MouseStage device={selected} />
      ) : (
        <div className="device-workbench__hero">
          <DeviceRender device={selected} density="hero" />
        </div>
      )}

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

function MouseStage({ device }: { device: Device }) {
  const bindings = device.capabilities.includes('buttons') ? (device.controlBindings ?? []) : [];
  const leftBindings = bindings.filter((binding) => binding.side === 'left').sort(compareBindingOrder);
  const rightBindings = bindings.filter((binding) => binding.side === 'right').sort(compareBindingOrder);

  return (
    <section className="mouse-stage" aria-label={`${device.displayName} button assignments`}>
      <div className="mouse-stage__callouts mouse-stage__callouts--left">
        {leftBindings.map((binding) => <MouseCallout key={binding.id} binding={binding} />)}
      </div>
      <DeviceRender device={device} density="hero" className="mouse-stage__render" />
      <div className="mouse-stage__callouts mouse-stage__callouts--right">
        {rightBindings.map((binding) => <MouseCallout key={binding.id} binding={binding} />)}
      </div>
    </section>
  );
}

function RuntimeStatus({ snapshot }: { snapshot: SystemSnapshot }) {
  const connected = snapshot.devices.filter((device) => device.connected).length;
  const audioState = snapshot.engines.find((engine) => engine.kind === 'audio')?.state ?? 'stopped';
  const replayState = snapshot.capture.runtime.state;
  return (
    <footer className="device-runtime" aria-label="Runtime status">
      <span>{connected} {connected === 1 ? 'device' : 'devices'} connected</span>
      <span aria-hidden className="device-runtime__divider" />
      <span>Audio {snapshot.audio.enabled ? audioState : 'off'}</span>
      <span aria-hidden className="device-runtime__divider" />
      <span>Replay {snapshot.capture.config.enabled ? replayState : 'off'}</span>
      <span aria-hidden className="device-runtime__divider" />
      <span className="tabular-nums">{formatMb(snapshot.performance.totalMemoryMb)} · {snapshot.performance.totalCpuPercent.toFixed(1)}% CPU</span>
    </footer>
  );
}

function MouseCallout({ binding }: { binding: DeviceControlBinding }) {
  return (
    <div className="mouse-callout">
      <span className="mouse-callout__copy">
        <span className="mouse-callout__label">{binding.label}</span>
        <span className="mouse-callout__assignment">{binding.assignment}</span>
      </span>
      <span className="mouse-callout__line" aria-hidden />
    </div>
  );
}

function compareBindingOrder(left: DeviceControlBinding, right: DeviceControlBinding): number {
  return left.order - right.order;
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
      <SectionHeading title="Sensitivity and behavior" />
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
