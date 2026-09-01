import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, ClipAudioTrackTrim, ClipCanvasSize, ClipExportPreset, ExportMontageInput, SystemSnapshot } from '../../../shared/contracts';
import { clipGameLabel } from '../../../shared/clip-library';
import { autoCaptureClipSummary } from '../../../shared/auto-capture';
import { CaptureHeader } from '@/components/capture/CaptureHeader';
import { DeleteClipDialog, RenameClipDialog } from '@/components/capture/ClipDialogs';
import { ClipEditor } from '@/components/capture/ClipEditor';
import { ClipLibrary } from '@/components/capture/ClipLibrary';
import { createMontageProject, type MontageClipEditorProject } from '@/components/capture/clip-project-model';
import { useClipLibraryControls } from '@/components/capture/clip-library-model';
import type { ClipActions } from '@/components/capture/types';
import { formatBytes, formatDuration } from '@/lib/format';
import { useSystemStore } from '@/stores/use-system-store';
import { Button } from '@/components/ui/button';

export function CapturePage({ snapshot, requestedClipId, onRequestedClipHandled }: {
  snapshot: SystemSnapshot;
  requestedClipId?: string | null;
  onRequestedClipHandled?: () => void;
}) {
  const setClipFavorite = useSystemStore((state) => state.setClipFavorite);
  const revealClip = useSystemStore((state) => state.revealClip);
  const deleteClip = useSystemStore((state) => state.deleteClip);
  const renameClip = useSystemStore((state) => state.renameClip);
  const exportClip = useSystemStore((state) => state.exportClip);
  const exportMontage = useSystemStore((state) => state.exportMontage);
  const cancelClipExport = useSystemStore((state) => state.cancelClipExport);
  const setClipCanvasSize = useSystemStore((state) => state.setClipCanvasSize);
  const setClipTrim = useSystemStore((state) => state.setClipTrim);
  const setClipAudioTrackLevel = useSystemStore((state) => state.setClipAudioTrackLevel);
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const updateAutoCaptureSettings = useSystemStore((state) => state.updateAutoCaptureSettings);
  const setupAutoCaptureProvider = useSystemStore((state) => state.setupAutoCaptureProvider);
  const [editorClipId, setEditorClipId] = useState<string | null>(null);
  const [montageProject, setMontageProject] = useState<MontageClipEditorProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Clip | null>(null);
  const [renameTarget, setRenameTarget] = useState<Clip | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingClipActions, setPendingClipActions] = useState<ReadonlySet<string>>(() => new Set());
  const previousSavedClipId = useRef(snapshot.clips[0]?.id);
  const restoreFocusClipId = useRef<string | null>(null);
  const editorClip = snapshot.clips.find((clip) => clip.id === editorClipId) ?? null;
  const editorOpen = Boolean(editorClip || montageProject);
  const dialogOpen = Boolean(deleteTarget || renameTarget);
  const clipLibraryControls = useClipLibraryControls(snapshot.clips, (clips) => {
    setEditorClipId(null);
    setMontageProject(createMontageProject(clips));
  });
  const offeredAutoCaptureProvider = snapshot.capture.autoCapture.providers.find((provider) => (
    !provider.developmentOnly
      && provider.gameId === snapshot.capture.autoCapture.runtime.activeGameId
      && provider.supportLevel === 'supported'
      && provider.availability.state !== 'unavailable'
      && !snapshot.capture.autoCapture.settings.enabled
      && !snapshot.capture.autoCapture.settings.dismissedAvailability[provider.gameId]
  ));

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
    setMontageProject(null);
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
    if (!requestedClipId) return;
    if (snapshot.clips.some((clip) => clip.id === requestedClipId)) {
      setMontageProject(null);
      setEditorClipId(requestedClipId);
    }
    onRequestedClipHandled?.();
  }, [onRequestedClipHandled, requestedClipId, snapshot.clips]);

  useEffect(() => {
    if (!montageProject) return;
    const clipsById = new Map(snapshot.clips.map((clip) => [clip.id, clip]));
    setMontageProject((current) => current ? {
      ...current,
      segments: current.segments.map((segment) => {
        const source = clipsById.get(segment.source.id);
        return source
          ? { ...segment, source, unavailableReason: undefined }
          : { ...segment, unavailableReason: 'The source clip is no longer in the library.' };
      }),
    } : current);
  }, [snapshot.clips]);

  useEffect(() => {
    const latest = snapshot.clips[0];
    if (!latest || latest.id === previousSavedClipId.current) return;
    previousSavedClipId.current = latest.id;
    if (!snapshot.capture.runtime.lastSavedAt || Math.abs(latest.createdAt - new Date(snapshot.capture.runtime.lastSavedAt).getTime()) > 5_000) return;
    if (latest.autoCapture) {
      if (!snapshot.capture.autoCapture.settings.notifyWhenSaved) return;
      showTransientToast(`Auto Capture saved · ${autoCaptureClipSummary(latest) ?? 'Highlight'} · ${clipGameLabel(latest)}`, setToast);
      return;
    }
    showTransientToast(`Replay saved · ${clipGameLabel(latest)} · ${formatDuration(latest.durationMs / 1_000)} · ${formatBytes(latest.fileSize)}`, setToast);
  }, [snapshot.capture.autoCapture.settings.notifyWhenSaved, snapshot.capture.runtime.lastSavedAt, snapshot.clips]);

  const actions = useMemo<ClipActions>(() => ({
    open: (clip) => { setMontageProject(null); setEditorClipId(clip.id); },
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
        aria-hidden={editorOpen || dialogOpen ? true : undefined}
        inert={editorOpen || dialogOpen ? true : undefined}
      >
        <CaptureHeader snapshot={snapshot} controls={clipLibraryControls} />
        <ClipLibrary
          actions={actions}
          replayEnabled={snapshot.capture.config.enabled}
          hotkey={snapshot.capture.config.hotkey}
          captureUnavailableReason={snapshot.capture.capabilities.backend === 'unavailable'
            ? 'Windows capture is not available for this system configuration.'
            : snapshot.capture.storage.criticalSpace
              ? 'Free disk space or choose another clip folder before saving replays.'
              : null}
          controls={clipLibraryControls}
        />
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
            onExport={(preset: ClipExportPreset, startMs, endMs, audioTrackTrims: Array<ClipAudioTrackTrim | null>, exportId: string) => runClipAction(`clip:${editorClip.id}:export`, () => exportClip({ id: editorClip.id, startMs, endMs, preset, audioTrackTrims, exportId })).then((exported) => {
              if (exported) showTransientToast('Share file created', setToast);
              return exported;
            })}
            onCancelExport={async (exportId) => {
              await cancelClipExport(exportId);
              showTransientToast('Export cancelled', setToast);
            }}
            onDelete={() => setDeleteTarget(editorClip)}
          />
        </div>
      ) : null}

      {montageProject ? (
        <div className="contents" aria-hidden={dialogOpen ? true : undefined} inert={dialogOpen ? true : undefined}>
          <ClipEditor
            project={montageProject}
            exportPending={pendingClipActions.has(`montage:${montageProject.id}:export`)}
            inspectorOpen={snapshot.settings.clipEditorInspectorOpen}
            onClose={closeEditor}
            onReveal={(clip) => void revealClip(clip.id)}
            onInspectorOpenChange={(open) => void updateSettings({ clipEditorInspectorOpen: open })}
            onExport={(preset: ClipExportPreset, project: MontageClipEditorProject, exportId: string) => {
              const input: ExportMontageInput = {
                exportId,
                preset,
                project: {
                  type: 'montage',
                  id: project.id,
                  name: project.name,
                  durationMs: project.durationMs,
                  canvasSize: project.canvasSize,
                  segments: project.segments.map((segment) => ({
                    id: segment.id,
                    clipId: segment.source.id,
                    sourceDurationMs: segment.source.durationMs,
                    trimStartMs: segment.trimStartMs,
                    trimEndMs: segment.trimEndMs,
                    ...(segment.audioTrackLevels.length > 0 ? { audioTrackLevels: segment.audioTrackLevels } : {}),
                    ...(segment.audioTrackTrims.length > 0 ? { audioTrackTrims: segment.audioTrackTrims } : {}),
                  })),
                },
              };
              return runClipAction(`montage:${project.id}:export`, () => exportMontage(input)).then((exported) => {
                if (exported) showTransientToast('Montage share file created', setToast);
                return exported;
              });
            }}
            onCancelExport={async (exportId) => {
              await cancelClipExport(exportId);
              showTransientToast('Montage export cancelled', setToast);
            }}
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
      {offeredAutoCaptureProvider ? (
        <div className="fixed bottom-5 right-5 z-[69] w-[min(360px,calc(100vw-40px))] rounded-lg border border-border bg-popover px-4 py-3 shadow-xl" role="status" aria-live="polite">
          <p className="text-[13px] font-medium text-foreground">Auto Capture is available for {offeredAutoCaptureProvider.displayName}.</p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Gameplay telemetry stays local and preserves highlights from the existing replay buffer.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void updateAutoCaptureSettings({ dismissedAvailability: { [offeredAutoCaptureProvider.gameId]: true } })}
            >
              Not now
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => void updateAutoCaptureSettings({
                enabled: true,
                games: { [offeredAutoCaptureProvider.gameId]: { enabled: true } },
                dismissedAvailability: { [offeredAutoCaptureProvider.gameId]: true },
              }).then(() => offeredAutoCaptureProvider.availability.state === 'setup-required'
                ? setupAutoCaptureProvider(offeredAutoCaptureProvider.id)
                : undefined)}
            >
              Enable
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function showTransientToast(message: string, setToast: (message: string | null) => void): void {
  setToast(message);
  window.setTimeout(() => setToast(null), 3_200);
}
