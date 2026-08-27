import { Gauge, Keyboard, Layers3, Lightbulb, Radio, Shield, Zap } from 'lucide-react';
import type { Device, KeyboardToggleCapability } from '../../../../shared/contracts';
import { ColorPicker } from '@/components/device-controls/ColorPicker';
import { DeviceRender } from '@/components/shared/device-render';
import { PrimarySlider, SettingToggle } from '@/components/shared/human-controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSystemStore } from '@/stores/use-system-store';

export function KeyboardDeviceEditor({ device }: { device: Device }) {
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const keyboard = device.capabilities.keyboard;
  const lighting = device.capabilities.lighting;
  const nativeReady = Boolean(device.connected && keyboard?.transport === 'native-hid');
  const lightingUnavailable = !nativeReady || !lighting?.writable;
  const customColorAvailable = Boolean(lighting?.enabled && lighting.colorWritable && effectUsesColor(lighting.activeEffectId));
  const profiles = keyboard?.onboardProfiles;

  return (
    <div className="keyboard-workbench">
      <section className="keyboard-workbench__stage" aria-label="Keyboard hardware status">
        <div className="keyboard-workbench__render">
          <DeviceRender device={device} density="hero" />
          <p>Official product render</p>
        </div>
        <dl className="keyboard-readout">
          <Readout label="Firmware" value={keyboard?.firmwareVersion ?? 'Unavailable'} />
          <Readout label="Control" value={nativeReady ? 'Native HID' : 'Unavailable'} tone={nativeReady ? 'ready' : 'muted'} />
          <Readout label="Polling" value={keyboard?.pollingRateHz ? `${keyboard.pollingRateHz.toLocaleString()} Hz` : 'Unknown'} />
        </dl>
      </section>

      <section className="keyboard-command-strip" aria-label="Keyboard profile and game controls">
        <div className="keyboard-command-strip__profile">
          <Layers3 aria-hidden />
          <div>
            <span>Onboard profile</span>
            <small>{profiles?.profiles.length ? `${profiles.profiles.length} profiles stored on the keyboard` : 'No profile slots reported'}</small>
          </div>
          <Select
            value={profiles?.activeProfileId ?? undefined}
            disabled={!nativeReady || !profiles?.writable || profiles.profiles.length === 0}
            onValueChange={(profileId) => void setDeviceControl({
              deviceId: device.id,
              change: { type: 'keyboard-onboard-profile', profileId },
            })}
          >
            <SelectTrigger className="keyboard-command-strip__select" aria-label="Active onboard keyboard profile">
              <SelectValue placeholder="Unavailable" />
            </SelectTrigger>
            <SelectContent>
              {profiles?.profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>{profile.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {keyboard?.gamingMode ? (
          <SettingToggle
            className="keyboard-command-strip__gaming"
            title="Gaming Mode"
            description={keyboard.gamingMode.writable
              ? 'Disables the Windows key using the keyboard firmware.'
              : keyboard.gamingMode.unavailableReason}
            checked={keyboard.gamingMode.enabled ?? false}
            disabled={!nativeReady || !keyboard.gamingMode.writable}
            onCheckedChange={(enabled) => void setDeviceControl({
              deviceId: device.id,
              change: { type: 'keyboard-gaming-mode', enabled },
            })}
          />
        ) : null}
      </section>

      <section className="keyboard-console" aria-labelledby="keyboard-console-heading">
        <header className="keyboard-console__heading">
          <div>
            <span className="keyboard-console__eyebrow">Huntsman V2 Analog</span>
            <h3 id="keyboard-console-heading">Keyboard controls</h3>
          </div>
          <div className="keyboard-console__transport" data-active={nativeReady}>
            <Radio aria-hidden />
            <span>
              <strong>{nativeReady ? 'Control endpoint ready' : 'Control endpoint unavailable'}</strong>
              <small>{nativeReady ? 'State is confirmed after each firmware write' : 'Reconnect the keyboard or release the HID interface'}</small>
            </span>
          </div>
        </header>

        <div className="keyboard-console__columns">
          <div className="keyboard-input" aria-labelledby="keyboard-input-heading">
            <SectionHeading icon={Gauge} id="keyboard-input-heading" title="Input response" description="Fast-access controls for the active keyboard profile." />
            <CapabilityToggle
              title="Rapid Trigger"
              capability={keyboard?.rapidTrigger}
              icon={Zap}
              fallback="The keyboard did not report this capability."
              onChange={(enabled) => void setDeviceControl({ deviceId: device.id, change: { type: 'keyboard-rapid-trigger', enabled } })}
            />
            <CapabilityToggle
              title="Snap Tap"
              capability={keyboard?.snapTap}
              icon={Shield}
              fallback="The keyboard did not report this capability."
              onChange={(enabled) => void setDeviceControl({ deviceId: device.id, change: { type: 'keyboard-snap-tap', enabled } })}
            />
            <div className="keyboard-input__boundary">
              <Keyboard aria-hidden />
              <div>
                <strong>Analog mapping stays in Synapse</strong>
                <p>Per-key actuation, controller axes, two-stage actions, remaps, and macros share one profile payload. Switchboard leaves that payload untouched.</p>
              </div>
            </div>
          </div>

          <div className="keyboard-lighting" aria-labelledby="keyboard-lighting-heading">
            <SectionHeading icon={Lightbulb} id="keyboard-lighting-heading" title="Firmware lighting" description="Preset effects run on the keyboard without a background RGB stream." />

            {lighting ? (
              <>
                <SettingToggle
                  title="Keyboard lighting"
                  description="Applies or clears the selected firmware effect."
                  checked={lighting.enabled}
                  disabled={lightingUnavailable}
                  onCheckedChange={(enabled) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-enabled', enabled } })}
                />
                <PrimarySlider
                  label="Brightness"
                  description="Read back from the keyboard after each change."
                  value={lighting.brightness ?? 100}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  disabled={lightingUnavailable || !lighting.enabled || !lighting.brightnessWritable}
                  onCommit={(brightness) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-brightness', brightness } })}
                />
                <div className="keyboard-lighting__effects">
                  <div>
                    <span>Preset effect</span>
                    <p>The selected effect is read back from firmware.</p>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={lighting.enabled ? lighting.activeEffectId : ''}
                    disabled={lightingUnavailable || !lighting.enabled}
                    aria-label="Keyboard lighting preset"
                    onValueChange={(effectId) => effectId && void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-effect', effectId } })}
                  >
                    {lighting.availableEffects.map((effect) => (
                      <ToggleGroupItem className="keyboard-effect-option" key={effect.id} value={effect.id}>{effect.label}</ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <div className="keyboard-lighting__color" data-disabled={!customColorAvailable}>
                  <div>
                    <span>Effect color</span>
                    <p>{customColorAvailable ? 'Used by static, breathing, reactive, and starlight.' : 'The selected effect supplies its own colors.'}</p>
                  </div>
                  <ColorPicker
                    value={lighting.color ?? '#44aaff'}
                    disabled={lightingUnavailable || !customColorAvailable}
                    onCommit={(color) => void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-color', color } })}
                  />
                </div>
                <p className="keyboard-lighting__truth" role="status" data-state={lighting.state ?? 'unknown'}>
                  <i aria-hidden />
                  <span>
                    <strong>{lighting.state === 'maintained' ? 'Firmware state confirmed' : lighting.state === 'acknowledged' ? 'Command acknowledged' : 'Effect state unavailable'}</strong>
                    <small>{lighting.unavailableReason ?? lighting.stateReason ?? 'No firmware state has been returned.'}</small>
                  </span>
                </p>
              </>
            ) : (
              <p className="keyboard-lighting__empty">This keyboard did not report a writable lighting capability.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone?: 'ready' | 'muted' }) {
  return <div><dt>{label}</dt><dd data-tone={tone}>{value}</dd></div>;
}

function SectionHeading({ icon: Icon, id, title, description }: {
  icon: typeof Gauge;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="keyboard-section-heading">
      <Icon aria-hidden />
      <div>
        <h4 id={id}>{title}</h4>
        <p>{description}</p>
      </div>
    </div>
  );
}

function CapabilityToggle({ title, capability, icon: Icon, fallback, onChange }: {
  title: string;
  capability?: KeyboardToggleCapability;
  icon: typeof Zap;
  fallback: string;
  onChange(enabled: boolean): void;
}) {
  const available = Boolean(capability?.writable && capability.enabled !== null);
  return (
    <div className="keyboard-input__toggle" data-available={available}>
      <Icon aria-hidden />
      <SettingToggle
        title={title}
        description={available ? 'Stored with the active keyboard profile.' : capability?.unavailableReason ?? fallback}
        checked={capability?.enabled ?? false}
        disabled={!available}
        onCheckedChange={onChange}
      />
      <span>{available ? 'Firmware' : 'Synapse 4'}</span>
    </div>
  );
}

function effectUsesColor(effectId: string): boolean {
  return ['static', 'breathing', 'reactive', 'starlight'].includes(effectId);
}
