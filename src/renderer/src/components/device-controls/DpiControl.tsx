import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DpiCapability } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface DpiControlProps {
  capability: DpiCapability;
  onChange: (value: number) => void;
  onStagesChange: (stages: number[]) => void;
  onShiftChange: (value: number) => void;
}

export function DpiControl({ capability, onChange, onStagesChange, onShiftChange }: DpiControlProps) {
  const [draft, setDraft] = useState(capability.activeDpi);
  useEffect(() => setDraft(capability.activeDpi), [capability.activeDpi]);

  return (
    <div className="dpi-control">
      <div className="control-heading">
        <span>DPI</span>
        <strong className="control-heading__value">{draft.toLocaleString()} <small>DPI</small></strong>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="dpi-control__slider">
            <Slider
              min={capability.min}
              max={capability.max}
              step={capability.step}
              value={[draft]}
              disabled={!capability.writable}
              aria-label="Active DPI"
              aria-valuetext={`${draft} DPI`}
              onValueChange={([value]) => typeof value === 'number' && setDraft(value)}
              onValueCommit={([value]) => typeof value === 'number' && value !== capability.activeDpi && onChange(value)}
            />
          </div>
        </TooltipTrigger>
        {!capability.writable && capability.unavailableReason ? <TooltipContent>{capability.unavailableReason}</TooltipContent> : null}
      </Tooltip>
      <div className="dpi-control__range" aria-hidden>
        <span>{capability.min.toLocaleString()}</span>
        <span>{capability.max.toLocaleString()}</span>
      </div>
      <DpiPresetGroup capability={capability} onChange={onChange} onStagesChange={onStagesChange} />
      {capability.shiftDpi !== undefined ? (
        <DpiShiftControl capability={capability} onChange={onShiftChange} />
      ) : null}
    </div>
  );
}

function DpiPresetGroup({
  capability,
  onChange,
  onStagesChange,
}: {
  capability: DpiCapability;
  onChange: (value: number) => void;
  onStagesChange: (stages: number[]) => void;
}) {
  return (
    <div className="dpi-presets">
      <ToggleGroup
        type="single"
        value={String(capability.activeDpi)}
        disabled={!capability.writable}
        aria-label="DPI presets"
        onValueChange={(value) => value && onChange(Number(value))}
      >
        {capability.stages.map((stage) => (
          <ToggleGroupItem key={stage} value={String(stage)} aria-label={`${stage} DPI`}>{stage.toLocaleString()}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      <DpiStageEditor capability={capability} onApply={onStagesChange} />
    </div>
  );
}

function DpiStageEditor({ capability, onApply }: { capability: DpiCapability; onApply: (stages: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState(capability.stages);
  const [newStage, setNewStage] = useState(capability.activeDpi);
  const maxStages = capability.maxStages ?? 5;

  const reset = () => {
    setStages(capability.stages);
    setNewStage(nextStage(capability));
  };

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      if (next) reset();
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          disabled={!capability.writable}
          className="dpi-presets__add"
          aria-label="Manage DPI stages"
        >
          <Plus aria-hidden className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="dpi-stage-editor">
        <div className="popover-heading">DPI stages</div>
        <p className="popover-description">Choose the sensitivity steps you use most.</p>
        <div className="dpi-stage-editor__list">
          {stages.map((stage) => (
            <div key={stage} className="dpi-stage-editor__row">
              <span className="tabular-nums">{stage.toLocaleString()} DPI</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={stages.length <= 1}
                aria-label={`Remove ${stage} DPI stage`}
                onClick={() => setStages((current) => current.filter((value) => value !== stage))}
              >
                <Trash2 aria-hidden className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="dpi-stage-editor__add-row">
          <Input
            type="number"
            min={capability.min}
            max={capability.max}
            step={capability.step}
            value={newStage}
            disabled={stages.length >= maxStages}
            onChange={(event) => setNewStage(Number(event.target.value))}
            aria-label="New DPI stage"
          />
          <Button
            type="button"
            size="sm"
            disabled={stages.length >= maxStages || !validDpi(capability, newStage) || stages.includes(newStage)}
            onClick={() => setStages((current) => [...current, newStage].sort((a, b) => a - b))}
          >
            Add
          </Button>
        </div>
        <div className="dpi-stage-editor__actions">
          <span>{stages.length}/{maxStages} stages</span>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => {
              onApply(stages);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DpiShiftControl({ capability, onChange }: { capability: DpiCapability; onChange: (value: number) => void }) {
  const [value, setValue] = useState(capability.shiftDpi ?? capability.min);
  useEffect(() => setValue(capability.shiftDpi ?? capability.min), [capability.shiftDpi, capability.min]);
  return (
    <div className="dpi-shift-control">
      <div>
        <span>DPI Shift</span>
        <p>Temporarily lowers sensitivity while the DPI Shift button is held.</p>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="ghost" disabled={!capability.writable} className="dpi-shift-control__value">
            {(capability.shiftDpi ?? capability.min).toLocaleString()} DPI
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <div className="popover-heading">DPI Shift</div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="number"
              min={capability.min}
              max={capability.max}
              step={capability.step}
              value={value}
              onChange={(event) => setValue(Number(event.target.value))}
              aria-label="DPI Shift value"
            />
            <Button type="button" size="sm" disabled={!validDpi(capability, value)} onClick={() => onChange(value)}>Set</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function nextStage(capability: DpiCapability): number {
  const candidate = Math.min(capability.max, capability.activeDpi + Math.max(400, capability.step));
  return capability.min + Math.round((candidate - capability.min) / capability.step) * capability.step;
}

function validDpi(capability: DpiCapability, value: number): boolean {
  return Number.isInteger(value)
    && value >= capability.min
    && value <= capability.max
    && (value - capability.min) % capability.step === 0;
}
