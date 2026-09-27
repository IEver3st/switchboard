import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { useSystemStore } from '@/stores/use-system-store';
import { cn } from '@/lib/cn';
import { isSettingsCategoryVisible, newSettingIds, settingsEntry, type SettingsCategoryId } from './settings-catalog';

type NewSettingsState = {
  /** Unseen when this Settings visit began. Markers stay for the whole visit so the user can actually notice them. */
  isNew: (settingId: string) => boolean;
  /** True while a category still holds a new setting the user has not scrolled into view during this visit. */
  categoryHasUnseen: (category: SettingsCategoryId) => boolean;
  /** New settings not yet scrolled into view during this visit. */
  unseenIds: readonly string[];
};

const NewSettingsContext = createContext<NewSettingsState>({
  isNew: () => false,
  categoryHasUnseen: () => false,
  unseenIds: [],
});

export const NewSettingsProvider = NewSettingsContext.Provider;

export function useNewSettings(): NewSettingsState {
  return useContext(NewSettingsContext);
}

export function NewSettingDot({ settingId, className }: { settingId: string; className?: string }) {
  const { isNew } = useNewSettings();
  if (!isNew(settingId)) return null;
  return (
    <span className={cn('settings-new-dot', className)} data-new-setting-dot>
      <span className="sr-only">New</span>
    </span>
  );
}

/**
 * Tracks one-time "new" markers for a Settings visit. A setting counts as seen once
 * most of its row has been on screen; seen IDs persist through the main-owned settings
 * snapshot so the marker never returns after this visit.
 */
export function useNewSettingsTracker(
  snapshot: SystemSnapshot,
  scrollRootRef: RefObject<HTMLElement | null>,
): NewSettingsState {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const developerMode = snapshot.settings.developerMode === true;
  const [sessionNew] = useState(() => {
    const seen = new Set(snapshot.settings.seenNewSettings ?? []);
    return new Set(newSettingIds.filter((id) => !seen.has(id)));
  });
  const [observed, setObserved] = useState<ReadonlySet<string>>(() => new Set());
  const pendingRef = useRef(new Set<string>());
  const flushTimerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    if (pendingRef.current.size === 0) return;
    const current = useSystemStore.getState().snapshot?.settings.seenNewSettings ?? [];
    const merged = [...new Set([...current, ...pendingRef.current])].slice(-512);
    pendingRef.current.clear();
    void updateSettings({ seenNewSettings: merged });
  }, [updateSettings]);

  useEffect(() => () => flush(), [flush]);

  useEffect(() => {
    const root = scrollRootRef.current;
    const remaining = [...sessionNew].filter((id) => !observed.has(id));
    if (!root || remaining.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => (entry.target as HTMLElement).dataset.settingId)
        .filter((id): id is string => Boolean(id));
      if (visible.length === 0) return;
      for (const id of visible) pendingRef.current.add(id);
      setObserved((previous) => new Set([...previous, ...visible]));
      if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = window.setTimeout(flush, 600);
    }, { root, threshold: 0.6 });
    const observeRendered = () => {
      for (const id of remaining) {
        const element = root.querySelector(`[data-setting-id="${CSS.escape(id)}"]`);
        if (element) observer.observe(element);
      }
    };
    observeRendered();
    // Categories, capture tabs, and search swap rows in place. Re-scan once per frame
    // after DOM changes; this stops as soon as every new setting has been seen.
    let frame = 0;
    const mutations = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        observeRendered();
      });
    });
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
    };
  }, [flush, observed, scrollRootRef, sessionNew]);

  return useMemo<NewSettingsState>(() => ({
    unseenIds: [...sessionNew].filter((id) => !observed.has(id)),
    isNew: (settingId) => sessionNew.has(settingId),
    categoryHasUnseen: (category) => [...sessionNew].some((id) => {
      if (observed.has(id)) return false;
      const entry = settingsEntry(id);
      return entry?.category === category && isSettingsCategoryVisible(category, { developerMode });
    }),
  }), [developerMode, observed, sessionNew]);
}
