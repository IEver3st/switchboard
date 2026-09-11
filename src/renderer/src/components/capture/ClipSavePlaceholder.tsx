import type { CSSProperties } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

/** A view-only slot for a host-reported save, never an indexed Clip. */
export type PendingClipSave = { id: string; pendingSave: true };

export function ClipSavePlaceholder({ layout, style, position, total }: {
  layout: 'grid' | 'list';
  style: CSSProperties;
  position: number;
  total: number;
}) {
  const preview = (
    <div className="capture-clip-save__preview">
      <LoaderCircle className="capture-clip-save__spinner" aria-hidden="true" />
      <span>Saving clip…</span>
    </div>
  );
  const details = (
    <div className="capture-clip-save__details">
      <Skeleton className="capture-clip-save__title animate-none" />
      <Skeleton className="capture-clip-save__metadata animate-none" />
    </div>
  );
  return (
    <li className={`capture-clip-save ${layout === 'list' ? 'capture-clip-list__item' : 'min-w-0'}`}
      style={style} aria-posinset={position} aria-setsize={total} aria-label="Saving clip" aria-busy="true" data-pending-clip-save>
      {layout === 'grid' ? (
        <article className="capture-clip-card">
          {preview}
          <div className="capture-clip-card__footer">{details}</div>
        </article>
      ) : <><div className="capture-clip-list__preview">{preview}</div>{details}</>}
    </li>
  );
}
