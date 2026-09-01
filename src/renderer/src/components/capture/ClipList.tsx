import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { autoCaptureClipSummary } from '../../../../shared/auto-capture';
import { formatBytes, formatRelativeTime, formatVideoQuality } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ClipActionsMenu, ClipContextMenu, ClipFavorite, ClipShare } from './ClipActions';
import { groupClips } from './ClipGrid';
import { ClipThumbnail } from './ClipThumbnail';
import type { ClipActions } from './types';

export function ClipList({ clips, actions, selectionMode, selectedClipIds, onToggleSelection }: {
  clips: Clip[];
  actions: ClipActions;
  selectionMode: boolean;
  selectedClipIds: string[];
  onToggleSelection: (clip: Clip) => void;
}) {
  return (
    <div className="capture-clip-list-groups">
      {groupClips(clips).map((group) => (
        <section key={group.key} aria-labelledby={`clip-list-group-${group.key}`}>
          <div className="capture-clip-group__header flex items-center gap-2.5">
            <h3 id={`clip-list-group-${group.key}`} className="m-0 text-[11px] font-semibold tracking-[-0.01em] text-text-secondary">{group.label}</h3>
            <span className="text-[9.5px] tabular-nums text-text-description">{group.clips.length}</span>
            <Separator className="min-w-6 flex-1" />
          </div>
          <ul className="capture-clip-list" aria-label={`${group.label} clips in list view`}>
      {group.clips.map((clip) => {
        const selectedOrder = selectedClipIds.includes(clip.id) ? selectedClipIds.indexOf(clip.id) + 1 : null;
        const selected = selectedOrder !== null;
        const activate = () => selectionMode ? onToggleSelection(clip) : actions.open(clip);
        const autoCaptureSummary = autoCaptureClipSummary(clip);
        return (
        <ClipContextMenu key={clip.id} clip={clip} actions={actions}><li className="capture-clip-list__item group" data-selection-mode={selectionMode || undefined} data-selected={selected || undefined}>
          <div className="capture-clip-list__preview">
            <ClipThumbnail
              clip={clip}
              onOpen={activate}
              className="capture-clip-list__thumbnail rounded-md border border-border"
              selectionMode={selectionMode}
              selected={selected}
            />
            {selectionMode ? (
              <label className="capture-clip-selection-control">
                <Checkbox checked={selected} onCheckedChange={() => onToggleSelection(clip)} aria-label={`${selected ? 'Remove' : 'Add'} ${clip.name} ${selected ? 'from' : 'to'} montage`} />
                {selectedOrder ? <span aria-hidden="true">{selectedOrder}</span> : null}
              </label>
            ) : <ClipFavorite
              clip={clip}
              onChange={(favorite) => actions.favorite(clip, favorite)}
              className="absolute right-2 top-2 opacity-100"
            />}
          </div>

          <div className="min-w-0">
            <h3 className="m-0 truncate text-[13px] font-semibold leading-5 text-foreground">
              <button
                type="button"
                onClick={activate}
                className="max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline"
              >
                {clip.name}
              </button>
            </h3>
            <p className="m-0 mt-0.5 truncate text-[11px] font-medium leading-4 text-text-secondary">
              {clipGameLabel(clip)}{autoCaptureSummary ? ` · ${autoCaptureSummary} · Auto Capture` : ''}
            </p>
            <p className="capture-clip-list__metadata">
              <span>{formatRelativeTime(clip.createdAt)}</span>
              <span>Video quality: {formatVideoQuality(clip.width, clip.height, clip.fps)}</span>
              <span>Size: {formatBytes(clip.fileSize)}</span>
            </p>
          </div>

          <div className="capture-clip-list__actions" hidden={selectionMode}>
            <ClipShare clip={clip} onShare={() => actions.export(clip)} className="border-0 bg-transparent text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground" />
            <ClipActionsMenu
              clip={clip}
              actions={actions}
              className="border-0 bg-transparent text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground"
            />
          </div>
        </li></ClipContextMenu>
      );})}
          </ul>
        </section>
      ))}
    </div>
  );
}
