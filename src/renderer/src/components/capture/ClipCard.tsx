import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { autoCaptureClipSummary } from '../../../../shared/auto-capture';
import { Clock } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipActionsMenu, ClipContextMenu, ClipFavorite, ClipShare } from './ClipActions';
import { ClipThumbnail } from './ClipThumbnail';
import type { ClipActions } from './types';

export function ClipCard({ clip, actions, selectionMode, selectedOrder, onToggleSelection }: {
  clip: Clip;
  actions: ClipActions;
  selectionMode: boolean;
  selectedOrder: number | null;
  onToggleSelection: (clip: Clip) => void;
}) {
  const selected = selectedOrder !== null;
  const autoCaptureSummary = autoCaptureClipSummary(clip);
  const activate = () => selectionMode ? onToggleSelection(clip) : actions.open(clip);
  return (
    <li className="min-w-0">
      <ClipContextMenu clip={clip} actions={actions}>
        <article className="capture-clip-card group" data-selection-mode={selectionMode || undefined} data-selected={selected || undefined}>
          <div className="capture-clip-card__media relative overflow-hidden rounded-[7px] border border-border">
            <ClipThumbnail clip={clip} onOpen={activate} selectionMode={selectionMode} selected={selected} />
            {selectionMode ? (
              <label className="capture-clip-selection-control">
                <Checkbox checked={selected} onCheckedChange={() => onToggleSelection(clip)} aria-label={`${selected ? 'Remove' : 'Add'} ${clip.name} ${selected ? 'from' : 'to'} montage`} />
                {selectedOrder ? <span aria-hidden="true">{selectedOrder}</span> : null}
              </label>
            ) : <ClipFavorite clip={clip} onChange={(favorite) => actions.favorite(clip, favorite)} className="absolute bottom-2 right-2" />}
          </div>
          <div className="capture-clip-card__footer min-w-0">
            <div className="capture-clip-card__details min-w-0">
              <h3 className="m-0 truncate text-[12.5px] font-semibold leading-5 text-foreground">
                <button type="button" onClick={activate} className="max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4">
                  {clip.name}
                </button>
              </h3>
              <p className="capture-clip-card__metadata m-0 flex min-w-0 items-center text-[9.5px] tabular-nums leading-4 text-muted-foreground">
                <span className="capture-clip-card__game truncate">{clipGameLabel(clip)}{autoCaptureSummary ? ` · ${autoCaptureSummary} · Auto Capture` : ''}</span>
                <span className="capture-clip-card__time shrink-0"><Clock className="size-3" strokeWidth={1.75} aria-hidden="true" />{formatRelativeTime(clip.createdAt)}</span>
              </p>
            </div>
            <div className="capture-clip-card__quick-actions" hidden={selectionMode}>
              <ClipShare clip={clip} onShare={() => actions.export(clip)} className="capture-clip-card__share" />
              <ClipActionsMenu clip={clip} actions={actions} />
            </div>
          </div>
        </article>
      </ClipContextMenu>
    </li>
  );
}
