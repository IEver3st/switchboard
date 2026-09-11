import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, SystemSnapshot } from '../../../shared/contracts';
import { montageDraftRetentionMs, type MontageProjectV2 } from '../../../shared/montage-v2';
import { clipGameLabel } from '../../../shared/clip-library';
import { autoCaptureClipSummary } from '../../../shared/auto-capture';
import { CaptureHeader } from '@/components/capture/CaptureHeader';
import '@/components/capture/capture-library.css';
import { DeleteClipDialog, RenameClipDialog } from '@/components/capture/ClipDialogs';
import { ClipLibrary } from '@/components/capture/ClipLibrary';
import { MontageDraftStrip } from '@/components/capture/MontageDraftStrip';
import { createMontageProjectV2, reconcileMontageProject } from '@/components/capture/montage-v2-model';
import { useClipLibraryControls } from '@/components/capture/clip-library-model';
import type { ClipActions } from '@/components/capture/types';
import { formatBytes, formatDuration } from '@/lib/format';
import { montageV2Api } from '@/lib/montage-v2-api';
import { useSystemStore } from '@/stores/use-system-store';
import { Button } from '@/components/ui/button';

const loadClipEditor = () => import('@/components/capture/ClipWorkspace');
const loadMontageComposer = () => import('@/components/capture/MontageComposer');
const ClipWorkspace = lazy(() => import('../components/capture/ClipWorkspace').then(module => ({ default: module.ClipWorkspace })));
const MontageComposer = lazy(() => loadMontageComposer().then((module) => ({ default: module.MontageComposer })));

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
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const updateAutoCaptureSettings = useSystemStore((state) => state.updateAutoCaptureSettings);
  const setupAutoCaptureProvider = useSystemStore((state) => state.setupAutoCaptureProvider);
  const [editorClipId, setEditorClipId] = useState<string | null>(null);
  const [montageProject, setMontageProject] = useState<MontageProjectV2 | null>(null);
  const [montageDrafts, setMontageDrafts] = useState<MontageProjectV2[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Clip | null>(null);
  const [renameTarget, setRenameTarget] = useState<Clip | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingClipActions, setPendingClipActions] = useState<ReadonlySet<string>>(() => new Set());
  const previousSavedClipId = useRef(snapshot.clips[0]?.id);
  const restoreFocusClipId = useRef<string | null>(null);
  const editorClip = snapshot.clips.find((clip) => clip.id === editorClipId) ?? null;
  const editorOpen = Boolean(editorClip || montageProject);
  const dialogOpen = Boolean(deleteTarget || renameTarget);

  const refreshMontageDrafts = useCallback(() => {
    void montageV2Api.listMontageDrafts()
      .then(setMontageDrafts)
      .catch((error) => showTransientToast(`Could not load montage drafts: ${errorMessage(error)}`, setToast));
  }, []);

  useEffect(refreshMontageDrafts, [refreshMontageDrafts]);

  useEffect(() => {
    if (montageDrafts.length === 0) return;
    const expiresAt = Math.min(...montageDrafts.map(draft => draft.updatedAt + montageDraftRetentionMs));
    // Ask main for the current library at the next expiry; no idle polling.
    const timer = window.setTimeout(refreshMontageDrafts, Math.max(100, Math.min(montageDraftRetentionMs, expiresAt - Date.now())));
    return () => window.clearTimeout(timer);
  }, [montageDrafts, refreshMontageDrafts]);

  const clipLibraryControls = useClipLibraryControls(snapshot.clips, (clips) => {
    try {
      void loadMontageComposer();
      setEditorClipId(null);
      setMontageProject(createMontageProjectV2(clips));
    } catch (error) {
      showTransientToast(errorMessage(error), setToast);
    }
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
    open: (clip) => { void loadClipEditor(); setMontageProject(null); setEditorClipId(clip.id); },
    favorite: (clip, favorite) => void setClipFavorite({ id: clip.id, favorite }),
    rename: (clip) => setRenameTarget(clip),
    reveal: (clip) => void revealClip(clip.id),
    export: (clip) => void runClipAction(`clip:${clip.id}:export`, async () => {
      const drafts = await montageV2Api.listMontageDrafts();
      const draft = drafts.find(item => item.sourceClipId === clip.id);
      if (draft) return montageV2Api.exportMontageV2({ exportId: crypto.randomUUID(), project: reconcileMontageProject(draft, snapshot.clips), preset: 'original' });
      return exportClip({ id: clip.id, startMs: clip.trimStartMs ?? 0, endMs: clip.trimEndMs ?? clip.durationMs, preset: 'original' });
    }).then(exported => { if (exported) showTransientToast('Clip exported', setToast); }).catch(error => showTransientToast(errorMessage(error), setToast)),
    delete: (clip) => setDeleteTarget(clip),
  }), [exportClip, revealClip, runClipAction, setClipFavorite, snapshot.clips]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col" data-testid="capture-library">
      <div
        className="flex min-h-full flex-1 flex-col"
        aria-hidden={editorOpen || dialogOpen ? true : undefined}
        inert={editorOpen || dialogOpen ? true : undefined}
      >
        <CaptureHeader snapshot={snapshot} controls={clipLibraryControls} />
        {!clipLibraryControls.montageSelectionMode ? (
          <MontageDraftStrip
            drafts={montageDrafts}
            clips={snapshot.clips}
            onResume={(draft) => {
              if (draft.sourceClipId && snapshot.clips.some(clip => clip.id === draft.sourceClipId)) {
                setMontageProject(null); setEditorClipId(draft.sourceClipId); return;
              }
              setEditorClipId(null);
              setMontageProject(reconcileMontageProject(draft, snapshot.clips));
            }}
            onDelete={(draft) => {
              void montageV2Api.deleteMontageDraft(draft.id)
                .then(() => {
                  refreshMontageDrafts();
                  showTransientToast('Edit draft discarded', setToast);
                })
                .catch((error) => showTransientToast(errorMessage(error), setToast));
            }}
          />
        ) : null}
        <ClipLibrary
          pendingSaveCount={snapshot.capture.runtime.saveQueueDepth}
          retainedClipId={editorClipId}
          actions={actions}
          replayEnabled={snapshot.capture.config.enabled}
          hotkey={snapshot.capture.config.hotkey}
          captureUnavailableReason={snapshot.capture.config.enabled && snapshot.capture.capabilities.backend === 'unavailable'
            ? 'Windows capture is not available for this system configuration.'
            : snapshot.capture.storage.criticalSpace
              ? 'Free disk space or choose another clip folder before saving replays.'
              : null}
          controls={clipLibraryControls}
        />
      </div>

      {editorClip ? (
        <div className="contents" aria-hidden={dialogOpen ? true : undefined} inert={dialogOpen ? true : undefined}>
          <Suspense fallback={<CaptureToolLoading label="Loading clip editor" />}>
            <ClipWorkspace
              key={editorClip.id}
              clip={editorClip}
              defaultTrackLevels={snapshot.capture.config.defaultTrackLevels}
              clips={snapshot.clips}
              inspectorOpen={snapshot.settings.clipEditorInspectorOpen}
              onClose={closeEditor}
              onFavorite={(favorite) => void setClipFavorite({ id: editorClip.id, favorite })}
              onRename={() => setRenameTarget(editorClip)}
              onDelete={() => setDeleteTarget(editorClip)}
              onReveal={(clip) => void revealClip(clip.id)}
              onInspectorOpenChange={(open) => void updateSettings({ clipEditorInspectorOpen: open })}
              onDraftsChanged={refreshMontageDrafts}
            />
          </Suspense>
        </div>
      ) : null}

      {montageProject ? (
        <div className="contents" aria-hidden={dialogOpen ? true : undefined} inert={dialogOpen ? true : undefined}>
          <Suspense fallback={<CaptureToolLoading label="Loading montage workspace" />}>
            <MontageComposer
            key={montageProject.id}
            initialProject={montageProject}
            clips={snapshot.clips}
            inspectorOpen={snapshot.settings.clipEditorInspectorOpen}
            onClose={closeEditor}
            onReveal={(clip) => void revealClip(clip.id)}
            onInspectorOpenChange={(open) => void updateSettings({ clipEditorInspectorOpen: open })}
            onDraftsChanged={refreshMontageDrafts}
            />
          </Suspense>
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

      {toast ? <div className={`pointer-events-none fixed ${editorClipId || montageProject ? 'left-1/2 top-28 -translate-x-1/2' : 'bottom-5 right-5'} z-[70] max-w-sm rounded-md border border-border bg-popover px-4 py-3 text-[12px] text-foreground shadow-xl`} role="status" aria-live="polite">{toast}</div> : null}
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

function CaptureToolLoading({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-background text-[12px] text-muted-foreground" role="status">
      {label}
    </div>
  );
}

function showTransientToast(message: string, setToast: (message: string | null) => void): void {
  setToast(message);
  window.setTimeout(() => setToast(null), 3_200);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
