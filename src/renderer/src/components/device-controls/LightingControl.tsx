import { Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LightingCapability } from '../../../../shared/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
}

export function LightingControl({
  capability,
  onEnabledChange,
  onColorChange,
  onBrightnessChange,
  onEffectChange,
}: LightingControlProps) {
  const [color, setColor] = useState(capability.color ?? '#ff1744');
  const [brightness, setBrightness] = useState(capability.brightness ?? 100);
  useEffect(() => setColor(capability.color ?? '#ff1744'), [capability.color]);
  useEffect(() => setBrightness(capability.brightness ?? 100), [capability.brightness]);

  return (
    <div className="lighting-control">
      <div className="device-setting-row lighting-control__master">
        <Lightbulb aria-hidden className="device-setting-row__icon" />
        <div className="device-setting-row__copy">
          <span>Lighting</span>
          <p>{capability.profileMode === 'onboard' ? 'Uses the lighting stored on the mouse.' : 'Choose the color and brightness for this profile.'}</p>
        </div>
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

      <div className="lighting-control__rows" data-disabled={!capability.enabled || !capability.writable}>
        {capability.color ? (
          <div className="lighting-control__row">
            <span>Color</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="lighting-color-trigger"
                  disabled={!capability.enabled || !capability.colorWritable}
                  aria-label={`Lighting color ${color}`}
                >
                  <span style={{ backgroundColor: color }} aria-hidden />
                  <strong>{friendlyColorName(color)}</strong>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <div className="popover-heading">Lighting color</div>
                <ColorPicker value={color} onChange={setColor} onCommit={onColorChange} />
              </PopoverContent>
            </Popover>
          </div>
        ) : null}

        {capability.brightness !== undefined ? (
          <div className="lighting-control__row lighting-control__brightness">
            <span>Brightness</span>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[brightness]}
              disabled={!capability.enabled || !capability.brightnessWritable}
              aria-label="Lighting brightness"
              aria-valuetext={`${brightness}%`}
              onValueChange={([value]) => typeof value === 'number' && setBrightness(value)}
              onValueCommit={([value]) => typeof value === 'number' && onBrightnessChange(value)}
            />
            <strong className="tabular-nums">{brightness}%</strong>
          </div>
        ) : null}

        <div className="lighting-control__row">
          <span>Effect</span>
          {capability.availableEffects.length === 1 ? (
            <strong>{capability.availableEffects[0]?.label}</strong>
          ) : (
            <select
              value={capability.activeEffectId}
              disabled={!capability.writable}
              onChange={(event) => onEffectChange(event.target.value)}
              aria-label="Lighting effect"
            >
              {capability.availableEffects.map((effect) => <option key={effect.id} value={effect.id}>{effect.label}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

function friendlyColorName(color: string): string {
  const normalized = color.toLowerCase();
  if (normalized === '#ff0000' || normalized === '#f20000') return 'Red';
  if (normalized.startsWith('#ff') && Number.parseInt(normalized.slice(3, 5), 16) < 0x90) return 'Pink';
  if (normalized === '#ffffff') return 'White';
  return 'Custom';
}
