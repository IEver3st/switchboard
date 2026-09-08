import { Clapperboard, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Clip } from '../../../../shared/contracts';
import type { MontageProjectV2 } from '../../../../shared/montage-v2';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/format';
import './montage-drafts.css';

export function MontageDraftStrip({
  drafts,
  clips,
  onResume,
  onDelete,
}: {
  drafts: readonly MontageProjectV2[];
  clips: readonly Clip[];
  onResume: (draft: MontageProjectV2) => void;
  onDelete: (draft: MontageProjectV2) => void;
}) {
  const [page, setPage] = useState(0);
  const activePage = Math.min(page, Math.max(0, Math.ceil(drafts.length / 3) - 1));
  if (drafts.length === 0) return null;
  const clipIds = new Set(clips.map((clip) => clip.id));
  return (
    <section className="montage-v2-drafts" aria-label="Saved edit drafts">
      <div className="montage-v2-drafts__label"><Clapperboard aria-hidden="true" /><span><strong>Edit drafts</strong><small>Autosaved locally</small></span></div>
      <div className="montage-v2-drafts__list">
        {drafts.slice(activePage * 3, activePage * 3 + 3).map((draft) => {
          const missing = draft.segments.filter((segment) => !clipIds.has(segment.clipId)).length;
          return (
            <div key={draft.id} className="montage-v2-draft" data-missing={missing > 0 || undefined}>
              <button type="button" title={`Resume ${draft.name}`} onClick={() => onResume(draft)}>
                <strong>{draft.name}</strong>
                <span>{draft.sourceClipId ? 'Clip edit' : `${draft.segments.length} clips`} · {formatDuration(draft.durationMs / 1_000)}{missing > 0 ? ` · ${missing} missing` : ''}</span>
              </button>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Discard ${draft.name}`} onClick={() => onDelete(draft)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      {drafts.length > 3 ? <div className="montage-v2-drafts__more"><Button size="sm" variant="ghost" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous</Button><Button size="sm" variant="ghost" disabled={(activePage + 1) * 3 >= drafts.length} onClick={() => setPage(activePage + 1)}>Next drafts</Button></div> : null}
    </section>
  );
}
