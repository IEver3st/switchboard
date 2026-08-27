export function manageAsyncCleanup(setup: Promise<() => void>): () => void {
  let disposed = false;
  let cleaned = false;
  let cleanup: (() => void) | null = null;

  const runCleanup = (operation: () => void) => {
    if (cleaned) return;
    cleaned = true;
    operation();
  };

  void setup.then((operation) => {
    if (disposed) runCleanup(operation);
    else cleanup = operation;
  });

  return () => {
    if (disposed) return;
    disposed = true;
    if (cleanup) runCleanup(cleanup);
  };
}
