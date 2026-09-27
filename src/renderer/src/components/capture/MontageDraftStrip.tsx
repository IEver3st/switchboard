import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Clapperboard, Film, ImageOff, MoreHorizontal, Scissors, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Clip } from '../../../../shared/contracts';
import { montageDraftRetentionMs, type MontageProjectV2 } from '../../../../shared/montage-v2';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import './montage-drafts.css';

// Projects and drafts: kept projects and recoverable edit drafts, shown as a
// shelf of media so people recognize their work by its footage, not its name.
export function MontageDraftStrip({
  drafts,
  clips,
  onResume,
  onDelete,
  onKeepChange,
}: {
  drafts: readonly MontageProjectV2[];
  clips: readonly Clip[];
  onResume: (draft: MontageProjectV2) => void;
  onDelete: (draft: MontageProjectV2) => Promise<void>;
  onKeepChange: (draft: MontageProjectV2, kept: boolean) => Promise<void>;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const now = useMinuteClock(drafts.some((draft) => !draft.kept));
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const keptCount = drafts.filter((draft) => draft.kept).length;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => setOverflow({
      start: list.scrollLeft > 2,
      end: list.scrollLeft + list.clientWidth < list.scrollWidth - 2,
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', measure);
    };
  }, [drafts.length]);

  if (drafts.length === 0) return null;

  const run = (draft: MontageProjectV2, operation: () => Promise<void>) => {
    setPendingIds((current) => new Set(current).add(draft.id));
    void operation().finally(() => setPendingIds((current) => {
      const next = new Set(current);
      next.delete(draft.id);
      return next;
    }));
  };

  const scrollBy = (direction: 1 | -1) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({ left: direction * Math.max(280, list.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="montage-v2-drafts" aria-labelledby="capture-projects-heading">
      <header className="montage-v2-drafts__header">
        <div className="montage-v2-drafts__label">
          <h3 id="capture-projects-heading">Projects & drafts</h3>
          <span className="montage-v2-drafts__count">{drafts.length}</span>
          <small title="Kept projects stay until you discard them. Other drafts clear 3 hours after their last save.">
            {keptCount > 0 ? `${keptCount} kept · ` : ''}Drafts clear 3 hours after their last save
          </small>
        </div>
        {overflow.start || overflow.end ? (
          <div className="montage-v2-drafts__scroll" role="group" aria-label="Scroll projects">
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Show earlier projects" disabled={!overflow.start} onClick={() => scrollBy(-1)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Show more projects" disabled={!overflow.end} onClick={() => scrollBy(1)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </header>
      <ul ref={listRef} className="montage-v2-drafts__list" data-overflow-start={overflow.start || undefined} data-overflow-end={overflow.end || undefined}>
        {drafts.map((draft) => {
          const missing = draft.segments.filter((segment) => !clipsById.has(segment.clipId)).length;
          const pending = pendingIds.has(draft.id);
          const clipEdit = Boolean(draft.sourceClipId);
          const kind = clipEdit ? 'Clip edit' : `Montage · ${draft.segments.length} ${draft.segments.length === 1 ? 'clip' : 'clips'}`;
          const retention = draft.kept ? null : retentionLabel(draft.updatedAt + montageDraftRetentionMs - now);
          const confirming = confirmingId === draft.id;
          return (
            <li
              key={draft.id}
              className="montage-v2-draft"
              data-kept={draft.kept || undefined}
              data-missing={missing > 0 || undefined}
              data-confirming={confirming || undefined}
              aria-busy={pending || undefined}
            >
              <button
                type="button"
                className="montage-v2-draft__open"
                title={`Resume ${draft.name}`}
                disabled={pending}
                onClick={() => onResume(draft)}
              >
                <DraftFilmstrip draft={draft} clipsById={clipsById} />
                <span className="montage-v2-draft__copy">
                  <strong>{draft.name}</strong>
                  <span className="montage-v2-draft__meta">
                    {clipEdit ? <Scissors aria-hidden="true" /> : <Clapperboard aria-hidden="true" />}
                    {kind}
                  </span>
                  <span className="montage-v2-draft__status">
                    <span className="montage-v2-draft__length">{formatDuration(draft.durationMs / 1_000)}</span>
                    {missing > 0 ? (
                      <span data-tone="warning"><TriangleAlert aria-hidden="true" />{missing} {missing === 1 ? 'clip' : 'clips'} missing</span>
                    ) : draft.kept ? (
                      <span data-tone="kept"><BookmarkCheck aria-hidden="true" />Kept</span>
                    ) : (
                      <span>{retention}</span>
                    )}
                  </span>
                </span>
              </button>

              {confirming ? (
                <div className="montage-v2-draft__confirm" role="alertdialog" aria-label={`Discard ${draft.name}?`}>
                  <p>Discard {draft.kept ? 'this kept project' : 'this draft'}? Clips stay in your library.</p>
                  <div>
                    <Button type="button" size="sm" variant="ghost" autoFocus onClick={() => setConfirmingId(null)}>Cancel</Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={pending}
                      aria-label={`Discard ${draft.name}`}
                      onClick={() => {
                        setConfirmingId(null);
                        run(draft, () => onDelete(draft));
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />Discard
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="montage-v2-draft__actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="montage-v2-draft__keep"
                    aria-pressed={draft.kept === true}
                    aria-label={draft.kept ? `Stop keeping ${draft.name}` : `Keep ${draft.name}`}
                    title={draft.kept ? 'Kept until you discard it. Click to let it clear 3 hours after its last save.' : 'Keep this project until you discard it'}
                    disabled={pending}
                    onClick={() => run(draft, () => onKeepChange(draft, !draft.kept))}
                  >
                    {draft.kept ? <BookmarkCheck className="size-4" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="montage-v2-draft__more" aria-label={`More actions for ${draft.name}`} disabled={pending}>
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onSelect={() => onResume(draft)}><Film className="size-3.5" />Resume editing</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => run(draft, () => onKeepChange(draft, !draft.kept))}>
                        {draft.kept ? <Bookmark className="size-3.5" /> : <BookmarkCheck className="size-3.5" />}
                        {draft.kept ? 'Stop keeping' : 'Keep project'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmingId(draft.id)}>
                        <Trash2 className="size-3.5" />Discard…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DraftFilmstrip({ draft, clipsById }: { draft: MontageProjectV2; clipsById: ReadonlyMap<string, Clip> }) {
  const frames = draft.segments.slice(0, draft.sourceClipId ? 1 : 3);
  return (
    <span className={cn('montage-v2-draft__film', frames.length > 1 && 'is-strip')} aria-hidden="true" data-frames={frames.length}>
      {frames.map((segment) => <DraftFrame key={segment.id} clip={clipsById.get(segment.clipId)} />)}
    </span>
  );
}

function DraftFrame({ clip }: { clip: Clip | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!clip || clip.availability === 'unavailable') {
    return <span className="montage-v2-draft__frame is-missing"><ImageOff /></span>;
  }
  if (!clip.thumbnailPath || failed) return <span className="montage-v2-draft__frame is-empty"><Film /></span>;
  return (
    <span className="montage-v2-draft__frame">
      <img
        src={`switchboard-media://thumbnail/${encodeURIComponent(clip.id)}`}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

// Re-renders once a minute while a temporary draft shows its remaining time.
// Stops as soon as every listed draft is kept or the shelf unmounts.
function useMinuteClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function retentionLabel(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  if (minutes < 60) return `Clears in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `Clears in ${hours} h` : `Clears in ${hours} h ${rest} min`;
}
