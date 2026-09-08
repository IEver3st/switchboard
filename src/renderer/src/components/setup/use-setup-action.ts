import { useRef, useState } from 'react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { useSystemStore } from '@/stores/use-system-store';
import { reconcileSnapshot } from '@/stores/reconcile-snapshot';

export function useSetupAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const run = async (action: () => Promise<SystemSnapshot | void>) => {
    if (busy.current) return null;
    busy.current = true; setPending(true); setError(null);
    try {
      const result = await action();
      if (result) useSystemStore.setState(state => ({ snapshot: reconcileSnapshot(state.snapshot, result) }));
      return result ?? true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); return null; }
    finally { busy.current = false; setPending(false); }
  };
  return { pending, error, run };
}
