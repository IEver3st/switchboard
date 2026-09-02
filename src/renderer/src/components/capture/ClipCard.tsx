import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { formatBytes, formatClipTimestamp, formatVideoQuality } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipActionsMenu, ClipFavorite, ClipShare } from './ClipActions';
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
  const activate = () => selectionMode ? onToggleSelection(clip) : actions.open(clip);
  return (
    <li className="min-w-0">
      <article className="capture-clip-card group overflow-hidden rounded-lg border border-border bg-surface-1" data-selection-mode={selectionMode || undefined} data-selected={selected || undefined}>
        <div className="capture-clip-card__media relative">
          <ClipThumbnail clip={clip} onOpen={activate} selectionMode={selectionMode} selected={selected} />
          {selectionMode ? (
            <label className="capture-clip-selection-control">
              <Checkbox checked={selected} onCheckedChange={() => onToggleSelection(clip)} aria-label={`${selected ? 'Remove' : 'Add'} ${clip.name} ${selected ? 'from' : 'to'} montage`} />
              {selectedOrder ? <span aria-hidden="true">{selectedOrder}</span> : null}
            </label>
          ) : <ClipFavorite clip={clip} onChange={(favorite) => actions.favorite(clip, favorite)} className="absolute left-2 top-2" />}
          <div className="capture-clip-card__quick-actions absolute right-2 top-2" hidden={selectionMode}>
            <ClipShare clip={clip} onShare={() => actions.export(clip)} />
            <ClipActionsMenu clip={clip} actions={actions} />
          </div>
        </div>
        <div className="capture-clip-card__footer min-w-0">
          <h3 className="m-0 truncate text-[14px] font-semibold leading-5 text-foreground">
            <button type="button" onClick={activate} className="max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline">
              {clip.name}
            </button>
          </h3>
          <p className="m-0 mt-0.5 truncate text-[12px] font-semibold leading-4 text-text-secondary">{clipGameLabel(clip)}</p>
          <p className="capture-clip-card__metadata m-0 text-[11px] tabular-nums leading-4 text-muted-foreground">
            <span>{formatClipTimestamp(clip.createdAt)}</span>
            <span>{formatVideoQuality(clip.width, clip.height, clip.fps)}</span>
            <span>{formatBytes(clip.fileSize)}</span>
          </p>
        </div>
      </article>
    </li>
  );
}
