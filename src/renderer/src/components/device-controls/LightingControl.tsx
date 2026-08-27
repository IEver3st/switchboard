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
  onColorPreview?: (color: string | null) => void;
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
  onColorPreview,
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

  useEffect(() => {
    setColor(capability.color ?? '#ff1744');
    onColorPreview?.(null);
  }, [capability.color]);
  useEffect(() => setBrightness(capability.brightness ?? 100), [capability.brightness]);
  useEffect(() => setSpeed(capability.speed ?? 50), [capability.speed]);

  return (
    <div className="lighting-editor">
      <div className="lighting-editor__heading">
        <div>
          <span>Lighting</span>
          <p>{lightingModeCopy(capability)}</p>
        </div>
        <div className="lighting-editor__heading-actions">
          <span className="lighting-editor__status" data-state={capability.state ?? 'unknown'}>
            <i aria-hidden /> {lightingStateLabel(capability)}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Switch
                  checked={capability.enabled}
                  disabled={!capability.writable}
                  onCheckedChange={onEnabledChange}
                  aria-label="Mouse lighting"
                />
              </span>
            </TooltipTrigger>
            {!capability.writable && capability.unavailableReason ? <TooltipContent>{capability.unavailableReason}</TooltipContent> : null}
          </Tooltip>
        </div>
      </div>

      <div className="lighting-editor__body" data-disabled={controlsDisabled || undefined}>
        <div className="lighting-editor__primary">
          <ControlField label="Effect">
            <Select value={capability.activeEffectId} disabled={controlsDisabled} onValueChange={onEffectChange}>
              <SelectTrigger aria-label="Lighting effect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {capability.availableEffects.map((effect) => (
                  <SelectItem key={effect.id} value={effect.id}>{effect.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ControlField>

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
                <PopoverContent align="start" className="lighting-color-popover">
                  <div className="popover-heading">Lighting color</div>
                  <p className="popover-description">Preview on the mouse, then apply to the active hardware profile.</p>
                  <ColorPicker
                    value={color}
                    onChange={(next) => {
                      setColor(next);
                      onColorPreview?.(next);
                    }}
                    onCommit={onColorChange}
                  />
                </PopoverContent>
              </Popover>
            </ControlField>
          ) : null}
        </div>

        {(brightnessVisible || speedVisible || directionVisible) ? (
          <div className="lighting-editor__parameters">
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
                <Select value={capability.direction} disabled={controlsDisabled || !capability.directionWritable} onValueChange={(value) => onDirectionChange(value as LightingDirection)}>
                  <SelectTrigger aria-label="Lighting effect direction"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {capability.availableDirections?.map((direction) => (
                      <SelectItem key={direction} value={direction}>{directionLabel(direction)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ControlField>
            ) : null}
          </div>
        ) : null}

        {zonesVisible ? (
          <section className="lighting-zones" aria-labelledby="lighting-zones-label">
            <div>
              <div className="lighting-editor__section-label" id="lighting-zones-label">Device zones</div>
              <p>Static color can be set per addressable zone.</p>
            </div>
            <div className="lighting-zones__list">
              {capability.zones?.map((zone) => (
                <Popover key={zone.id}>
                  <PopoverTrigger asChild>
                    <button type="button" className="lighting-zone" disabled={controlsDisabled || !zone.colorWritable} aria-label={`${zone.label} color ${zone.color}`}>
                      <span style={{ backgroundColor: zone.color }} aria-hidden />
                      <small>{zone.label.replace(/^Zone\s+/i, '')}</small>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="center" className="lighting-color-popover">
                    <div className="popover-heading">{zone.label}</div>
                    <p className="popover-description">Applies Static to this reported lighting zone.</p>
                    <ColorPicker value={zone.color} onCommit={(next) => onZoneColorChange(zone.id, next)} />
                  </PopoverContent>
                </Popover>
              ))}
            </div>
          </section>
        ) : null}

        {capability.stateReason ? <p className="lighting-editor__state-reason" role="status">{capability.stateReason}</p> : null}
      </div>
    </div>
  );
}

function ControlField({ label, value, wide, children }: { label: string; value?: string; wide?: boolean; children: ReactNode }) {
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
  return capability.source === 'firmware' ? 'Stored effect' : 'Ready';
}

function directionLabel(direction: LightingDirection): string {
  return direction.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}
