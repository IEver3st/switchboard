/** Aggregate only. No resource URLs, DOM text, or per-task entries are retained. */
export function observeDebugRuntime(enabled: boolean): () => void {
  if (!enabled) return () => {};
  const state = { supported: false, count: 0, totalMs: 0, maxMs: 0 };
  const target = window as unknown as { switchboardDebugRuntime?: typeof state };
  target.switchboardDebugRuntime = state;
  let observer: PerformanceObserver | undefined;
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    state.supported = true;
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        state.count++;
        state.totalMs += entry.duration;
        state.maxMs = Math.max(state.maxMs, entry.duration);
      }
    });
    observer.observe({ type: 'longtask' });
  }
  return () => {
    observer?.disconnect();
    delete target.switchboardDebugRuntime;
  };
}
