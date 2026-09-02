import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, domAnimation, LazyMotion } from 'motion/react';
import type { PageId } from '../../shared/contracts';
import { reviewableAutoCapturedClips } from '../../shared/clip-review';
import { Sidebar } from '@/components/layout/sidebar';
import { StartupScreen } from '@/components/layout/startup-screen';
import { TitleStrip } from '@/components/layout/title-strip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { manageAsyncCleanup } from '@/lib/async-cleanup';
import { useSystemStore } from '@/stores/use-system-store';

const AudioPage = lazy(() => import('@/pages/audio').then((module) => ({ default: module.AudioPage })));
const CapturePage = lazy(() => import('@/pages/capture').then((module) => ({ default: module.CapturePage })));
const DevicesPage = lazy(() => import('@/pages/devices').then((module) => ({ default: module.DevicesPage })));
const NewClipsReview = lazy(() => import('@/components/capture/NewClipsReview').then((module) => ({ default: module.NewClipsReview })));
const SettingsPage = lazy(() => import('@/pages/settings').then((module) => ({ default: module.SettingsPage })));

const pageTitles: Record<PageId, string> = {
  devices: 'Devices',
  audio: 'Audio',
  capture: 'Capture',
  modules: 'Settings',
  settings: 'Settings',
};

export function App() {
  const snapshot = useSystemStore((state) => state.snapshot);
  const page = useSystemStore((state) => state.page);
  const loading = useSystemStore((state) => state.loading);
  const error = useSystemStore((state) => state.error);
  const initialize = useSystemStore((state) => state.initialize);
  const setPage = useSystemStore((state) => state.setPage);
  const clearError = useSystemStore((state) => state.clearError);
  const previousWorkspaceRef = useRef<Exclude<PageId, 'settings' | 'modules'>>('devices');
  const [requestedClipId, setRequestedClipId] = useState<string | null>(null);
  const shouldOfferClipReview = snapshot
    ? reviewableAutoCapturedClips(
        snapshot.clips,
        snapshot.clipReview.reviewedThrough,
        snapshot.capture.autoCapture.runtime.activeGameId,
      ).length > 0
    : false;

  useLayoutEffect(() => {
    const scale = (snapshot?.settings.uiScalePercent ?? 125) / 100;
    document.documentElement.style.setProperty('zoom', String(scale));
    return () => { document.documentElement.style.removeProperty('zoom'); };
  }, [snapshot?.settings.uiScalePercent]);

  useEffect(() => manageAsyncCleanup(initialize()), [initialize]);

  useEffect(() => {
    if (page !== 'settings' && page !== 'modules') previousWorkspaceRef.current = page;
  }, [page]);

  return (
    <LazyMotion features={domAnimation} strict>
      {snapshot ? (
        <div className="app-shell relative flex h-full bg-chrome">
          {page === 'settings' || page === 'modules' ? (
            <main className="min-h-0 min-w-0 flex-1 bg-background">
              <h1 className="sr-only">{pageTitles[page]}</h1>
              <Suspense fallback={<PageLoading label="settings" />}>
                <SettingsPage snapshot={snapshot} onClose={() => setPage(previousWorkspaceRef.current)} />
              </Suspense>
            </main>
          ) : (
            <>
              <Sidebar snapshot={snapshot} page={page} onNavigate={setPage} />
              <div className="app-shell__workspace flex min-w-0 flex-1 flex-col">
                <TitleStrip />
                <section className="app-shell__content flex min-h-0 flex-1 flex-col">
                  <main className="min-h-0 flex-1 bg-background">
                    <h1 className="sr-only">{pageTitles[page]}</h1>
                    <Suspense fallback={<PageLoading label={pageTitles[page].toLocaleLowerCase()} />}>
                      <ScrollArea className="h-full">
                        {page === 'devices' ? <DevicesPage snapshot={snapshot} /> : null}
                        {page === 'audio' ? <AudioPage snapshot={snapshot} /> : null}
                        {page === 'capture' ? (
                          <CapturePage
                            snapshot={snapshot}
                            requestedClipId={requestedClipId}
                            onRequestedClipHandled={() => setRequestedClipId(null)}
                          />
                        ) : null}
                      </ScrollArea>
                    </Suspense>
                  </main>
                </section>
              </div>
            </>
          )}

          {error ? (
            <div className="fixed bottom-4 left-20 flex max-w-lg items-center gap-3 rounded-lg border border-destructive/45 bg-popover px-4 py-3 text-[11px] text-destructive shadow-xl" role="alert">
              <AlertTriangle className="size-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={clearError} aria-label="Dismiss error" className="grid size-6 place-items-center rounded-sm hover:bg-white/5">
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          {shouldOfferClipReview ? (
            <Suspense fallback={null}>
              <NewClipsReview
                snapshot={snapshot}
                onOpenClip={(id) => {
                  setRequestedClipId(id);
                  setPage('capture');
                }}
              />
            </Suspense>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence initial={false}>
        {!snapshot ? <StartupScreen key="startup" error={!loading ? error : null} /> : null}
      </AnimatePresence>
    </LazyMotion>
  );
}

function PageLoading({ label }: { label: string }) {
  return <div className="grid h-full place-items-center text-xs text-muted-foreground" role="status">Loading {label}…</div>;
}
