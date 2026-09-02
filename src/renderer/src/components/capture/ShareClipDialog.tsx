import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';
import { Check, FolderOpen, Grip, Share2, Video } from 'lucide-react';
import type { Clip, ClipExportPreset, ClipExportProgress, PreparedShareFile } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { switchboardApi } from '@/lib/demo-api';
import { formatBytes, formatDuration } from '@/lib/format';

const sharePresets: Array<{
  id: ClipExportPreset;
  label: string;
  description: string;
  targetBytes?: number;
}> = [
  { id: 'original', label: 'Original', description: 'No size target' },
  { id: '10mb', label: '10 MB', description: 'Works with smaller upload limits', targetBytes: 10 * 1_024 * 1_024 },
  { id: '25mb', label: '25 MB', description: 'Balanced detail and upload size', targetBytes: 25 * 1_024 * 1_024 },
  { id: '50mb', label: '50 MB', description: 'More detail for longer clips', targetBytes: 50 * 1_024 * 1_024 },
];

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function ShareClipDialog({ clip, startMs, endMs, exportPending, disabled = false, projectType = 'single', segmentCount = 1, sourceBytes, selectedDurationMs, onExport, onCancelExport }: {
  clip: Clip;
  startMs: number;
  endMs: number;
  exportPending: boolean;
  disabled?: boolean;
  projectType?: 'single' | 'montage';
  segmentCount?: number;
  sourceBytes?: number;
  selectedDurationMs?: number;
  onExport: (preset: ClipExportPreset, exportId: string) => Promise<boolean | PreparedShareFile | null>;
  onCancelExport?: (exportId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ClipExportPreset>('10mb');
  const [activeExportId, setActiveExportId] = useState<string | null>(null);
  const activeExportIdRef = useRef<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ClipExportProgress | null>(null);
  const [prepared, setPrepared] = useState<PreparedShareFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const durationMs = selectedDurationMs ?? endMs - startMs;
  const selected = sharePresets.find((candidate) => candidate.id === preset) ?? sharePresets[1]!;
  const proportionalBytes = sourceBytes ?? clip.fileSize * durationMs / Math.max(1, clip.durationMs);
  const expectedBytes = selected.targetBytes ? Math.min(proportionalBytes, selected.targetBytes) : proportionalBytes;
  const sourceName = clip.path.split(/[\\/]/).at(-1) ?? clip.name;
  const visibleName = prepared?.name ?? sourceName;
  const visibleBytes = prepared?.fileSize ?? expectedBytes;
  const canDrag = projectType === 'single' && prepared !== null;
  const progressLabel = exportProgress?.stage === 'finalizing' || exportProgress?.stage === 'complete'
    ? 'Finalizing share copy'
    : projectType === 'montage'
      ? 'Exporting montage'
      : 'Compressing clip';

  useEffect(() => switchboardApi.subscribeClipExportProgress((progress) => {
    if (progress.exportId !== activeExportIdRef.current) return;
    setExportProgress(progress);
  }), []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && exportPending) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setPrepared(null);
      setError(null);
      setActiveExportId(null);
      activeExportIdRef.current = null;
      setExportProgress(null);
    }
  };

  const createShareFile = async () => {
    const exportId = crypto.randomUUID();
    activeExportIdRef.current = exportId;
    setActiveExportId(exportId);
    setExportProgress(null);
    setPrepared(null);
    setError(null);
    try {
      const result = await onExport(preset, exportId);
      if (result && typeof result === 'object') setPrepared(result);
      else if (result === true) setOpen(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      activeExportIdRef.current = null;
      setActiveExportId(null);
    }
  };

  const cancelExport = async () => {
    if (!activeExportId || !onCancelExport) return;
    await onCancelExport(activeExportId);
  };

  const selectPreset = (value: string) => {
    if (!value) return;
    setPreset(value as ClipExportPreset);
    setPrepared(null);
    setError(null);
    setExportProgress(null);
  };

  const startFileDrag = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!prepared) return;
    event.preventDefault();
    switchboardApi.startPreparedShareDrag(prepared.id);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="primary" size="sm" className="no-drag" disabled={exportPending || disabled} title={disabled ? 'Clip duration is unavailable' : undefined}>
          <Share2 className="size-4" aria-hidden="true" /> {exportPending ? 'Preparing…' : 'Share'}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[520px] overflow-hidden p-0 no-drag" data-share-clip-dialog data-share-state={exportPending ? 'preparing' : prepared ? 'ready' : error ? 'error' : 'idle'}>
        <DialogHeader className="px-5 pb-3 pt-5 pr-12">
          <DialogTitle>{projectType === 'montage' ? 'Export montage' : 'Share clip'}</DialogTitle>
          <DialogDescription>
            {projectType === 'montage'
              ? `${formatDuration(durationMs / 1_000)} across ${segmentCount} ${segmentCount === 1 ? 'clip' : 'clips'}. Choose an output size and save a copy.`
              : 'Prepare a share copy, then drag the clip straight into Discord or another app.'}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-4">
          <div
            className="group overflow-hidden rounded-md border border-border bg-surface-1 data-[ready=true]:cursor-grab data-[ready=true]:border-primary/55 data-[ready=true]:active:cursor-grabbing"
            data-ready={canDrag ? 'true' : 'false'}
            draggable={canDrag}
            onDragStart={startFileDrag}
            role="group"
            aria-label={canDrag ? `${visibleName}, ready to drag into another app` : `${visibleName} preview`}
          >
            <div className="relative aspect-video overflow-hidden bg-background">
              {!thumbnailFailed && clip.thumbnailPath ? (
                <img
                  src={`switchboard-media://thumbnail/${encodeURIComponent(clip.id)}`}
                  alt=""
                  draggable={false}
                  onError={() => setThumbnailFailed(true)}
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center text-muted-foreground" aria-hidden="true"><Video className="size-8" strokeWidth={1.4} /></div>
              )}
              {exportPending ? (
                <div className="absolute inset-0 flex items-end bg-black/65 p-4 text-white" role="status" aria-live="polite" data-share-progress>
                  <div className="w-full rounded-sm bg-black/45 px-3 py-2.5 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold">
                      <span>{progressLabel}</span>
                      <span className="tabular-nums text-white/80">{exportProgress ? `${exportProgress.percent}%` : 'Starting…'}</span>
                    </div>
                    <Progress
                      value={exportProgress?.percent ?? 0}
                      aria-label={`${progressLabel} progress`}
                      aria-valuetext={exportProgress ? `${exportProgress.percent} percent` : 'Starting'}
                      className="h-1.5 bg-white/20"
                      indicatorClassName="bg-white"
                    />
                  </div>
                </div>
              ) : canDrag ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/72 px-3 py-2 text-white">
                  <span className="flex items-center gap-2 text-[11px] font-semibold"><Grip className="size-4" aria-hidden="true" />Drag clip into Discord</span>
                  <Check className="size-4 text-primary" aria-hidden="true" />
                </div>
              ) : null}
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 border-t border-border px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-foreground" title={visibleName}>{visibleName}</div>
                <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{formatDuration(durationMs / 1_000)} · {formatBytes(visibleBytes)}</div>
              </div>
              {prepared ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[10px]" onClick={() => void switchboardApi.revealPreparedShareFile(prepared.id).catch((cause) => setError(errorMessage(cause)))}>
                  <FolderOpen className="size-3.5" aria-hidden="true" /> Show in folder
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold text-foreground">File size</span>
              <span className="text-[10px] text-muted-foreground">{selected.description}</span>
            </div>
            <ToggleGroup type="single" value={preset} onValueChange={selectPreset} disabled={exportPending} aria-label="File size preset" className="grid w-full grid-cols-4 bg-surface-interactive">
              {sharePresets.map((candidate) => (
                <ToggleGroupItem key={candidate.id} value={candidate.id} data-share-preset={candidate.id} className="h-9 min-w-0 px-2 text-[11px]" aria-label={candidate.label}>{candidate.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {error ? <p className="mt-3 rounded-sm border border-destructive/35 bg-destructive/10 px-3 py-2 text-[11px] leading-4 text-destructive" role="alert">{error}</p> : null}
        </div>

        <Separator />
        <footer className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0 text-[10px] leading-4 text-muted-foreground" aria-live="polite">
            <span className="block">{prepared ? 'Share copy' : 'Expected output'}</span>
            <strong className="block text-[12px] font-semibold tabular-nums text-foreground">
              {prepared ? `${formatBytes(prepared.fileSize)} · Ready to drag` : selected.targetBytes ? `Up to ${selected.label}` : `About ${formatBytes(expectedBytes)}`}
            </strong>
          </div>
          {exportPending && activeExportId && onCancelExport ? (
            <Button type="button" variant="secondary" size="sm" className="min-w-[132px]" onClick={() => void cancelExport().catch((cause) => setError(errorMessage(cause)))}>Cancel</Button>
          ) : prepared ? (
            <Button type="button" variant="primary" size="sm" className="min-w-[132px]" onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <Button type="button" variant="primary" size="sm" className="min-w-[132px]" disabled={exportPending} onClick={() => void createShareFile()}>
              {projectType === 'montage' ? 'Choose destination' : 'Prepare clip'}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
