import { Lightbulb } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { LightingCapability, LightingDirection } from '../../../../shared/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ColorPicker } from './ColorPicker';

interface LightingControlProps {
  capability: LightingCapability;
  onEnabledChange: (enabled: boolean) => void;
  onColorChange: (color: string) => void;
  onBrightnessChange: (brightness: number) => void;
  onEffectChange: (effectId: string) => void;
  onSpeedChange: (speed: number) => void;
  onDirectionChange: (direction: LightingDirection) => void;
  onZoneColorChange: (zoneId: string, color: string) => void;
}

export function LightingControl({
  capability,
  onEnabledChange,
  onColorChange,
  onBrightnessChange,
  onEffectChange,
  onSpeedChange,
  onDirectionChange,
  onZoneColorChange,
}: LightingControlProps) {
  const [color, setColor] = useState(capability.color ?? '#ff1744');
  const [brightness, setBrightness] = useState(capability.brightness ?? 100);
  const [speed, setSpeed] = useState(capability.speed ?? 50);
  const activeEffect = capability.availableEffects.find((effect) => effect.id === capability.activeEffectId);
  const controls = new Set(activeEffect?.controls);
  const hasExplicitControls = activeEffect?.controls !== undefined;
  const colorVisible = capability.color !== undefined && (!hasExplicitControls || controls.has('color'));
  const brightnessVisible = capability.brightness !== undefined && (!hasExplicitControls || controls.has('brightness'));
  const speedVisible = capability.speed !== undefined && (!hasExplicitControls || controls.has('speed'));
  const directionVisible = capability.direction !== undefined
    && (capability.availableDirections?.length ?? 0) > 0
    && (!hasExplicitControls || controls.has('direction'));
  const zonesVisible = (capability.zones?.length ?? 0) > 0 && (!hasExplicitControls || controls.has('zones'));
  const controlsDisabled = !capability.enabled || !capability.writable;

  useEffect(() => setColor(capability.color ?? '#ff1744'), [capability.color]);
  useEffect(() => setBrightness(capability.brightness ?? 100), [capability.brightness]);
  useEffect(() => setSpeed(capability.speed ?? 50), [capability.speed]);

  return (
    <div className="lighting-studio">
      <div className="device-setting-row lighting-studio__master">
        <Lightbulb aria-hidden className="device-setting-row__icon" />
        <div className="device-setting-row__copy">
          <span>Lighting control</span>
          <p>{lightingModeCopy(capability)}</p>
        </div>
        <div className="lighting-studio__status" data-state={capability.state ?? 'unknown'}>
          <span aria-hidden />
          {lightingStateLabel(capability)}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Switch
                checked={capability.enabled}
                disabled={!capability.writable}
                onCheckedChange={onEnabledChange}
                aria-label="Device lighting"
              />
            </span>
          </TooltipTrigger>
          {!capability.writable && capability.unavailableReason
            ? <TooltipContent>{capability.unavailableReason}</TooltipContent>
            : null}
        </Tooltip>
      </div>

      <div className="lighting-studio__body" data-disabled={controlsDisabled || undefined}>
        <section className="lighting-studio__effects" aria-labelledby="lighting-effects-label">
          <div className="lighting-studio__section-label" id="lighting-effects-label">Effect</div>
          <div className="lighting-effect-list" role="group" aria-label="Lighting effect">
            {capability.availableEffects.map((effect) => (
              <button
                key={effect.id}
                type="button"
                className="lighting-effect-option"
                data-active={effect.id === capability.activeEffectId || undefined}
                aria-pressed={effect.id === capability.activeEffectId}
                disabled={controlsDisabled}
                onClick={() => onEffectChange(effect.id)}
              >
                {effect.label}
              </button>
            ))}
          </div>
        </section>

        <div className="lighting-studio__controls">
          {colorVisible ? (
            <ControlField label="Color">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="lighting-color-trigger"
                    disabled={controlsDisabled || !capability.colorWritable}
                    aria-label={`Lighting color ${color}`}
                  >
                    <span style={{ backgroundColor: color }} aria-hidden />
                    <strong>{color.toUpperCase()}</strong>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72">
                  <div className="popover-heading">Lighting color</div>
                  <ColorPicker value={color} onChange={setColor} onCommit={onColorChange} />
                </PopoverContent>
              </Popover>
            </ControlField>
          ) : null}

          {brightnessVisible ? (
            <ControlField label="Brightness" value={`${brightness}%`} wide>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[brightness]}
                disabled={controlsDisabled || !capability.brightnessWritable}
                aria-label="Lighting brightness"
                aria-valuetext={`${brightness}%`}
                onValueChange={([value]) => typeof value === 'number' && setBrightness(value)}
                onValueCommit={([value]) => typeof value === 'number' && onBrightnessChange(value)}
              />
            </ControlField>
          ) : null}

          {speedVisible ? (
            <ControlField label="Speed" value={`${speed}%`} wide>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[speed]}
                disabled={controlsDisabled || !capability.speedWritable}
                aria-label="Lighting effect speed"
                aria-valuetext={`${speed}%`}
                onValueChange={([value]) => typeof value === 'number' && setSpeed(value)}
                onValueCommit={([value]) => typeof value === 'number' && onSpeedChange(value)}
              />
            </ControlField>
          ) : null}

          {directionVisible ? (
            <ControlField label="Direction">
              <Select
                value={capability.direction}
                disabled={controlsDisabled || !capability.directionWritable}
                onValueChange={(value) => onDirectionChange(value as LightingDirection)}
              >
                <SelectTrigger aria-label="Lighting effect direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {capability.availableDirections?.map((direction) => (
                    <SelectItem key={direction} value={direction}>{directionLabel(direction)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ControlField>
          ) : null}
        </div>

        {zonesVisible ? (
          <section className="lighting-zones" aria-labelledby="lighting-zones-label">
            <div>
              <div className="lighting-studio__section-label" id="lighting-zones-label">Device zones</div>
              <p>Set each addressable zone independently. Zone changes use Static.</p>
            </div>
            <div className="lighting-zones__list">
              {capability.zones?.map((zone) => (
                <Popover key={zone.id}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="lighting-zone"
                      disabled={controlsDisabled || !zone.colorWritable}
                      aria-label={`${zone.label} color ${zone.color}`}
                    >
                      <span style={{ backgroundColor: zone.color }} aria-hidden />
                      <small>{zone.label.replace(/^Zone\s+/i, '')}</small>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="center" className="w-72">
                    <div className="popover-heading">{zone.label}</div>
                    <ColorPicker value={zone.color} onCommit={(next) => onZoneColorChange(zone.id, next)} />
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          </section>
        ) : null}

        {capability.stateReason ? <p className="lighting-studio__state-reason">{capability.stateReason}</p> : null}
      </div>
    </div>
  );
}

function ControlField({
  label,
  value,
  wide,
  children,
}: {
  label: string;
  value?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="lighting-field" data-wide={wide || undefined}>
      <div className="lighting-field__label">
        <span>{label}</span>
        {value ? <strong className="tabular-nums">{value}</strong> : null}
      </div>
      {children}
    </div>
  );
}

function lightingModeCopy(capability: LightingCapability): string {
  if (capability.profileMode === 'onboard') return 'Stored in the active onboard profile.';
  if ((capability.zones?.length ?? 0) > 0) return `${capability.zones?.length} addressable zones under live LIGHTSYNC control.`;
  return 'Live lighting for the current software profile.';
}

function lightingStateLabel(capability: LightingCapability): string {
  if (capability.state === 'maintained') return 'Read back';
  if (capability.state === 'acknowledged') return 'Acknowledged';
  return capability.source === 'firmware' ? 'Stored effect' : 'Ready to apply';
}

function directionLabel(direction: LightingDirection): string {
  return direction.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}
