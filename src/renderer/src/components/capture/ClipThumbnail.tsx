import { useState } from 'react';
import { Play, Video } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';

export function ClipThumbnail({ clip, onOpen, className, compact = false }: {
  clip: Clip;
  onOpen: () => void;
  className?: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const hasThumbnail = Boolean(clip.thumbnailPath) && !failed;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${clip.name}`}
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
      ) : (
        <span className="grid justify-items-center gap-2 text-[11px] text-muted-foreground">
          <Video className={compact ? 'size-4' : 'size-6'} strokeWidth={1.5} />
          {compact ? null : 'Preparing thumbnail'}
        </span>
      )}
      {!compact ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-[background-color,opacity] duration-100 group-hover:bg-black/15 group-hover:opacity-100 motion-reduce:transition-none" aria-hidden="true">
          <span className="grid size-10 place-items-center rounded-full bg-black/70 text-white"><Play className="ml-0.5 size-4 fill-current" /></span>
        </span>
      ) : null}
      <span className={cn(
        'absolute bottom-2 right-2 rounded-sm bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white',
        compact && 'bottom-1 right-1 px-1 text-[10px]',
      )}>
        {formatDuration(clip.durationMs / 1_000)}
      </span>
    </button>
  );
}
