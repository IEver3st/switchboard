import { Star } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { cn } from '@/lib/cn';
import { formatBytes, formatClipTimestamp, formatDuration } from '@/lib/format';
import { ClipActionsMenu } from './ClipActions';
import { ClipThumbnail } from './ClipThumbnail';
import type { ClipActions } from './types';

export function ClipList({ clips, actions }: { clips: Clip[]; actions: ClipActions }) {
  return (
    <div className="overflow-x-auto border-y border-border">
      <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
        <thead>
          <tr className="h-9 text-[10px] font-medium text-muted-foreground">
            <th className="w-[44%] px-2 font-medium">Clip</th>
            <th className="w-24 px-2 font-medium">Duration</th>
            <th className="w-44 px-2 font-medium">Date</th>
            <th className="w-24 px-2 text-right font-medium">Size</th>
            <th className="w-12 px-1"><span className="sr-only">Favorite</span></th>
            <th className="w-12 px-1"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {clips.map((clip) => (
            <tr key={clip.id} className="group h-[74px] border-t border-border transition-colors hover:bg-card">
              <td className="min-w-0 px-2 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <ClipThumbnail clip={clip} compact onOpen={() => actions.open(clip)} className="h-14 w-[100px] shrink-0 rounded-md border border-border" />
                  <button type="button" onClick={() => actions.open(clip)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:underline">
                    <span className="block truncate text-[13px] font-semibold text-foreground hover:text-primary">{clip.name}</span>
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">{clipGameLabel(clip)}</span>
                  </button>
                </div>
              </td>
              <td className="px-2 text-[11px] tabular-nums text-text-secondary">{formatDuration(clip.durationMs / 1_000)}</td>
              <td className="px-2 text-[11px] tabular-nums text-muted-foreground">{formatClipTimestamp(clip.createdAt)}</td>
              <td className="px-2 text-right text-[11px] tabular-nums text-muted-foreground">{formatBytes(clip.fileSize)}</td>
              <td className="px-1 text-center">
                <button
                  type="button"
                  aria-label={clip.favorite ? `Remove ${clip.name} from favorites` : `Add ${clip.name} to favorites`}
                  aria-pressed={clip.favorite}
                  onClick={() => actions.favorite(clip, !clip.favorite)}
                  className={cn('grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', clip.favorite && 'text-primary')}
                >
                  <Star className={cn('size-4', clip.favorite && 'fill-current')} />
                </button>
              </td>
              <td className="px-1 text-center"><ClipActionsMenu clip={clip} actions={actions} className="border-0 bg-transparent text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
