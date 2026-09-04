import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import type { Device, DeviceSettingValue, SystemSnapshot } from '../../../../shared/contracts';
import { HorizontalLevelMeter } from '@/components/audio/HorizontalLevelMeter';
import { SemanticChoice } from '@/components/shared/human-controls';
import { DeviceRender } from '@/components/shared/device-render';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSystemStore } from '@/stores/use-system-store';
import './equipment-workbench.css';

export function MicrophoneDeviceEditor({ device, snapshot }: { device: Device; snapshot: SystemSnapshot }) {
  const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const pending = useSystemStore((state) => state.pendingDeviceIds.includes(device.id));
  const refreshDevices = useSystemStore((state) => state.refreshDevices);
  const gain = asNumber(device.settings.gain, 58);
  const monitoring = asNumber(device.settings.monitoring, 18);
  const lighting = device.capabilities.lighting;
  const muteState = device.capabilities.muteState;
  const muted = device.connected ? muteState?.muted ?? null : null;
  const lightingDisabled = pending || !device.connected || !lighting?.writable;
  const lightingSupportsSpeed = Boolean(lighting?.speedWritable && lighting.activeEffectId !== 'solid');
  const engineRunning = snapshot.engines.find((candidate) => candidate.kind === 'audio')?.state === 'running';
  const microphoneBusEnabled = snapshot.audio.mixes.find((mix) => mix.id === 'personal')?.buses.find((candidate) => candidate.id === 'mic')?.enabled ?? false;

  return (
    <section className="device-controls microphone-hardware" aria-labelledby="microphone-hardware-heading" aria-busy={pending}>
      <div className="microphone-stage" aria-label="Microphone preview">
        <DeviceRender device={device} density="hero" />
      </div>
      <header className="microphone-hardware__heading">
        <h3 id="microphone-hardware-heading">Input &amp; monitoring</h3>
        <div className="microphone-hardware__state" aria-live="polite">
          <HardwareState
            tone={muted === null ? 'unknown' : muted ? 'muted' : 'live'}
            label={muted === null ? 'Mute unknown' : muted ? 'Muted' : 'Unmuted'}
            detail={muteState?.unavailableReason ?? 'Physical touch sensor'}
          />
          {lighting ? (
            <HardwareState
              tone={lighting.enabled && lighting.state === 'maintained' ? 'live' : 'unknown'}
              label={!lighting.enabled ? 'Lighting off' : lighting.state === 'maintained' ? 'Lighting maintained' : 'Lighting unknown'}
              detail={!lighting.enabled ? 'Maintained lighting is disabled' : lighting.state === 'maintained' ? 'No hardware readback' : (lighting.stateReason ?? 'Waiting for hardware')}
            />
          ) : null}
        </div>
      </header>

      <div className="microphone-hardware__primary">
        {!device.connected ? <p className="equipment-unavailable" role="status">Reconnect the microphone to change settings.</p> : null}
        {device.capabilities.gain ? (
          <MicrophoneSlider
            label="Input volume"
            disabled={!device.connected || pending}
            value={gain}
            min={0}
            max={100}
            step={1}
            unit="%"
            onCommit={(value) => setDeviceSetting({ deviceId: device.id, key: 'gain', value })}
          />
        ) : null}
        {device.capabilities.monitoring ? (
          <MicrophoneSlider
            label="Direct monitoring"
            disabled={!device.connected || pending}
            value={monitoring}
            min={0}
            max={100}
            step={1}
            unit="%"
            onCommit={(value) => setDeviceSetting({ deviceId: device.id, key: 'monitoring', value })}
          />
        ) : null}
      </div>

      {lighting ? (
        <section className="microphone-hardware__lighting" aria-labelledby="microphone-lighting-heading">
          <div className="microphone-hardware__lighting-topline">
            <div className="microphone-hardware__lighting-identity">
              <h3 id="microphone-lighting-heading">Lighting</h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="microphone-hardware__color" tabIndex={0} aria-label="Fixed red lighting color">
                    <i style={{ backgroundColor: '#f20000' }} aria-hidden />
                    <span>Fixed red</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>The QuadCast 2 lighting LEDs are red; color writes are not supported.</TooltipContent>
              </Tooltip>
            </div>
            <div className="microphone-switch-state">
              <span>{lighting.enabled ? 'On' : 'Off'}</span>
              <Switch
                id={`lighting-${device.id}`}
                checked={lighting.enabled}
                disabled={lightingDisabled}
                aria-label="Lighting"
                onCheckedChange={(enabled) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-enabled', enabled } })}
              />
            </div>
          </div>

          <div className="microphone-hardware__choices">
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
          </div>

          <div className="microphone-hardware__lighting-sliders" data-single={!lightingSupportsSpeed}>
            <MicrophoneSlider
              label="Brightness"
              value={lighting.brightness ?? 72}
              min={0}
              max={100}
              step={1}
              unit="%"
              disabled={lightingDisabled || !lighting.enabled || !lighting.brightnessWritable}
              onCommit={(brightness) => setDeviceControl({ deviceId: device.id, change: { type: 'lighting-brightness', brightness } })}
            />
            {lightingSupportsSpeed ? (
              <MicrophoneSlider
                label="Effect speed"
                value={lighting.speed ?? 50}
                min={1}
                max={100}
                step={1}
                unit="%"
                disabled={lightingDisabled || !lighting.enabled}
                onCommit={(speed) => setDeviceControl({ deviceId: device.id, change: { type: 'lighting-speed', speed } })}
              />
            ) : null}
          </div>
          {!lighting.writable || lighting.state === 'unknown' ? (
            <div className="equipment-unavailable" role="status">
              <p>{lighting.unavailableReason ?? lighting.stateReason ?? 'Lighting controls are unavailable.'}</p>
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => void refreshDevices()}>Try again</Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="microphone-hardware__advanced" aria-labelledby="microphone-advanced-heading">
        <h3 id="microphone-advanced-heading">Mute &amp; metering</h3>
        {device.capabilities.mute && lighting?.muteLinkedWritable ? (
          <MicrophoneSwitchRow
            id={`follow-mute-${device.id}`}
            label="Follow physical mute"
            detail="Turns the maintained red light off while the touch sensor reports muted."
            checked={lighting.muteLinked}
            disabled={lightingDisabled || !lighting.enabled}
            onCheckedChange={(enabled) => void setDeviceControl({ deviceId: device.id, change: { type: 'microphone-mute-lighting', enabled } })}
          />
        ) : null}
        <HorizontalLevelMeter
          busId="mic"
          active={Boolean(device.connected && engineRunning && microphoneBusEnabled && snapshot.audio.capabilities.realtimeMetering === 'available')}
          inactiveLabel={snapshot.audio.capabilities.realtimeMetering === 'simulation' ? 'Live level unavailable' : 'Audio off'}
          label="Input level"
        />
      </section>
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
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="microphone-state" tabIndex={0} aria-label={`${label}. ${detail}`}>
          <i className="microphone-state__dot" data-tone={tone} aria-hidden />
          <strong>{label}</strong>
        </span>
      </TooltipTrigger>
      <TooltipContent>{detail}</TooltipContent>
    </Tooltip>
  );
}

function MicrophoneSwitchRow({
  id,
  label,
  detail,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="microphone-switch-row">
      <Tooltip>
        <TooltipTrigger asChild>
          <label htmlFor={id} tabIndex={0}>{label}</label>
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
      <div className="microphone-switch-state">
        <span>{checked ? 'On' : 'Off'}</span>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          aria-label={label}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </div>
  );
}

function asNumber(value: DeviceSettingValue | undefined, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function MicrophoneSlider({ label, value, min, max, step, unit, disabled, onCommit }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  disabled?: boolean; onCommit: (value: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const current = draft ?? value;
  return (
    <div className="primary-slider" aria-busy={pending}>
      <div className="primary-slider__heading">
        <div><span>{label}</span></div>
        <output>{current}<small>{unit}</small></output>
      </div>
      <Slider min={min} max={max} step={step} value={[current]} disabled={disabled || pending}
        aria-label={label} aria-valuetext={`${current} ${unit}`}
        onValueChange={([next]) => typeof next === 'number' && setDraft(next)}
        onValueCommit={([next]) => {
          if (typeof next !== 'number') return;
          setPending(true);
          void onCommit(next).finally(() => { setDraft(null); setPending(false); });
        }}
      />
    </div>
  );
}
