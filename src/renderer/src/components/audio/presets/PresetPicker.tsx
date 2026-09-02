import { useState, type ReactNode } from 'react';
import { Copy, Download, MoreHorizontal, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import type { AudioPathId, AudioPathPreset } from '../../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function PresetPicker({
  kind,
  label = 'Sound',
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
  label?: string;
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
  const [mode, setMode] = useState<'create' | 'rename' | null>(null);
  const [name, setName] = useState('');

  const closeEditor = () => {
    setMode(null);
    setName('');
  };

  const save = () => {
    const normalized = name.trim();
    if (!normalized) return;
    if (mode === 'rename' && active && !active.builtIn) onRename(active.id, normalized);
    else onCreate(normalized);
    closeEditor();
  };

  return (
    <div className="preset-picker">
      <div className="preset-picker__primary">
        <label>
          <span>{label}</span>
          <Select
            value={activeId ?? 'custom'}
            onValueChange={(value) => {
              closeEditor();
              if (value !== 'custom') onApply(value);
            }}
            disabled={pending}
          >
            <SelectTrigger aria-label={`${kind} preset`}>
              <SelectValue placeholder="Custom" />
            </SelectTrigger>
            <SelectContent>
              {!activeId ? <SelectItem value="custom">Custom</SelectItem> : null}
              {relevant.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>

        <div className="preset-picker__actions" aria-label="Preset actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label="Open preset actions"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { setMode('create'); setName(''); }}><Plus className="size-3.5" />Save as preset</DropdownMenuItem>
              {active ? <DropdownMenuItem disabled={pending} onSelect={() => onDuplicate(active.id)}><Copy className="size-3.5" />Duplicate</DropdownMenuItem> : null}
              {active && !active.builtIn ? <DropdownMenuItem disabled={pending} onSelect={() => { setMode('rename'); setName(active.name); }}><Pencil className="size-3.5" />Rename</DropdownMenuItem> : null}
              {active && !active.builtIn ? <DropdownMenuItem disabled={pending} onSelect={() => { closeEditor(); onDelete(active.id); }}><Trash2 className="size-3.5" />Delete</DropdownMenuItem> : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={pending || !desktopFeatures} onSelect={onImport}><Upload className="size-3.5" />Import</DropdownMenuItem>
              <DropdownMenuItem disabled={pending || !active || !desktopFeatures} onSelect={() => active && onExport(active.id)}><Download className="size-3.5" />Export</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {mode ? (
        <div className="preset-picker__editor">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save();
              if (event.key === 'Escape') closeEditor();
            }}
            placeholder={mode === 'rename' ? 'Preset name' : 'New preset name'}
            aria-label="Preset name"
          />
          <Button type="button" variant="secondary" size="sm" disabled={!name.trim() || pending} onClick={save}>
            <Save className="size-3.5" /> {mode === 'rename' ? 'Rename' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Cancel preset editing" onClick={closeEditor}>
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PresetAction({
  label,
  tooltip,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tooltip: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={label} onClick={onClick}>
          <span className="[&>svg]:size-3.5">{children}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
