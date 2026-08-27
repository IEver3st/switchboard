import { useState } from 'react';
import { Share2 } from 'lucide-react';
import type { Clip, ClipExportPreset } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
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

export function ShareClipDialog({ clip, startMs, endMs, exportPending, disabled = false, onExport }: {
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="primary" size="sm" className="no-drag" disabled={exportPending || disabled} title={disabled ? 'Clip duration is unavailable' : undefined}>
          <Share2 className="size-4" aria-hidden="true" /> {exportPending ? 'Preparing…' : 'Share'}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[440px] overflow-hidden p-0 no-drag" data-share-clip-dialog>
        <DialogHeader className="px-5 pb-4 pt-5 pr-12">
          <DialogTitle>Create share file</DialogTitle>
          <DialogDescription>
            {formatDuration(selectedDurationMs / 1_000)} selected. Switchboard adjusts video bitrate automatically and keeps the original clip unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 pb-4">
          <RadioGroup
            value={preset}
            onValueChange={(value) => setPreset(value as ClipExportPreset)}
            disabled={exportPending}
            aria-label="File size preset"
            className="overflow-hidden rounded-md border border-border bg-surface-1/35"
          >
            {sharePresets.map((candidate) => {
              const active = candidate.id === preset;
              const itemId = `share-preset-${candidate.id}`;
              return (
                <label
                  key={candidate.id}
                  htmlFor={itemId}
                  data-state={active ? 'checked' : 'unchecked'}
                  data-disabled={exportPending ? '' : undefined}
                  className={cn(
                    'grid min-h-[52px] cursor-pointer grid-cols-[minmax(0,1fr)_16px] items-center gap-3 border-b border-border/70 px-3 py-2.5 transition-colors duration-150 last:border-b-0 hover:bg-surface-hover focus-within:relative focus-within:z-10 focus-within:outline focus-within:outline-2 focus-within:outline-primary/75 focus-within:outline-offset-[-2px]',
                    active && 'bg-[color-mix(in_srgb,var(--primary)_9%,transparent)]',
                    exportPending && 'cursor-not-allowed opacity-45 hover:bg-transparent',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold leading-4 text-foreground">{candidate.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{candidate.description}</span>
                  </span>
                  <RadioGroupItem id={itemId} value={candidate.id} aria-label={candidate.label} />
                </label>
              );
            })}
          </RadioGroup>
        </div>

        <Separator />
        <footer className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0 text-[10px] leading-4 text-muted-foreground">
            <span className="block">Expected output</span>
            <strong className="block text-[12px] font-semibold tabular-nums text-foreground">
              {selected.targetBytes ? `Up to ${selected.label}` : `About ${formatBytes(expectedBytes)}`}
            </strong>
          </div>
          <Button type="button" variant="primary" size="sm" className="min-w-[148px]" disabled={exportPending} onClick={() => void createShareFile().catch(() => undefined)}>
            {exportPending ? 'Compressing…' : 'Choose destination'}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
