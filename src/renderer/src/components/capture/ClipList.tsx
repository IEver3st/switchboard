import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { formatBytes, formatRelativeTime, formatVideoQuality } from '@/lib/format';
import { ClipActionsMenu, ClipFavorite, ClipShare } from './ClipActions';
import { ClipThumbnail } from './ClipThumbnail';
import type { ClipActions } from './types';

export function ClipList({ clips, actions }: { clips: Clip[]; actions: ClipActions }) {
  return (
    <ul className="capture-clip-list" aria-label="Clips in list view">
      {clips.map((clip) => (
        <li key={clip.id} className="capture-clip-list__item group">
          <div className="capture-clip-list__preview">
            <ClipThumbnail
              clip={clip}
              onOpen={() => actions.open(clip)}
              className="capture-clip-list__thumbnail rounded-md border border-border"
            />
            <ClipFavorite
              clip={clip}
              onChange={(favorite) => actions.favorite(clip, favorite)}
              className="absolute right-2 top-2 opacity-100"
            />
          </div>

          <div className="min-w-0">
            <h3 className="m-0 truncate text-[13px] font-semibold leading-5 text-foreground">
              <button
                type="button"
                onClick={() => actions.open(clip)}
                className="max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline"
              >
                {clip.name}
              </button>
            </h3>
            <p className="m-0 mt-0.5 truncate text-[11px] font-medium leading-4 text-text-secondary">
              {clipGameLabel(clip)}
            </p>
            <p className="capture-clip-list__metadata">
              <span>{formatRelativeTime(clip.createdAt)}</span>
              <span>Video quality: {formatVideoQuality(clip.width, clip.height, clip.fps)}</span>
              <span>Size: {formatBytes(clip.fileSize)}</span>
            </p>
          </div>

          <div className="capture-clip-list__actions">
            <ClipShare clip={clip} onShare={() => actions.export(clip)} className="border-0 bg-transparent text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground" />
            <ClipActionsMenu
              clip={clip}
              actions={actions}
              className="border-0 bg-transparent text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
