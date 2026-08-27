import { Info, LoaderCircle, RotateCw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Device } from '../../../../shared/contracts';
import { ColorPicker } from '@/components/device-controls/ColorPicker';
import { DeviceRender } from '@/components/shared/device-render';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSystemStore } from '@/stores/use-system-store';

export function KeyboardDeviceEditor({ device }: { device: Device }) {
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const refreshDevices = useSystemStore((state) => state.refreshDevices);
  const pending = useSystemStore((state) => state.pendingDeviceIds.includes(device.id));
  const keyboard = device.capabilities.keyboard;
  const lighting = device.capabilities.lighting;
  const profiles = keyboard?.onboardProfiles;
  const controlsReady = Boolean(device.connected && keyboard?.transport === 'native-hid');
  const lightingReady = Boolean(controlsReady && lighting?.writable);
  const activeEffect = lighting?.availableEffects.find((effect) => effect.id === lighting.activeEffectId);
  const customColorAvailable = Boolean(
    lightingReady
    && lighting?.enabled
    && lighting.colorWritable
    && activeEffect?.controls?.includes('color'),
  );
  const [previewColor, setPreviewColor] = useState<string | null>(null);
  const [previewBrightness, setPreviewBrightness] = useState(lighting?.brightness ?? 100);

  useEffect(() => setPreviewColor(null), [lighting?.color]);
  useEffect(() => setPreviewBrightness(lighting?.brightness ?? 100), [lighting?.brightness, pending]);

  const profileUnavailableReason = profiles?.unavailableReason ?? 'Onboard profiles are unavailable.';
  const gamingUnavailableReason = keyboard?.gamingMode?.unavailableReason ?? 'Gaming Mode is unavailable.';

  return (
    <div className="keyboard-workbench" aria-busy={pending}>
      <section className="keyboard-stage" aria-label="Keyboard preview">
        <DeviceRender
          device={device}
          density="hero"
          lightingPreview={{
            enabled: lighting?.enabled,
            color: previewColor ?? lighting?.color,
            brightness: previewBrightness,
            preserveSourceColor: ['spectrum', 'wave-left', 'wave-right'].includes(lighting?.activeEffectId ?? ''),
          }}
        />
        <div className="keyboard-stage__footer">
          <span className="keyboard-stage__effect">
            {lighting?.enabled ? activeEffect?.label ?? 'Lighting on' : 'Lighting off'}
            {customColorAvailable ? <i style={{ backgroundColor: previewColor ?? lighting?.color }} aria-hidden /> : null}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="keyboard-stage__info" aria-label="Device information">
                <Info aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Firmware {keyboard?.firmwareVersion ?? 'unavailable'}
              {keyboard?.pollingRateHz ? ` · ${keyboard.pollingRateHz.toLocaleString()} Hz` : ''}
            </TooltipContent>
          </Tooltip>
        </div>
      </section>

      {!controlsReady ? (
        <div className="keyboard-unavailable" role="alert">
          <span>
            <strong>Keyboard controls unavailable</strong>
            <small>Reconnect the keyboard, then try again.</small>
          </span>
          <Button variant="secondary" size="sm" onClick={() => void refreshDevices()} disabled={pending}>
            <RotateCw aria-hidden /> Try again
          </Button>
        </div>
      ) : null}

      <section className="keyboard-primary-controls" aria-label="Keyboard settings">
        <ControlRow label="Onboard profile" unavailableReason={!profiles?.writable ? profileUnavailableReason : undefined}>
          <Select
            value={profiles?.activeProfileId ?? undefined}
            disabled={pending || !controlsReady || !profiles?.writable || profiles.profiles.length === 0}
            onValueChange={(profileId) => void setDeviceControl({
              deviceId: device.id,
              change: { type: 'keyboard-onboard-profile', profileId },
            })}
          >
            <SelectTrigger className="keyboard-profile-select" aria-label="Active onboard keyboard profile">
              <SelectValue placeholder="Unavailable" />
            </SelectTrigger>
            <SelectContent>
              {profiles?.profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>{profile.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ControlRow>

        <ControlRow label="Gaming Mode" unavailableReason={!keyboard?.gamingMode?.writable ? gamingUnavailableReason : undefined}>
          <Switch
            checked={keyboard?.gamingMode?.enabled ?? false}
            disabled={pending || !controlsReady || !keyboard?.gamingMode?.writable}
            aria-label="Gaming Mode"
            onCheckedChange={(enabled) => void setDeviceControl({
              deviceId: device.id,
              change: { type: 'keyboard-gaming-mode', enabled },
            })}
          />
        </ControlRow>
      </section>

      <section className="keyboard-lighting" aria-labelledby="keyboard-lighting-heading">
        <header className="keyboard-lighting__header">
          <h3 id="keyboard-lighting-heading">Lighting</h3>
          <span className="keyboard-lighting__power">
            {pending ? <LoaderCircle className="keyboard-pending" aria-label="Applying keyboard setting" /> : null}
            <Switch
              checked={lighting?.enabled ?? false}
              disabled={pending || !lightingReady}
              aria-label="Keyboard lighting"
              onCheckedChange={(enabled) => void setDeviceControl({
                deviceId: device.id,
                change: { type: 'lighting-enabled', enabled },
              })}
            />
          </span>
        </header>

        {lighting ? (
          <div className="keyboard-lighting__body" data-disabled={!lighting.enabled || undefined}>
            <div className="keyboard-lighting__effects">
              <span>Effect</span>
              <ToggleGroup
                type="single"
                value={lighting.enabled ? lighting.activeEffectId : ''}
                disabled={pending || !lightingReady || !lighting.enabled}
                aria-label="Keyboard lighting effect"
                onValueChange={(effectId) => effectId && void setDeviceControl({
                  deviceId: device.id,
                  change: { type: 'lighting-effect', effectId },
                })}
              >
                {lighting.availableEffects.map((effect) => (
                  <ToggleGroupItem className="keyboard-effect-option" key={effect.id} value={effect.id}>
                    {effect.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="keyboard-lighting__parameters">
              {lighting.brightness !== undefined ? (
                <label className="keyboard-brightness">
                  <span>Brightness <output>{previewBrightness}%</output></span>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[previewBrightness]}
                    disabled={pending || !lighting.enabled || !lighting.brightnessWritable}
                    aria-label="Lighting brightness"
                    aria-valuetext={`${previewBrightness}%`}
                    onValueChange={([brightness]) => typeof brightness === 'number' && setPreviewBrightness(brightness)}
                    onValueCommit={([brightness]) => {
                      if (typeof brightness !== 'number') return;
                      void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-brightness', brightness } });
                    }}
                  />
                </label>
              ) : null}

              {customColorAvailable ? (
                <div className="keyboard-color">
                  <span>Color</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="keyboard-color__trigger"
                        disabled={pending}
                        aria-label={`Lighting color ${previewColor ?? lighting.color}`}
                      >
                        <i style={{ backgroundColor: previewColor ?? lighting.color }} aria-hidden />
                        <strong>{(previewColor ?? lighting.color ?? '#44AAFF').toUpperCase()}</strong>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="lighting-color-popover">
                      <div className="popover-heading">Lighting color</div>
                      <ColorPicker
                        value={previewColor ?? lighting.color ?? '#44aaff'}
                        onChange={setPreviewColor}
                        onCommit={(color) => {
                          setPreviewColor(color);
                          void setDeviceControl({ deviceId: device.id, change: { type: 'lighting-color', color } })
                            .finally(() => setPreviewColor(null));
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              ) : null}
            </div>

            {!lightingReady ? (
              <div className="keyboard-lighting__unavailable" role="status">
                <span>Lighting controls are unavailable.</span>
                <Button variant="ghost" size="sm" onClick={() => void refreshDevices()} disabled={pending}>Try again</Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="keyboard-lighting__empty">Lighting is not available for this keyboard.</p>
        )}
      </section>
    </div>
  );
}

function ControlRow({
  label,
  unavailableReason,
  children,
}: {
  label: string;
  unavailableReason?: string;
  children: ReactNode;
}) {
  return (
    <div className="keyboard-control-row">
      <span className="keyboard-control-row__label">
        {label}
        {unavailableReason ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`${label} availability`}><Info aria-hidden /></button>
            </TooltipTrigger>
            <TooltipContent>{unavailableReason}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      {children}
    </div>
  );
}
