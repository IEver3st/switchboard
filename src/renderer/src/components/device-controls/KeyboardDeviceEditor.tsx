import { Keyboard, Radio, SlidersHorizontal } from 'lucide-react';
import type { Device, KeyboardFeatureStatus } from '../../../../shared/contracts';
import { ColorPicker } from '@/components/device-controls/ColorPicker';
import { DeviceRender } from '@/components/shared/device-render';
import { PrimarySlider, SettingToggle } from '@/components/shared/human-controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSystemStore } from '@/stores/use-system-store';

export function KeyboardDeviceEditor({ device }: { device: Device }) {
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const keyboard = device.capabilities.keyboard;
  const lighting = device.capabilities.lighting;
  const controlsUnavailable = !device.connected || !lighting?.writable;
  const customColorAvailable = Boolean(
    lighting?.enabled
    && lighting.colorWritable
    && effectUsesColor(lighting.activeEffectId),
  );

  return (
    <div className="keyboard-workbench">
      <section className="keyboard-workbench__stage" aria-label="Keyboard hardware status">
        <div className="keyboard-workbench__render">
          <DeviceRender device={device} density="hero" />
          <p>Official product reference · effect preview unavailable</p>
        </div>
        <dl className="keyboard-readout">
          <Readout label="Firmware" value={keyboard?.firmwareVersion ?? 'Unavailable'} />
          <Readout label="Control path" value={keyboard?.transport === 'native-hid' ? 'Native HID' : 'Unavailable'} />
          <Readout label="Polling rate" value={keyboard?.pollingRateHz ? `${keyboard.pollingRateHz.toLocaleString()} Hz` : 'Unknown'} />
        </dl>
      </section>

      <section className="keyboard-console" aria-labelledby="keyboard-console-heading">
        <header className="keyboard-console__heading">
          <div>
            <span className="keyboard-console__eyebrow">Razer module · MVP</span>
            <h3 id="keyboard-console-heading">Keyboard controls</h3>
          </div>
          <div className="keyboard-console__transport" data-active={keyboard?.transport === 'native-hid'}>
            <Radio aria-hidden />
            <span>
              <strong>{keyboard?.transport === 'native-hid' ? 'Control endpoint ready' : 'Control endpoint unavailable'}</strong>
              <small>{keyboard?.transport === 'native-hid' ? 'Commands open, write, and release on demand' : 'Reconnect the keyboard or release the HID interface'}</small>
            </span>
          </div>
        </header>

        <div className="keyboard-console__columns">
          <div className="keyboard-lighting" aria-labelledby="keyboard-lighting-heading">
            <div className="keyboard-section-heading">
              <SlidersHorizontal aria-hidden />
              <div>
                <h4 id="keyboard-lighting-heading">Quick lighting</h4>
                <p>Low-frequency firmware commands only. No background RGB stream.</p>
              </div>
            </div>

            {lighting ? (
              <>
                <SettingToggle
                  title="Keyboard lighting"
                  description="Applies or clears the selected quick effect."
                  checked={lighting.enabled}
                  disabled={controlsUnavailable}
                  onCheckedChange={(enabled) => void setDeviceControl({
                    deviceId: device.id,
                    change: { type: 'lighting-enabled', enabled },
                  })}
                />

                <PrimarySlider
                  label="Brightness"
                  description="Confirmed by an immediate hardware readback."
                  value={lighting.brightness ?? 100}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  disabled={controlsUnavailable || !lighting.enabled || !lighting.brightnessWritable}
                  onCommit={(brightness) => void setDeviceControl({
                    deviceId: device.id,
                    change: { type: 'lighting-brightness', brightness },
                  })}
                />

                <div className="keyboard-lighting__row">
                  <label htmlFor="huntsman-quick-effect">Quick effect</label>
                  <Select
                    value={lighting.activeEffectId}
                    disabled={controlsUnavailable || !lighting.enabled}
                    onValueChange={(effectId) => void setDeviceControl({
                      deviceId: device.id,
                      change: { type: 'lighting-effect', effectId },
                    })}
                  >
                    <SelectTrigger id="huntsman-quick-effect" aria-label="Quick lighting effect">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {lighting.availableEffects.map((effect) => (
                        <SelectItem key={effect.id} value={effect.id}>{effect.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="keyboard-lighting__color" data-disabled={!customColorAvailable}>
                  <div>
                    <span>Effect color</span>
                    <p>{customColorAvailable ? 'Used by static, breathing, reactive, and starlight.' : 'The selected effect supplies its own colors.'}</p>
                  </div>
                  <ColorPicker
                    value={lighting.color ?? '#44aaff'}
                    disabled={controlsUnavailable || !customColorAvailable}
                    onCommit={(color) => void setDeviceControl({
                      deviceId: device.id,
                      change: { type: 'lighting-color', color },
                    })}
                  />
                </div>

                <p className="keyboard-lighting__truth" role="status" data-state={lighting.state ?? 'unknown'}>
                  <i aria-hidden />
                  <span>
                    <strong>{lighting.state === 'acknowledged' ? 'Last effect command acknowledged' : 'Effect state cannot be read back'}</strong>
                    <small>{lighting.unavailableReason ?? lighting.stateReason ?? 'Brightness readback remains available.'}</small>
                  </span>
                </p>
              </>
            ) : (
              <p className="keyboard-lighting__empty">This keyboard did not report a writable lighting capability.</p>
            )}
          </div>

          <div className="keyboard-capabilities" aria-labelledby="keyboard-capabilities-heading">
            <div className="keyboard-section-heading">
              <Keyboard aria-hidden />
              <div>
                <h4 id="keyboard-capabilities-heading">Key controls</h4>
                <p>Supported by the hardware, separated by current control owner.</p>
              </div>
            </div>
            <ul>
              {keyboard?.features.filter((feature) => feature.id !== 'lighting').map((feature) => (
                <li key={feature.id}>
                  <div className="keyboard-capabilities__line">
                    <strong>{feature.label}</strong>
                    <StatusLabel status={feature.status} />
                  </div>
                  <p>{feature.summary}</p>
                  {feature.unavailableReason ? <small>{feature.unavailableReason}</small> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function StatusLabel({ status }: { status: KeyboardFeatureStatus }) {
  const label = status === 'native' ? 'Switchboard' : status === 'synapse' ? 'Synapse' : 'Observed';
  return <span className="keyboard-capabilities__status" data-status={status}>{label}</span>;
}

function effectUsesColor(effectId: string): boolean {
  return ['static', 'breathing', 'reactive', 'starlight'].includes(effectId);
}
