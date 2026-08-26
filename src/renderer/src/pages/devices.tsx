import { ArrowLeft, Cable, Check, Lightbulb, Usb } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Device, DeviceSettingValue, SystemSnapshot } from '../../../shared/contracts';
import { BatteryStatus } from '@/components/device-controls/BatteryStatus';
import { MouseDeviceEditor } from '@/components/device-controls/MouseDeviceEditor';
import { DeviceRender } from '@/components/shared/device-render';
import { SectionHeading, StatusDot } from '@/components/shared/surface';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
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
                    {device.capabilities.battery ? (
                      <BatteryStatus
                        battery={device.capabilities.battery}
                        connectionLabel={device.identity.connection === 'wireless' ? 'Wireless' : connectionLabel(device)}
                        connected={device.connected}
                      />
                    ) : (
                      <span className="device-gallery__status">{device.connected ? connectionLabel(device) : 'Disconnected'}</span>
                    )}
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
            <span>{selected.connected ? 'Connected' : 'Disconnected'}</span>
            <span aria-hidden>·</span>
            <span>{connectionLabel(selected)}</span>
          </div>
        </div>
        {selected.capabilities.battery ? (
          <BatteryStatus
            battery={selected.capabilities.battery}
            connected={selected.connected}
            connectionLabel="Battery"
            variant="header"
            className="device-workbench__battery"
          />
        ) : null}
      </div>

      {selected.kind === 'mouse' ? (
        <MouseDeviceEditor device={selected} />
      ) : (
        <>
          <div className="device-workbench__hero">
            <DeviceRender device={selected} density="hero" />
          </div>
          <div className="device-workbench__controls">
            {selected.kind === 'microphone' ? <MicrophoneControls device={selected} /> : (
              <p className="py-8 text-center text-xs text-muted-foreground">This device does not expose a control surface yet.</p>
            )}
          </div>
        </>
      )}
    </div>
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

function connectionLabel(device: Device): string {
  return device.identity.connectionLabel
    ?? (device.identity.connection === 'wireless' ? 'Wireless' : device.identity.connection?.toUpperCase())
    ?? 'Unknown connection';
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
