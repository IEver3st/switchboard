import { memo, type CSSProperties } from 'react';
import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { autoCaptureClipSummary } from '../../../../shared/auto-capture';
import { formatRelativeTime } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipActionsMenu, ClipContextMenu, ClipFavorite, ClipShare } from './ClipActions';
import { ClipThumbnail } from './ClipThumbnail';
import type { ClipActions } from './types';

export const ClipCard = memo(function ClipCard({ clip, actions, selectionMode, selectedOrder, onToggleSelection, style, position, total }: {
  style?: CSSProperties;
  position?: number;
  total?: number;
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
    <li className="min-w-0" style={style} aria-posinset={position} aria-setsize={total} data-library-clip-id={clip.id}>
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
            <div className="capture-clip-card__quick-actions" hidden={selectionMode}>
              <ClipActionsMenu clip={clip} actions={actions} />
              <ClipShare clip={clip} onShare={() => actions.export(clip)} className="capture-clip-card__share" />
            </div>
          </div>
          <div className="capture-clip-card__footer min-w-0">
            <div className="capture-clip-card__details min-w-0">
              <h3 className="m-0 text-[12.5px] font-semibold leading-5 text-foreground">
                <button type="button" onClick={activate} className="capture-clip-card__title max-w-full text-left hover:text-primary focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4">
                  {clip.name}
                </button>
              </h3>
              <p className="capture-clip-card__metadata m-0 flex min-w-0 items-center text-[9.5px] tabular-nums leading-4 text-muted-foreground">
                <span className="capture-clip-card__game truncate">{clipGameLabel(clip)}{autoCaptureSummary ? ` · ${autoCaptureSummary} · Auto Capture` : ' · Manual Capture'}</span>
                <span className="capture-clip-card__time shrink-0"><time dateTime={new Date(clip.createdAt).toISOString()} title={new Date(clip.createdAt).toLocaleString()}>{formatRelativeTime(clip.createdAt)}</time></span>
              </p>
            </div>
          </div>
        </article>
      </ClipContextMenu>
    </li>
  );
});
