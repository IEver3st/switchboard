import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, ClipAudioTrackTrim, ClipCanvasSize, ClipExportPreset, SystemSnapshot } from '../../../shared/contracts';
import { clipGameLabel } from '../../../shared/clip-library';
import { CaptureHeader } from '@/components/capture/CaptureHeader';
import { DeleteClipDialog, RenameClipDialog } from '@/components/capture/ClipDialogs';
import { ClipEditor } from '@/components/capture/ClipEditor';
import { ClipLibrary } from '@/components/capture/ClipLibrary';
import type { ClipActions } from '@/components/capture/types';
import { formatBytes, formatDuration } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';

export function CapturePage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setClipFavorite = useSystemStore((state) => state.setClipFavorite);
  const revealClip = useSystemStore((state) => state.revealClip);
  const deleteClip = useSystemStore((state) => state.deleteClip);
  const renameClip = useSystemStore((state) => state.renameClip);
  const exportClip = useSystemStore((state) => state.exportClip);
  const setClipCanvasSize = useSystemStore((state) => state.setClipCanvasSize);
  const setClipTrim = useSystemStore((state) => state.setClipTrim);
  const setClipAudioTrackLevel = useSystemStore((state) => state.setClipAudioTrackLevel);
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const [editorClipId, setEditorClipId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Clip | null>(null);
  const [renameTarget, setRenameTarget] = useState<Clip | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingClipActions, setPendingClipActions] = useState<ReadonlySet<string>>(() => new Set());
  const previousSavedClipId = useRef(snapshot.clips[0]?.id);
  const restoreFocusClipId = useRef<string | null>(null);
  const editorClip = snapshot.clips.find((clip) => clip.id === editorClipId) ?? null;
  const dialogOpen = Boolean(deleteTarget || renameTarget);

  const runClipAction = useCallback(async <T,>(key: string, action: () => Promise<T>): Promise<T> => {
    setPendingClipActions((current) => new Set(current).add(key));
    try {
      return await action();
    } finally {
      setPendingClipActions((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const closeEditor = useCallback(() => {
    restoreFocusClipId.current = editorClipId;
    setEditorClipId(null);
  }, [editorClipId]);

  useEffect(() => {
    if (editorClipId || !restoreFocusClipId.current) return;
    const closingId = restoreFocusClipId.current;
    restoreFocusClipId.current = null;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-clip-id="${CSS.escape(closingId)}"]`)?.focus();
    });
  }, [editorClipId]);

  useEffect(() => {
    if (editorClipId && !editorClip) setEditorClipId(null);
  }, [editorClip, editorClipId]);

  useEffect(() => {
    const latest = snapshot.clips[0];
    if (!latest || latest.id === previousSavedClipId.current) return;
    previousSavedClipId.current = latest.id;
    if (!snapshot.capture.runtime.lastSavedAt || Math.abs(latest.createdAt - new Date(snapshot.capture.runtime.lastSavedAt).getTime()) > 5_000) return;
    showTransientToast(`Replay saved · ${clipGameLabel(latest)} · ${formatDuration(latest.durationMs / 1_000)} · ${formatBytes(latest.fileSize)}`, setToast);
  }, [snapshot.capture.runtime.lastSavedAt, snapshot.clips]);

  const actions = useMemo<ClipActions>(() => ({
    open: (clip) => setEditorClipId(clip.id),
    favorite: (clip, favorite) => void setClipFavorite({ id: clip.id, favorite }),
    rename: (clip) => setRenameTarget(clip),
    reveal: (clip) => void revealClip(clip.id),
    export: (clip) => void runClipAction(`clip:${clip.id}:export`, () => exportClip({
      id: clip.id,
      startMs: clip.trimStartMs ?? 0,
      endMs: clip.trimEndMs ?? clip.durationMs,
      preset: 'original',
    })).then((exported) => { if (exported) showTransientToast('Clip exported', setToast); }),
    delete: (clip) => setDeleteTarget(clip),
  }), [exportClip, revealClip, runClipAction, setClipFavorite]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col" data-testid="capture-library">
      <div
        className="flex min-h-full flex-1 flex-col"
        aria-hidden={editorClip || dialogOpen ? true : undefined}
        inert={editorClip || dialogOpen ? true : undefined}
      >
        <CaptureHeader snapshot={snapshot} />
        <ClipLibrary clips={snapshot.clips} actions={actions} replayEnabled={snapshot.capture.config.enabled} hotkey={snapshot.capture.config.hotkey} />
      </div>

      {editorClip ? (
        <div className="contents" aria-hidden={dialogOpen ? true : undefined} inert={dialogOpen ? true : undefined}>
          <ClipEditor
            clip={editorClip}
            exportPending={pendingClipActions.has(`clip:${editorClip.id}:export`)}
            trimPending={pendingClipActions.has(`clip:${editorClip.id}:trim`)}
            canvasPending={pendingClipActions.has(`clip:${editorClip.id}:canvas`)}
            inspectorOpen={snapshot.settings.clipEditorInspectorOpen}
            onClose={closeEditor}
            onFavorite={(favorite) => void setClipFavorite({ id: editorClip.id, favorite })}
            onRename={() => setRenameTarget(editorClip)}
            onReveal={() => void revealClip(editorClip.id)}
            onInspectorOpenChange={(open) => void updateSettings({ clipEditorInspectorOpen: open })}
            onCanvasSizeChange={(canvasSize: ClipCanvasSize) => void runClipAction(`clip:${editorClip.id}:canvas`, () => setClipCanvasSize({ id: editorClip.id, canvasSize })).then(() => {
              showTransientToast(canvasSize === '9:16' ? 'Canvas set to 9:16' : 'Canvas restored to original', setToast);
            })}
            onSaveTrim={(startMs, endMs, audioTrackTrims: Array<ClipAudioTrackTrim | null>) => runClipAction(`clip:${editorClip.id}:trim`, () => setClipTrim({ id: editorClip.id, startMs, endMs, audioTrackTrims })).then(() => {
              showTransientToast('Timeline edits saved', setToast);
            })}
            onAudioTrackLevelChange={(trackIndex, level) => setClipAudioTrackLevel({ id: editorClip.id, trackIndex, level })}
            onExport={(preset: ClipExportPreset, startMs, endMs, audioTrackTrims: Array<ClipAudioTrackTrim | null>) => runClipAction(`clip:${editorClip.id}:export`, () => exportClip({ id: editorClip.id, startMs, endMs, preset, audioTrackTrims })).then((exported) => {
              if (exported) showTransientToast('Share file created', setToast);
              return exported;
            })}
            onDelete={() => setDeleteTarget(editorClip)}
          />
        </div>
      ) : null}

      {deleteTarget ? (
        <DeleteClipDialog
          clip={deleteTarget}
          pending={pendingClipActions.has(`clip:${deleteTarget.id}:delete`)}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void runClipAction(`clip:${deleteTarget.id}:delete`, () => deleteClip(deleteTarget.id)).then(() => {
            if (editorClipId === deleteTarget.id) setEditorClipId(null);
            setDeleteTarget(null);
            showTransientToast('Clip moved to the Recycle Bin', setToast);
          })}
        />
      ) : null}

      {renameTarget ? (
        <RenameClipDialog
          clip={renameTarget}
          pending={pendingClipActions.has(`clip:${renameTarget.id}:rename`)}
          onCancel={() => setRenameTarget(null)}
          onConfirm={(name) => void runClipAction(`clip:${renameTarget.id}:rename`, () => renameClip({ id: renameTarget.id, name })).then(() => {
            setRenameTarget(null);
            showTransientToast('Clip renamed', setToast);
          })}
        />
      ) : null}

      {toast ? <div className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-lg border border-border bg-popover px-4 py-3 text-[12px] text-foreground shadow-xl" role="status" aria-live="polite">{toast}</div> : null}
    </div>
  );
}

function showTransientToast(message: string, setToast: (message: string | null) => void): void {
  setToast(message);
  window.setTimeout(() => setToast(null), 3_200);
}
