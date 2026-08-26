import { useState } from 'react';
import { Copy, Download, Plus, Save, Trash2, Upload } from 'lucide-react';
import type { AudioPathId, AudioPathPreset } from '../../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function PresetPicker({
  kind,
  presets,
  activeId,
  pending,
  desktopFeatures,
  onApply,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
}: {
  kind: AudioPathId;
  presets: AudioPathPreset[];
  activeId: string | null;
  pending: boolean;
  desktopFeatures: boolean;
  onApply: (presetId: string) => void;
  onCreate: (name: string) => void;
  onRename: (presetId: string, name: string) => void;
  onDuplicate: (presetId: string) => void;
  onDelete: (presetId: string) => void;
  onImport: () => void;
  onExport: (presetId: string) => void;
}) {
  const relevant = presets.filter((preset) => preset.kind === kind);
  const active = relevant.find((preset) => preset.id === activeId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const save = () => {
    const normalized = name.trim();
    if (!normalized) return;
    if (editing && active && !active.builtIn) onRename(active.id, normalized);
    else onCreate(normalized);
    setName('');
    setEditing(false);
  };

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <label className="flex min-w-0 items-center gap-2 text-[9px] text-muted-foreground">
          <span>Preset</span>
          <Select value={activeId ?? 'custom'} onValueChange={(value) => value !== 'custom' && onApply(value)} disabled={pending}>
            <SelectTrigger className="h-8 w-44 text-[10px]" aria-label={`${kind} preset`}>
              <SelectValue placeholder="Custom" />
            </SelectTrigger>
            <SelectContent>
              {!activeId ? <SelectItem value="custom">Custom</SelectItem> : null}
              {relevant.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8" disabled={pending} aria-label="Save current settings as a preset" onClick={() => { setEditing(false); setName(''); }}>
              <Plus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save current settings</TooltipContent>
        </Tooltip>
        {active ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={pending} aria-label={`Duplicate ${active.name}`} onClick={() => onDuplicate(active.id)}>
                <Copy className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate preset</TooltipContent>
          </Tooltip>
        ) : null}
        {active && !active.builtIn ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={pending} aria-label={`Delete ${active.name}`} onClick={() => onDelete(active.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete preset</TooltipContent>
          </Tooltip>
        ) : null}
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8" disabled={pending || !desktopFeatures} aria-label="Import audio preset" onClick={onImport}>
              <Upload className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{desktopFeatures ? 'Import preset' : 'Import is available in the desktop app'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8" disabled={pending || !active || !desktopFeatures} aria-label="Export audio preset" onClick={() => active && onExport(active.id)}>
              <Download className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{desktopFeatures ? 'Export preset' : 'Export is available in the desktop app'}</TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-2 flex max-w-sm items-center gap-1.5">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={() => { if (active && !active.builtIn && !name) { setEditing(true); setName(active.name); } }}
          onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
          placeholder={active && !active.builtIn ? 'Rename or save a new preset' : 'New preset name'}
          aria-label="Preset name"
          className="h-7 text-[9px]"
        />
        <Button type="button" variant="secondary" size="sm" className="h-7 gap-1 px-2 text-[9px]" disabled={!name.trim() || pending} onClick={save}>
          <Save className="size-3" /> {editing ? 'Rename' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
