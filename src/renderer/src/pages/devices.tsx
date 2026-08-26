import { ArrowLeft, Usb } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Device, DeviceSettingValue, SystemSnapshot } from '../../../shared/contracts';
import { BatteryStatus } from '@/components/device-controls/BatteryStatus';
import { MouseDeviceEditor } from '@/components/device-controls/MouseDeviceEditor';
import { HorizontalLevelMeter } from '@/components/audio/HorizontalLevelMeter';
import { PrimarySlider, SettingToggle } from '@/components/shared/human-controls';
import { DeviceRender } from '@/components/shared/device-render';
import { StatusDot } from '@/components/shared/surface';
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
      </div>
    );
  }

  return (
    <div className="device-workbench" data-device-kind={selected.kind}>
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
            {selected.kind === 'microphone' ? <MicrophoneControls device={selected} snapshot={snapshot} /> : (
              <p className="py-8 text-center text-xs text-muted-foreground">This device does not expose a control surface yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function connectionLabel(device: Device): string {
  return device.identity.connectionLabel
    ?? (device.identity.connection === 'wireless' ? 'Wireless' : device.identity.connection?.toUpperCase())
    ?? 'Unknown connection';
}

function MicrophoneControls({ device, snapshot }: { device: Device; snapshot: SystemSnapshot }) {
  const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
  const gain = asNumber(device.settings.gain, 58);
  const monitoring = asNumber(device.settings.monitoring, 18);
  const muteLed = asBoolean(device.settings.muteLed, true);
  const lightingEnabled = asBoolean(device.settings.lightingEnabled, true);
  const lighting = device.capabilities.lighting;
  const color = lighting?.color ?? asString(device.settings.lightingColor, '#ff4f7d');
  const engineRunning = snapshot.engines.find((candidate) => candidate.kind === 'audio')?.state === 'running';
  const microphoneBusEnabled = snapshot.audio.buses.find((candidate) => candidate.id === 'mic')?.enabled ?? false;

  return (
    <section className="device-controls microphone-hardware" aria-labelledby="microphone-hardware-heading">
      <header className="microphone-hardware__heading">
        <div>
          <h3 id="microphone-hardware-heading">Microphone controls</h3>
          <p>Audio processing is configured in Audio &gt; Microphone.</p>
        </div>
      </header>

      <div className="microphone-hardware__primary">
        {device.capabilities.gain ? (
          <PrimarySlider
            label="Input volume"
            value={gain}
            min={0}
            max={100}
            step={1}
            unit="%"
            onCommit={(value) => void setDeviceSetting({ deviceId: device.id, key: 'gain', value })}
          />
        ) : null}
        {device.capabilities.monitoring ? (
          <PrimarySlider
            label="Direct monitoring"
            description="Hear your microphone without software delay."
            value={monitoring}
            min={0}
            max={100}
            step={1}
            unit="%"
            onCommit={(value) => void setDeviceSetting({ deviceId: device.id, key: 'monitoring', value })}
          />
        ) : null}
      </div>

      <div className="microphone-hardware__secondary">
        {lighting ? (
          <div className="microphone-hardware__lighting">
            <SettingToggle
              title="Lighting"
              description={lighting.writable ? 'Controls the microphone status light.' : 'This microphone uses its built-in lighting.'}
              checked={lightingEnabled}
              disabled={!lighting.writable}
              onCheckedChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'lightingEnabled', value: checked })}
            />
            {lighting.color ? (
              <div className="microphone-hardware__color">
                <span>Color</span>
                <strong><i style={{ backgroundColor: color }} aria-hidden /> {friendlyColorName(color)}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
        {device.capabilities.mute ? (
          <SettingToggle
            title="Mute light follows microphone state"
            description="Shows when the microphone is muted."
            checked={muteLed}
            onCheckedChange={(checked) => void setDeviceSetting({ deviceId: device.id, key: 'muteLed', value: checked })}
          />
        ) : null}
      </div>

      <HorizontalLevelMeter
        busId="mic"
        active={Boolean(engineRunning && microphoneBusEnabled && snapshot.audio.capabilities.realtimeMetering === 'available')}
        inactiveLabel={snapshot.audio.capabilities.realtimeMetering === 'simulation' ? 'Live level unavailable' : 'Audio off'}
        label="Input level"
      />
    </section>
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

function friendlyColorName(color: string): string {
  const normalized = color.toLowerCase();
  if (normalized === '#ff4f7d' || normalized === '#ff658a') return 'Pink';
  if (normalized === '#f20000' || normalized === '#ff0000') return 'Red';
  return 'Custom color';
}
