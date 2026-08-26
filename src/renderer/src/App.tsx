import { useEffect } from 'react';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { TitleStrip } from '@/components/layout/title-strip';
import { Topbar } from '@/components/layout/topbar';
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
      <div className="grid h-full place-items-center bg-[var(--surface-0)]">
        <div className="flex items-center gap-3 text-[12px] text-[#7e8792]"><LoaderCircle className="size-4 animate-spin" /> Starting Switchboard control plane…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--surface-0)]">
      <TitleStrip />
      <div className="flex min-h-0 flex-1">
        <Sidebar snapshot={snapshot} page={page} onNavigate={setPage} />
        <section className="flex min-w-0 flex-1 flex-col">
          <Topbar page={page} snapshot={snapshot} />
          <main className="min-h-0 flex-1 overflow-auto bg-[#0f1114]">
            {page === 'overview' ? <OverviewPage snapshot={snapshot} /> : null}
            {page === 'devices' ? <DevicesPage snapshot={snapshot} /> : null}
            {page === 'audio' ? <AudioPage snapshot={snapshot} /> : null}
            {page === 'capture' ? <CapturePage snapshot={snapshot} /> : null}
            {page === 'modules' ? <ModulesPage snapshot={snapshot} /> : null}
            {page === 'settings' ? <SettingsPage snapshot={snapshot} /> : null}
          </main>
        </section>
      </div>

      {actionPending ? (
        <div className="pointer-events-none fixed bottom-4 right-4 flex items-center gap-2 rounded-[7px] border border-[var(--border)] bg-[#171a20] px-3 py-2 text-[10px] text-[#89919c] shadow-xl">
          <LoaderCircle className="size-3.5 animate-spin" /> Applying change
        </div>
      ) : null}

      {error ? (
        <div className="fixed bottom-4 left-[230px] flex max-w-lg items-center gap-3 rounded-[8px] border border-[#61353b] bg-[#2a171b] px-4 py-3 text-[11px] text-[#f0a4ad] shadow-xl">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={clearError} className="grid size-6 place-items-center rounded-[5px] hover:bg-[#3a2025]"><X className="size-3.5" /></button>
        </div>
      ) : null}
    </div>
  );
}
