import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { autoCaptureClipSummary } from '../../../../shared/auto-capture';
import { formatClipTimestamp } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipActionsMenu, ClipContextMenu, ClipFavorite } from './ClipActions';
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
            ) : <ClipFavorite clip={clip} onChange={(favorite) => actions.favorite(clip, favorite)} className="absolute left-2 top-2" />}
            <div className="capture-clip-card__quick-actions absolute right-2 top-2" hidden={selectionMode}>
              <ClipActionsMenu clip={clip} actions={actions} />
            </div>
          </div>
          <div className="capture-clip-card__footer min-w-0">
            <h3 className="m-0 truncate text-[12.5px] font-semibold leading-5 text-foreground">
              <button type="button" onClick={activate} className="max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4">
                {clip.name}
              </button>
            </h3>
            <p className="capture-clip-card__metadata m-0 flex min-w-0 items-center text-[10px] tabular-nums leading-4 text-muted-foreground">
              <span className="truncate font-medium text-text-secondary">
                {clipGameLabel(clip)}{autoCaptureSummary ? ` · ${autoCaptureSummary} · Auto Capture` : ''}
              </span>
              <span className="shrink-0">{formatClipTimestamp(clip.createdAt)}</span>
            </p>
          </div>
        </article>
      </ClipContextMenu>
    </li>
  );
}
