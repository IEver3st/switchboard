import { Clapperboard, Trash2 } from 'lucide-react';
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
  if (drafts.length === 0) return null;
  const clipIds = new Set(clips.map((clip) => clip.id));
  return (
    <section className="montage-v2-drafts" aria-label="Recent montage drafts">
      <div className="montage-v2-drafts__label"><Clapperboard aria-hidden="true" /><span><strong>Montage drafts</strong><small>Autosaved locally</small></span></div>
      <div className="montage-v2-drafts__list">
        {drafts.slice(0, 3).map((draft) => {
          const missing = draft.segments.filter((segment) => !clipIds.has(segment.clipId)).length;
          return (
            <div key={draft.id} className="montage-v2-draft" data-missing={missing > 0 || undefined}>
              <button type="button" title={`Resume ${draft.name}`} onClick={() => onResume(draft)}>
                <strong>{draft.name}</strong>
                <span>{draft.segments.length} clips · {formatDuration(draft.durationMs / 1_000)}{missing > 0 ? ` · ${missing} missing` : ''}</span>
              </button>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Discard ${draft.name}`} onClick={() => onDelete(draft)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      {drafts.length > 3 ? <span className="montage-v2-drafts__more">+{drafts.length - 3} more</span> : null}
    </section>
  );
}
