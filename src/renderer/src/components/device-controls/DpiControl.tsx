import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { DpiCapability } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type DpiMutation = (value: number) => void | Promise<void>;
type DpiStagesMutation = (stages: number[]) => void | Promise<void>;

interface DpiControlProps {
  capability: DpiCapability;
  reportRateControl?: ReactNode;
  onChange: DpiMutation;
  onStagesChange: DpiStagesMutation;
  onShiftChange: DpiMutation;
}

export function DpiControl({ capability, reportRateControl, onChange, onStagesChange, onShiftChange }: DpiControlProps) {
  const [draft, setDraft] = useState(capability.activeDpi);
  const [draftText, setDraftText] = useState(formatDpi(capability.activeDpi));
  const draftIsValid = validDpi(capability, draft) && parseDpi(draftText) === draft;

  useEffect(() => {
    setDraft(capability.activeDpi);
    setDraftText(formatDpi(capability.activeDpi));
  }, [capability.activeDpi]);

  const setDraftValue = (value: number) => {
    setDraft(value);
    setDraftText(formatDpi(value));
  };
  const commitDraft = () => {
    if (!draftIsValid) {
      setDraftValue(capability.activeDpi);
      return;
    }
    if (draft !== capability.activeDpi) void onChange(draft);
  };

  return (
    <div className="dpi-control">
      <div className="control-heading dpi-control__heading">
        <label htmlFor="active-mouse-dpi">DPI</label>
        <div className="dpi-control__readout">
          <Input
            id="active-mouse-dpi"
            className="dpi-control__input"
            value={draftText}
            inputMode="numeric"
            disabled={!capability.writable}
            aria-invalid={!draftIsValid}
            aria-describedby="active-mouse-dpi-requirements"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => {
              const nextText = event.target.value.replace(/[^\d,]/g, '');
              const next = parseDpi(nextText);
              setDraftText(nextText);
              if (Number.isFinite(next)) setDraft(next);
            }}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setDraftValue(capability.activeDpi);
                event.currentTarget.blur();
              }
            }}
          />
          <span>DPI</span>
          <span id="active-mouse-dpi-requirements" className="sr-only">
            Enter a value from {capability.min} to {capability.max} in steps of {capability.step}.
          </span>
        </div>
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
              onValueChange={([value]) => typeof value === 'number' && setDraftValue(value)}
              onValueCommit={([value]) => typeof value === 'number' && value !== capability.activeDpi && void onChange(value)}
            />
          </div>
        </TooltipTrigger>
        {!capability.writable && capability.unavailableReason ? <TooltipContent>{capability.unavailableReason}</TooltipContent> : null}
      </Tooltip>

      <div className="dpi-control__range" aria-hidden>
        <span>{capability.min.toLocaleString()}</span>
        <span>{capability.max.toLocaleString()}</span>
      </div>

      <div className="dpi-control__toolbar">
        <DpiPresetGroup
          capability={capability}
          onSelect={(value) => {
            setDraftValue(value);
            void onChange(value);
          }}
          onChange={onChange}
          onStagesChange={onStagesChange}
        />
        {reportRateControl}
      </div>

      {capability.shiftDpi !== undefined ? <DpiShiftControl capability={capability} onChange={onShiftChange} /> : null}
    </div>
  );
}

function DpiPresetGroup({ capability, onSelect, onChange, onStagesChange }: {
  capability: DpiCapability;
  onSelect: DpiMutation;
  onChange: DpiMutation;
  onStagesChange: DpiStagesMutation;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<number | null>(null);
  const [editorValue, setEditorValue] = useState(nextStage(capability));
  const maxStages = capability.maxStages ?? 5;
  const openEditor = (stage: number | null) => {
    setEditingStage(stage);
    setEditorValue(stage ?? nextStage(capability));
    setEditorOpen(true);
  };
  const deleteStage = (stage: number) => {
    if (stage === capability.activeDpi || capability.stages.length <= 1) return;
    void onStagesChange(capability.stages.filter((value) => value !== stage));
  };
  const saveStage = async () => {
    if (!validDpi(capability, editorValue)) return;
    if (editorValue !== editingStage && capability.stages.includes(editorValue)) return;
    const nextStages = editingStage === null
      ? [...capability.stages, editorValue]
      : capability.stages.map((stage) => stage === editingStage ? editorValue : stage);
    nextStages.sort((left, right) => left - right);
    await onStagesChange(nextStages);
    if (editingStage === capability.activeDpi && editorValue !== editingStage) await onChange(editorValue);
    setEditorOpen(false);
  };

  return (
    <div className="dpi-presets">
      <span className="dpi-presets__label">Presets</span>
      <ToggleGroup
        type="single"
        value={String(capability.activeDpi)}
        disabled={!capability.writable}
        aria-label="DPI presets"
        onValueChange={(value) => value && void onSelect(Number(value))}
      >
        {capability.stages.map((stage) => (
          <ContextMenu key={stage}>
            <ContextMenuTrigger asChild>
              <ToggleGroupItem value={String(stage)} aria-label={`${stage} DPI`}>{stage.toLocaleString()}</ToggleGroupItem>
            </ContextMenuTrigger>
            <ContextMenuContent aria-label={`${stage} DPI preset actions`}>
              <ContextMenuItem onSelect={() => openEditor(stage)}>
                <Pencil aria-hidden className="size-3.5" /> Edit value
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                disabled={stage === capability.activeDpi || capability.stages.length <= 1}
                onSelect={() => deleteStage(stage)}
              >
                <Trash2 aria-hidden className="size-3.5" /> Delete preset
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </ToggleGroup>

      <Popover open={editorOpen} onOpenChange={setEditorOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={!capability.writable || capability.stages.length >= maxStages}
                className="dpi-presets__add"
                aria-label="Create DPI preset"
                onClick={() => openEditor(null)}
              >
                <Plus aria-hidden className="size-3.5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{capability.stages.length >= maxStages ? `This mouse supports ${maxStages} DPI presets.` : 'Create DPI preset'}</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="dpi-stage-editor">
          <div className="popover-heading">{editingStage === null ? 'Create DPI preset' : 'Edit DPI preset'}</div>
          <p className="popover-description">Use {capability.min.toLocaleString()}–{capability.max.toLocaleString()} DPI in {capability.step} DPI steps.</p>
          <div className="dpi-stage-editor__add-row">
            <Input
              type="number"
              min={capability.min}
              max={capability.max}
              step={capability.step}
              value={editorValue}
              onChange={(event) => setEditorValue(Number(event.target.value))}
              onKeyDown={(event) => event.key === 'Enter' && void saveStage()}
              aria-label={editingStage === null ? 'New DPI preset value' : 'Edited DPI preset value'}
            />
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={!validDpi(capability, editorValue) || (editorValue !== editingStage && capability.stages.includes(editorValue))}
              onClick={() => void saveStage()}
            >
              {editingStage === null ? 'Add' : 'Save'}
            </Button>
          </div>
          <p className="dpi-stage-editor__hint">Right-click any preset to edit or delete it.</p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DpiShiftControl({ capability, onChange }: { capability: DpiCapability; onChange: DpiMutation }) {
  const [value, setValue] = useState(capability.shiftDpi ?? capability.min);
  useEffect(() => setValue(capability.shiftDpi ?? capability.min), [capability.shiftDpi, capability.min]);
  return (
    <div className="dpi-shift-control">
      <div>
        <span>DPI Shift</span>
        <p>Temporarily lowers sensitivity while held.</p>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" size="sm" variant="ghost" disabled={!capability.writable} className="dpi-shift-control__value">
            {(capability.shiftDpi ?? capability.min).toLocaleString()} DPI
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <div className="popover-heading">DPI Shift</div>
          <p className="popover-description">Sensitivity used while the assigned DPI Shift button is held.</p>
          <div className="dpi-shift-control__editor">
            <Input type="number" min={capability.min} max={capability.max} step={capability.step} value={value} onChange={(event) => setValue(Number(event.target.value))} aria-label="DPI Shift value" />
            <Button type="button" size="sm" variant="primary" disabled={!validDpi(capability, value)} onClick={() => void onChange(value)}>Set</Button>
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
  return Number.isInteger(value) && value >= capability.min && value <= capability.max && (value - capability.min) % capability.step === 0;
}

function parseDpi(value: string): number {
  return Number(value.replaceAll(',', ''));
}

function formatDpi(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : '';
}
