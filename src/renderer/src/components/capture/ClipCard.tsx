import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { formatBytes, formatClipTimestamp, formatVideoQuality } from '@/lib/format';
import { ClipActionsMenu, ClipFavorite, ClipShare } from './ClipActions';
import { ClipThumbnail } from './ClipThumbnail';
import type { ClipActions } from './types';

export function ClipCard({ clip, actions }: { clip: Clip; actions: ClipActions }) {
  return (
    <li className="min-w-0">
      <article className="capture-clip-card group overflow-hidden rounded-md border border-border bg-surface-1">
        <div className="capture-clip-card__media relative">
          <ClipThumbnail clip={clip} onOpen={() => actions.open(clip)} />
          <ClipFavorite clip={clip} onChange={(favorite) => actions.favorite(clip, favorite)} className="absolute left-2 top-2" />
          <div className="capture-clip-card__quick-actions absolute right-2 top-2">
            <ClipShare clip={clip} onShare={() => actions.export(clip)} />
            <ClipActionsMenu clip={clip} actions={actions} />
          </div>
        </div>
        <div className="capture-clip-card__footer min-w-0 px-3 py-2.5">
          <h3 className="m-0 truncate text-[14px] font-semibold leading-5 text-foreground">
            <button type="button" onClick={() => actions.open(clip)} className="max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline">
              {clip.name}
            </button>
          </h3>
          <p className="m-0 mt-0.5 truncate text-[11px] font-semibold leading-4 text-text-secondary">{clipGameLabel(clip)}</p>
          <p className="capture-clip-card__metadata m-0 mt-1.5 text-[10px] tabular-nums leading-4 text-muted-foreground">
            <span>{formatClipTimestamp(clip.createdAt)}</span>
            <span>{formatVideoQuality(clip.width, clip.height, clip.fps)}</span>
            <span>{formatBytes(clip.fileSize)}</span>
          </p>
        </div>
      </article>
    </li>
  );
}
