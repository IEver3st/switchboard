import { observeDebugRuntime } from './lib/debug-runtime';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, domAnimation, LazyMotion } from 'motion/react';
import type { PageId } from '../../shared/contracts';
import { reviewableAutoCapturedClips } from '../../shared/clip-review';
import { defaultPageForProfile, isPageVisibleForProfile } from '../../shared/workspace-profile';
import { Sidebar } from '@/components/layout/sidebar';
import { OnboardingFlow } from '@/components/layout/onboarding-flow';
import { StartupScreen } from '@/components/layout/startup-screen';
import { TitleStrip } from '@/components/layout/title-strip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { manageAsyncCleanup } from '@/lib/async-cleanup';
import { SettingsPage } from '@/pages/settings';
import { useSystemStore } from '@/stores/use-system-store';

let audioPagePromise: ReturnType<typeof importAudioPage> | null = null;
let capturePagePromise: ReturnType<typeof importCapturePage> | null = null;
let devicesPagePromise: ReturnType<typeof importDevicesPage> | null = null;
let resolvedAudioPage: Awaited<ReturnType<typeof importAudioPage>> | null = null;
let resolvedCapturePage: Awaited<ReturnType<typeof importCapturePage>> | null = null;
let resolvedDevicesPage: Awaited<ReturnType<typeof importDevicesPage>> | null = null;

function importAudioPage() {
  return import('@/pages/audio').then((module) => ({ default: module.AudioPage }));
}

function importCapturePage() {
  return import('@/pages/capture').then((module) => ({ default: module.CapturePage }));
}

function importDevicesPage() {
  return import('@/pages/devices').then((module) => ({ default: module.DevicesPage }));
}

const loadAudioPage = () => audioPagePromise ??= importAudioPage().then((module) => {
  resolvedAudioPage = module;
  return module;
});
const loadCapturePage = () => capturePagePromise ??= importCapturePage().then((module) => {
  resolvedCapturePage = module;
  return module;
});
const loadDevicesPage = () => devicesPagePromise ??= importDevicesPage().then((module) => {
  resolvedDevicesPage = module;
  return module;
});
const AudioPage = lazy(loadAudioPage);
const CapturePage = lazy(loadCapturePage);
const DevicesPage = lazy(loadDevicesPage);
const NewClipsReview = lazy(() => import('@/components/capture/NewClipsReview').then((module) => ({ default: module.NewClipsReview })));

const workspaceLoaders: Partial<Record<PageId, () => Promise<unknown>>> = {
  audio: loadAudioPage,
  capture: loadCapturePage,
  devices: loadDevicesPage,
};

const pageTitles: Record<PageId, string> = {
  devices: 'Devices',
  audio: 'Audio',
  capture: 'Capture',
  modules: 'Settings',
  settings: 'Settings',
};

export function App() {
  const snapshot = useSystemStore((state) => state.snapshot);
  useEffect(() => observeDebugRuntime(snapshot?.settings.detailedDiagnostics === true), [snapshot?.settings.detailedDiagnostics]);
  const page = useSystemStore((state) => state.page);
  const loading = useSystemStore((state) => state.loading);
  const error = useSystemStore((state) => state.error);
  const initialize = useSystemStore((state) => state.initialize);
  const setPage = useSystemStore((state) => state.setPage);
  const clearError = useSystemStore((state) => state.clearError);
  const previousWorkspaceRef = useRef<Exclude<PageId, 'settings' | 'modules'>>('devices');
  const [requestedClipId, setRequestedClipId] = useState<string | null>(null);
  const [, setPreloadRevision] = useState(0);
  const preloadWorkspace = useCallback((target: PageId) => {
    if (target === 'audio' && snapshot?.settings.developerMode !== true) return;
    void workspaceLoaders[target]?.().then(() => setPreloadRevision((revision) => revision + 1));
  }, [snapshot?.settings.developerMode]);
  const AudioWorkspace = resolvedAudioPage?.default ?? AudioPage;
  const CaptureWorkspace = resolvedCapturePage?.default ?? CapturePage;
  const DevicesWorkspace = resolvedDevicesPage?.default ?? DevicesPage;
  const shouldOfferClipReview = snapshot
    ? reviewableAutoCapturedClips(
        snapshot.clips,
        snapshot.clipReview.reviewedThrough,
        snapshot.capture.autoCapture.runtime.activeGameId,
      ).length > 0
    : false;

  useLayoutEffect(() => {
    const percent = snapshot?.settings.uiScalePercent ?? 125;
    if (window.switchboard) {
      document.documentElement.style.removeProperty('zoom');
      window.switchboard.setUiScale(percent);
      return;
    }
    document.documentElement.style.setProperty('zoom', String(percent / 100));
    return () => { document.documentElement.style.removeProperty('zoom'); };
  }, [snapshot?.settings.uiScalePercent]);

  useEffect(() => manageAsyncCleanup(initialize()), [initialize]);

  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.settings.developerMode === true) {
      let cancelled = false;
      const preload = () => {
        void loadAudioPage()
          .then(() => {
            if (!cancelled) setPreloadRevision((revision) => revision + 1);
            return loadCapturePage();
          })
          .then(() => { if (!cancelled) setPreloadRevision((revision) => revision + 1); });
      };
      const idleCallback = window.requestIdleCallback(preload, { timeout: 1_000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleCallback);
      };
    }
    let cancelled = false;
    const preload = () => {
      void loadCapturePage().then(() => { if (!cancelled) setPreloadRevision((revision) => revision + 1); });
    };
    const idleCallback = window.requestIdleCallback(preload, { timeout: 1_000 });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(idleCallback);
    };
  }, [Boolean(snapshot), snapshot?.settings.developerMode]);

  useEffect(() => {
    if (page !== 'settings' && page !== 'modules') previousWorkspaceRef.current = page;
  }, [page]);

  const showOnboarding = Boolean(snapshot && snapshot.settings.onboardingCompleted !== true);

  useEffect(() => {
    if (!snapshot || showOnboarding) return;
    if (!isPageVisibleForProfile(page, snapshot.settings)) {
      setPage(defaultPageForProfile(snapshot.settings));
    }
  }, [page, showOnboarding, snapshot, setPage]);

  return (
    <LazyMotion features={domAnimation} strict>
      {snapshot ? (
        showOnboarding ? (
          <div className="app-shell relative flex h-full bg-chrome">
            <OnboardingFlow snapshot={snapshot} />
          </div>
        ) : (
        <div className="app-shell relative flex h-full bg-chrome">
          {page === 'settings' || page === 'modules' ? (
            <main className="min-h-0 min-w-0 flex-1 bg-background">
              <h1 className="sr-only">{pageTitles[page]}</h1>
              <SettingsPage snapshot={snapshot} onClose={() => setPage(previousWorkspaceRef.current)} />
            </main>
          ) : (
            <>
              <Sidebar snapshot={snapshot} page={page} onNavigate={setPage} onNavigateIntent={preloadWorkspace} />
              <div className="app-shell__workspace flex min-w-0 flex-1 flex-col">
                <TitleStrip />
                <section className="app-shell__content flex min-h-0 flex-1 flex-col">
                  <main className="min-h-0 flex-1 bg-background">
                    <h1 className="sr-only">{pageTitles[page]}</h1>
                    <Suspense fallback={<PageLoading label={pageTitles[page].toLocaleLowerCase()} />}>
                      <ScrollArea className="h-full">
                        {page === 'devices' ? <DevicesWorkspace snapshot={snapshot} /> : null}
                        {page === 'audio' ? <AudioWorkspace snapshot={snapshot} /> : null}
                        {page === 'capture' ? (
                          <CaptureWorkspace
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
        )
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
