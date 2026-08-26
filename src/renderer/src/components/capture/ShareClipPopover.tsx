import { useState } from 'react';
import { Check, FileVideo2, Share2 } from 'lucide-react';
import type { Clip, ClipExportPreset } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { formatBytes, formatDuration } from '@/lib/format';

const sharePresets: Array<{
  id: ClipExportPreset;
  label: string;
  description: string;
  targetBytes?: number;
}> = [
  { id: '10mb', label: '10 MB', description: 'Chat and attachment limits', targetBytes: 10 * 1_024 * 1_024 },
  { id: '25mb', label: '25 MB', description: 'Fast everyday sharing', targetBytes: 25 * 1_024 * 1_024 },
  { id: '50mb', label: '50 MB', description: 'More detail for longer clips', targetBytes: 50 * 1_024 * 1_024 },
  { id: 'original', label: 'Original quality', description: 'Trim only, no size target' },
];

export function ShareClipPopover({ clip, startMs, endMs, exportPending, disabled = false, onExport }: {
  clip: Clip;
  startMs: number;
  endMs: number;
  exportPending: boolean;
  disabled?: boolean;
  onExport: (preset: ClipExportPreset) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ClipExportPreset>('10mb');
  const selectedDurationMs = endMs - startMs;
  const selected = sharePresets.find((candidate) => candidate.id === preset) ?? sharePresets[0]!;
  const proportionalBytes = clip.fileSize * selectedDurationMs / Math.max(1, clip.durationMs);
  const expectedBytes = selected.targetBytes ? Math.min(proportionalBytes, selected.targetBytes) : proportionalBytes;

  const createShareFile = async () => {
    const exported = await onExport(preset);
    if (exported) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="primary" size="sm" className="no-drag" disabled={exportPending || disabled} title={disabled ? 'Clip duration is unavailable' : undefined}>
          <Share2 className="size-4" /> {exportPending ? 'Preparing…' : 'Share'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[368px] p-0" aria-label="Create share file">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start gap-3">
            <FileVideo2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <h3 className="m-0 text-[13px] font-semibold text-foreground">Create share file</h3>
              <p className="m-0 mt-1 text-[10px] leading-4 text-muted-foreground">
                {formatDuration(selectedDurationMs / 1_000)} selected. Switchboard adjusts video bitrate automatically and keeps the original clip unchanged.
              </p>
            </div>
          </div>
        </div>

        <fieldset className="m-0 grid gap-1 border-0 px-3 py-3">
          <legend className="sr-only">File size preset</legend>
          {sharePresets.map((candidate) => {
            const active = candidate.id === preset;
            return (
              <label
                key={candidate.id}
                className={cn(
                  'grid min-h-12 cursor-pointer grid-cols-[minmax(0,1fr)_18px] items-center gap-3 rounded-md border px-3 py-2 transition-colors',
                  active ? 'border-primary/65 bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]' : 'border-transparent hover:bg-surface-hover',
                )}
              >
                <input type="radio" name="share-preset" value={candidate.id} checked={active} onChange={() => setPreset(candidate.id)} className="sr-only" />
                <span className="min-w-0">
                  <strong className="block text-[12px] font-semibold text-foreground">{candidate.label}</strong>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">{candidate.description}</span>
                </span>
                <span className={cn('grid size-[18px] place-items-center rounded-full border', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong text-transparent')} aria-hidden="true">
                  <Check className="size-3" />
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
          <div className="min-w-0 text-[10px] text-muted-foreground">
            <span className="block">Expected output</span>
            <strong className="mt-0.5 block text-[12px] font-semibold tabular-nums text-foreground">
              {selected.targetBytes ? `Up to ${selected.label}` : `About ${formatBytes(expectedBytes)}`}
            </strong>
          </div>
          <Button type="button" variant="primary" size="sm" disabled={exportPending} onClick={() => void createShareFile().catch(() => undefined)}>
            {exportPending ? 'Compressing…' : 'Choose destination'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
