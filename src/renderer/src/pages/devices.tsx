import { ArrowLeft, Usb } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Device, DeviceSettingValue, SystemSnapshot } from '../../../shared/contracts';
import { BatteryStatus } from '@/components/device-controls/BatteryStatus';
import { MouseDeviceEditor } from '@/components/device-controls/MouseDeviceEditor';
import { KeyboardDeviceEditor } from '@/components/device-controls/KeyboardDeviceEditor';
import { HorizontalLevelMeter } from '@/components/audio/HorizontalLevelMeter';
import { PrimarySlider, SemanticChoice, SettingToggle } from '@/components/shared/human-controls';
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
            variant="header"
            className="device-workbench__battery"
          />
        ) : null}
      </div>

      {selected.kind === 'mouse' ? (
        <MouseDeviceEditor device={selected} />
      ) : selected.kind === 'keyboard' ? (
        <KeyboardDeviceEditor device={selected} />
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
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const gain = asNumber(device.settings.gain, 58);
  const monitoring = asNumber(device.settings.monitoring, 18);
  const lighting = device.capabilities.lighting;
  const muteState = device.capabilities.muteState;
  const muted = muteState?.muted ?? null;
  const lightingDisabled = !device.connected || !lighting?.writable;
  const engineRunning = snapshot.engines.find((candidate) => candidate.kind === 'audio')?.state === 'running';
  const microphoneBusEnabled = snapshot.audio.mixes.find((mix) => mix.id === 'personal')?.buses.find((candidate) => candidate.id === 'mic')?.enabled ?? false;

  return (
    <section className="device-controls microphone-hardware" aria-labelledby="microphone-hardware-heading">
      <header className="microphone-hardware__heading">
        <div>
          <h3 id="microphone-hardware-heading">Microphone controls</h3>
          <p>Audio processing is configured in Audio &gt; Microphone.</p>
        </div>
        <div className="microphone-hardware__state" aria-live="polite">
          <HardwareState
            tone={muted === null ? 'unknown' : muted ? 'muted' : 'live'}
            label={muted === null ? 'Mute state unknown' : muted ? 'Muted' : 'Microphone live'}
            detail={muteState?.unavailableReason ?? 'Physical touch sensor'}
          />
          {lighting ? (
            <HardwareState
              tone={lighting.state === 'maintained' ? 'live' : 'unknown'}
              label={lighting.state === 'maintained' ? 'Lighting maintained' : 'Lighting state unknown'}
              detail={lighting.state === 'maintained' ? 'No hardware readback' : (lighting.stateReason ?? 'Waiting for hardware')}
            />
          ) : null}
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

      {lighting ? (
        <div className="microphone-hardware__lighting">
          <div className="microphone-hardware__lighting-topline">
            <SettingToggle
              title="Lighting"
              description="Maintains the microphone's fixed-red status light."
              checked={lighting.enabled}
              disabled={lightingDisabled}
              onCheckedChange={(enabled) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-enabled', enabled } })}
            />
            <div className="microphone-hardware__color">
              <span>Color</span>
              <strong><i style={{ backgroundColor: '#f20000' }} aria-hidden /> Fixed red</strong>
            </div>
          </div>

          {lighting.profiles.length > 0 ? (
            <div className="microphone-hardware__choice-row">
              <span>Profile</span>
              <SemanticChoice
                label="Lighting profile"
                value={lighting.activeProfileId ?? 'custom'}
                options={lighting.profiles.map((profile) => ({ value: profile.id, label: profile.label }))}
                customIsOption
                disabled={lightingDisabled}
                onChange={(profileId) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-profile', profileId } })}
              />
            </div>
          ) : null}

          <div className="microphone-hardware__choice-row">
            <span>Pattern</span>
            <SemanticChoice
              label="Lighting pattern"
              value={lighting.activeEffectId}
              options={lighting.availableEffects.map((effect) => ({ value: effect.id, label: effect.label }))}
              disabled={lightingDisabled || !lighting.enabled}
              onChange={(effectId) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-effect', effectId } })}
            />
          </div>

          <div className="microphone-hardware__lighting-sliders">
            <PrimarySlider
              label="Brightness"
              value={lighting.brightness ?? 72}
              min={0}
              max={100}
              step={1}
              unit="%"
              disabled={lightingDisabled || !lighting.enabled || !lighting.brightnessWritable}
              onCommit={(brightness) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-brightness', brightness } })}
            />
            <PrimarySlider
              label="Effect speed"
              value={lighting.speed ?? 50}
              min={1}
              max={100}
              step={1}
              unit="%"
              disabled={lightingDisabled || !lighting.enabled || !lighting.speedWritable || lighting.activeEffectId === 'solid'}
              onCommit={(speed) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-speed', speed } })}
            />
          </div>

          {device.capabilities.mute && lighting.muteLinkedWritable ? (
            <SettingToggle
              title="Follow physical mute"
              description="Turns the maintained red light off when the touch sensor reports muted."
              checked={lighting.muteLinked}
              disabled={lightingDisabled}
              onCheckedChange={(enabled) => void setDeviceControl({ deviceId: device.id, change: { type: 'microphone-mute-lighting', enabled } })}
            />
          ) : null}
          {lighting.state === 'unknown' && lighting.stateReason ? (
            <p className="microphone-hardware__lighting-error" role="status">{lighting.stateReason}</p>
          ) : null}
        </div>
      ) : null}

      <HorizontalLevelMeter
        busId="mic"
        active={Boolean(engineRunning && microphoneBusEnabled && snapshot.audio.capabilities.realtimeMetering === 'available')}
        inactiveLabel={snapshot.audio.capabilities.realtimeMetering === 'simulation' ? 'Live level unavailable' : 'Audio off'}
        label="Input level"
      />
    </section>
  );
}

function HardwareState({
  tone,
  label,
  detail,
}: {
  tone: 'live' | 'muted' | 'unknown';
  label: string;
  detail: string;
}) {
  return (
    <div className="microphone-state">
      <i className="microphone-state__dot" data-tone={tone} aria-hidden />
      <span><strong>{label}</strong><small>{detail}</small></span>
    </div>
  );
}

function asNumber(value: DeviceSettingValue | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
