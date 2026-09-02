import { useState } from 'react';
import { Play, Video } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';

export function ClipThumbnail({ clip, onOpen, className, compact = false, selectionMode = false, selected = false }: {
  clip: Clip;
  onOpen: () => void;
  className?: string;
  compact?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const hasThumbnail = Boolean(clip.thumbnailPath) && !failed;
  return (
    <button
      type="button"
      data-clip-id={clip.id}
      onClick={onOpen}
      aria-label={selectionMode ? `${selected ? 'Remove' : 'Add'} ${clip.name} ${selected ? 'from' : 'to'} montage` : `Open ${clip.name}`}
      aria-pressed={selectionMode ? selected : undefined}
      className={cn(
        'relative grid aspect-video w-full place-items-center overflow-hidden bg-background text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/65',
        className,
      )}
    >
      {hasThumbnail ? (
        <img
          src={`switchboard-media://thumbnail/${encodeURIComponent(clip.id)}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover transition-transform duration-150 ease-out group-hover:scale-[1.015] motion-reduce:transition-none"
        />
      ) : failed ? (
        <span className="grid justify-items-center gap-2 text-[11px] text-muted-foreground">
          <Video className={compact ? 'size-4' : 'size-6'} strokeWidth={1.5} />
          {compact ? null : 'Thumbnail unavailable'}
        </span>
      ) : (
        <span className="absolute inset-0 grid content-end gap-2 p-3" role="status" aria-label="Preparing thumbnail">
          <Skeleton className="absolute inset-0 size-full rounded-none bg-surface-2" />
          {!compact ? <><Skeleton className="relative h-2.5 w-2/5 bg-surface-hover" /><Skeleton className="relative h-2 w-1/4 bg-surface-interactive" /></> : null}
        </span>
      )}
      {!compact && !selectionMode ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-[background-color,opacity] duration-100 group-hover:bg-black/15 group-hover:opacity-100 motion-reduce:transition-none" aria-hidden="true">
          <span className="grid size-11 place-items-center rounded-md border border-white/15 bg-black/75 text-white shadow-sm"><Play className="ml-0.5 size-5 fill-current" /></span>
        </span>
      ) : null}
      <span className={cn(
        'capture-clip-duration absolute bottom-2.5 right-2.5 rounded-sm px-2 py-0.5 text-[12px] font-semibold tabular-nums text-white',
        compact && 'bottom-1 right-1 px-1 text-[10px]',
      )}>
        {formatDuration(clip.durationMs / 1_000)}
      </span>
    </button>
  );
}
