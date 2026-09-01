import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Clip, SystemSnapshot } from '../../../../shared/contracts';
import { latestClipCreatedAt, reviewableAutoCapturedClips } from '../../../../shared/clip-review';
import { clipGameLabel } from '../../../../shared/clip-library';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatBytes, formatRelativeTime, formatVideoQuality } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';
import { ClipThumbnail } from './ClipThumbnail';

type ReviewBatch = {
  ids: string[];
  reviewedThrough: number;
};

export function NewClipsReview({ snapshot, onOpenClip }: { snapshot: SystemSnapshot; onOpenClip: (id: string) => void }) {
  const deleteClip = useSystemStore((state) => state.deleteClip);
  const markClipsReviewed = useSystemStore((state) => state.markClipsReviewed);
  const setPage = useSystemStore((state) => state.setPage);
  const snapshotRef = useRef(snapshot);
  const batchRef = useRef<ReviewBatch | null>(null);
  const locallyReviewedThrough = useRef(snapshot.clipReview.reviewedThrough);
  const focusReviewArmed = useRef(true);
  const [batch, setBatchState] = useState<ReviewBatch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);

  snapshotRef.current = snapshot;
  locallyReviewedThrough.current = Math.max(locallyReviewedThrough.current, snapshot.clipReview.reviewedThrough);

  const setBatch = useCallback((next: ReviewBatch | null) => {
    batchRef.current = next;
    setBatchState(next);
  }, []);

  const offerReview = useCallback(() => {
    if (!focusReviewArmed.current || batchRef.current) return;
    const current = snapshotRef.current;
    const clips = reviewableAutoCapturedClips(
      current.clips,
      locallyReviewedThrough.current,
      current.capture.autoCapture.runtime.activeGameId,
    );
    if (clips.length === 0) return;
    const next = { ids: clips.map((clip) => clip.id), reviewedThrough: latestClipCreatedAt(clips) };
    focusReviewArmed.current = false;
    setBatch(next);
    setConfirmDelete(false);
    setDeletionError(null);
    setPage('capture');
  }, [setBatch, setPage]);

  useEffect(() => {
    const arm = () => { focusReviewArmed.current = true; };
    const reviewOnFocus = () => offerReview();
    const reviewOnVisibility = () => {
      if (document.visibilityState === 'hidden') arm();
      else offerReview();
    };
    window.addEventListener('blur', arm);
    window.addEventListener('focus', reviewOnFocus);
    document.addEventListener('visibilitychange', reviewOnVisibility);
    if (document.hasFocus() && document.visibilityState !== 'hidden') offerReview();
    return () => {
      window.removeEventListener('blur', arm);
      window.removeEventListener('focus', reviewOnFocus);
      document.removeEventListener('visibilitychange', reviewOnVisibility);
    };
  }, [offerReview]);

  useEffect(() => {
    if (document.hasFocus() && document.visibilityState !== 'hidden') offerReview();
  }, [
    offerReview,
    snapshot.clips,
    snapshot.clipReview.reviewedThrough,
    snapshot.capture.autoCapture.runtime.activeGameId,
  ]);

  const clips = useMemo(() => {
    if (!batch) return [];
    const clipsById = new Map(snapshot.clips.map((clip) => [clip.id, clip]));
    return batch.ids.map((id) => clipsById.get(id)).filter((clip): clip is Clip => Boolean(clip));
  }, [batch, snapshot.clips]);
  const totalBytes = clips.reduce((total, clip) => total + clip.fileSize, 0);
  const gameLabels = [...new Set(clips.map(clipGameLabel))];

  const finishReview = useCallback((openClipId?: string) => {
    const current = batchRef.current;
    if (!current) return;
    locallyReviewedThrough.current = Math.max(locallyReviewedThrough.current, current.reviewedThrough);
    setBatch(null);
    setConfirmDelete(false);
    setDeletionError(null);
    void markClipsReviewed({ reviewedThrough: current.reviewedThrough });
    if (openClipId) onOpenClip(openClipId);
    else setPage('capture');
  }, [markClipsReviewed, onOpenClip, setBatch, setPage]);

  const deleteBatch = async () => {
    const current = batchRef.current;
    if (!current || deleting) return;
    setDeleting(true);
    setDeletionError(null);
    try {
      for (const id of current.ids) {
        if (snapshotRef.current.clips.some((clip) => clip.id === id)) await deleteClip(id);
      }
      finishReview();
    } catch (error) {
      setDeletionError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={Boolean(batch)} onOpenChange={(open) => { if (!open && !deleting) finishReview(); }}>
      {batch ? (
        <DialogContent className="new-clips-review no-drag" data-testid="new-clips-review">
          <DialogHeader className="new-clips-review__header">
            <DialogTitle className="new-clips-review__title">
              {clips.length} new {clips.length === 1 ? 'clip' : 'clips'}
              <span aria-hidden="true"> · </span>
              <span className="new-clips-review__size">{formatBytes(totalBytes)}</span>
            </DialogTitle>
            <DialogDescription>
              {gameLabels.length > 1
                ? `Captured automatically across ${gameLabels.length} games`
                : `Captured automatically during your last game${gameLabels[0] ? ` · ${gameLabels[0]}` : ''}`}
            </DialogDescription>
          </DialogHeader>

          <div className="new-clips-review__viewport" data-new-clips-scroll>
            {clips.length > 0 ? (
              <ul className="new-clips-review__grid" aria-label="New clips">
                {clips.map((clip) => (
                  <li key={clip.id}>
                    <article className="new-clips-review__card group">
                      <ClipThumbnail clip={clip} onOpen={() => finishReview(clip.id)} className="new-clips-review__thumbnail" />
                      <div className="new-clips-review__copy">
                        <h3>{clip.name}</h3>
                        <p>{clipGameLabel(clip)}</p>
                        <div className="new-clips-review__metadata">
                          <span>{formatRelativeTime(clip.createdAt)}</span>
                          <span>{formatVideoQuality(clip.width, clip.height, clip.fps)}</span>
                          <span>{formatBytes(clip.fileSize)}</span>
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="new-clips-review__empty" role="status">These clips are no longer in the library.</div>
            )}
          </div>

          <footer className="new-clips-review__footer">
            {confirmDelete ? (
              <>
                <p role={deletionError ? 'alert' : 'status'} className={deletionError ? 'new-clips-review__delete-error' : undefined}>
                  {deletionError ?? `Move ${clips.length} ${clips.length === 1 ? 'clip' : 'clips'} to the Recycle Bin?`}
                </p>
                <div className="new-clips-review__footer-actions">
                  <Button type="button" variant="secondary" disabled={deleting} onClick={() => { setConfirmDelete(false); setDeletionError(null); }}>Cancel</Button>
                  <Button type="button" variant="danger" disabled={deleting || clips.length === 0} onClick={() => void deleteBatch()}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    {deleting ? 'Deleting…' : `Delete ${clips.length} ${clips.length === 1 ? 'clip' : 'clips'}`}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button type="button" variant="danger" disabled={clips.length === 0} onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" aria-hidden="true" /> Delete {clips.length} {clips.length === 1 ? 'clip' : 'clips'}
                </Button>
                <Button type="button" variant="primary" onClick={() => finishReview()}>View all clips</Button>
              </>
            )}
          </footer>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
