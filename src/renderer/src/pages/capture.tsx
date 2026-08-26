import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, SystemSnapshot } from '../../../shared/contracts';
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
  const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
  const actionPending = useSystemStore((state) => state.actionPending);
  const [editorClipId, setEditorClipId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Clip | null>(null);
  const [renameTarget, setRenameTarget] = useState<Clip | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const previousSavedClipId = useRef(snapshot.clips[0]?.id);
  const editorClip = snapshot.clips.find((clip) => clip.id === editorClipId) ?? null;

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
    export: (clip) => void exportClip(clip.id).then((exported) => { if (exported) showTransientToast('Clip exported', setToast); }),
    delete: (clip) => setDeleteTarget(clip),
  }), [exportClip, revealClip, setClipFavorite]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col" data-testid="capture-library">
      <CaptureHeader snapshot={snapshot} />
      <ClipLibrary clips={snapshot.clips} actions={actions} replayEnabled={snapshot.capture.config.enabled} hotkey={snapshot.capture.config.hotkey} onEnableReplay={() => void setCaptureConfig({ enabled: true })} />

      {editorClip ? (
        <ClipEditor
          clip={editorClip}
          exportPending={actionPending === `clip:${editorClip.id}:export`}
          onClose={() => setEditorClipId(null)}
          onFavorite={(favorite) => void setClipFavorite({ id: editorClip.id, favorite })}
          onRename={() => setRenameTarget(editorClip)}
          onReveal={() => void revealClip(editorClip.id)}
          onExport={() => void exportClip(editorClip.id).then((exported) => { if (exported) showTransientToast('Clip exported', setToast); })}
          onDelete={() => setDeleteTarget(editorClip)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteClipDialog
          clip={deleteTarget}
          pending={actionPending === `clip:${deleteTarget.id}:delete`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void deleteClip(deleteTarget.id).then(() => {
            if (editorClipId === deleteTarget.id) setEditorClipId(null);
            setDeleteTarget(null);
            showTransientToast('Clip moved to the Recycle Bin', setToast);
          })}
        />
      ) : null}

      {renameTarget ? (
        <RenameClipDialog
          clip={renameTarget}
          pending={actionPending === `clip:${renameTarget.id}:rename`}
          onCancel={() => setRenameTarget(null)}
          onConfirm={(name) => void renameClip({ id: renameTarget.id, name }).then(() => {
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
