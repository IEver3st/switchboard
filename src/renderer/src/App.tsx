import { useEffect } from 'react';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { TitleStrip } from '@/components/layout/title-strip';
import { Topbar } from '@/components/layout/topbar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AudioPage } from '@/pages/audio';
import { CapturePage } from '@/pages/capture';
import { DevicesPage } from '@/pages/devices';
import { ModulesPage } from '@/pages/modules';
import { OverviewPage } from '@/pages/overview';
import { SettingsPage } from '@/pages/settings';
import { useSystemStore } from '@/stores/use-system-store';

export function App() {
  const snapshot = useSystemStore((state) => state.snapshot);
  const page = useSystemStore((state) => state.page);
  const loading = useSystemStore((state) => state.loading);
  const error = useSystemStore((state) => state.error);
  const actionPending = useSystemStore((state) => state.actionPending);
  const initialize = useSystemStore((state) => state.initialize);
  const setPage = useSystemStore((state) => state.setPage);
  const clearError = useSystemStore((state) => state.clearError);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void initialize().then((dispose) => {
      unsubscribe = dispose;
    });
    return () => unsubscribe?.();
  }, [initialize]);

  if (loading || !snapshot) {
    return (
      <div className="grid h-full place-items-center bg-background">
        <div className="flex items-center gap-3 text-xs text-muted-foreground" role="status">
          <img src="./switchboard-icon.png" alt="" className="size-8 object-contain" draggable={false} />
          <LoaderCircle className="size-4 animate-spin" />
          Starting Switchboard control plane…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <TitleStrip />
      <div className="flex min-h-0 flex-1">
        <Sidebar snapshot={snapshot} page={page} onNavigate={setPage} />
        <section className="flex min-w-0 flex-1 flex-col">
          <Topbar page={page} snapshot={snapshot} />
          <main className="min-h-0 flex-1 bg-background">
            <ScrollArea className="h-full">
              {page === 'overview' ? <OverviewPage snapshot={snapshot} /> : null}
              {page === 'devices' ? <DevicesPage snapshot={snapshot} /> : null}
              {page === 'audio' ? <AudioPage snapshot={snapshot} /> : null}
              {page === 'capture' ? <CapturePage snapshot={snapshot} /> : null}
              {page === 'modules' ? <ModulesPage snapshot={snapshot} /> : null}
              {page === 'settings' ? <SettingsPage snapshot={snapshot} /> : null}
            </ScrollArea>
          </main>
        </section>
      </div>

      {actionPending ? (
        <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-[10px] text-muted-foreground shadow-xl" role="status">
          <LoaderCircle className="size-3.5 animate-spin" /> Applying change
        </div>
      ) : null}

      {error ? (
        <div className="fixed bottom-4 left-20 flex max-w-lg items-center gap-3 rounded-lg border border-destructive/40 bg-[#2a171b] px-4 py-3 text-[11px] text-[#f0a4ad] shadow-xl" role="alert">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={clearError} aria-label="Dismiss error" className="grid size-6 place-items-center rounded-sm hover:bg-white/5">
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
