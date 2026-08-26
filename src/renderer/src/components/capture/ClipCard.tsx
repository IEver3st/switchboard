import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { formatBytes, formatClipTimestamp } from '@/lib/format';
import { ClipActionsMenu, ClipFavorite } from './ClipActions';
import { ClipThumbnail } from './ClipThumbnail';
import type { ClipActions } from './types';

export function ClipCard({ clip, actions }: { clip: Clip; actions: ClipActions }) {
  return (
    <li className="min-w-0">
      <article className="capture-clip-card group overflow-hidden rounded-lg border border-border bg-surface-1 transition-[border-color,background-color] duration-100 hover:border-border-strong hover:bg-surface-interactive">
        <div className="relative">
          <ClipThumbnail clip={clip} onOpen={() => actions.open(clip)} />
          <ClipFavorite clip={clip} onChange={(favorite) => actions.favorite(clip, favorite)} className="absolute left-2 top-2" />
          <ClipActionsMenu clip={clip} actions={actions} className="absolute right-2 top-2" />
        </div>
        <div className="min-w-0 px-3 py-2.5">
          <h3 className="m-0 truncate text-[14px] font-semibold leading-5 text-foreground">
            <button type="button" onClick={() => actions.open(clip)} className="max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline">
              {clip.name}
            </button>
          </h3>
          <p className="m-0 mt-0.5 truncate text-[12px] font-medium leading-4 text-text-secondary">{clipGameLabel(clip)}</p>
          <p className="m-0 mt-1 text-[11px] tabular-nums leading-4 text-muted-foreground">
            {formatClipTimestamp(clip.createdAt)} <span aria-hidden="true">·</span> {formatBytes(clip.fileSize)}
          </p>
        </div>
      </article>
    </li>
  );
}
