import { useSystemStore } from '@/stores/use-system-store';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { Clip, GameEventType } from '../../../../shared/contracts';
import {
  clipGameLabel,
  filterAndSortClips,
  type ClipDateFilter,
  type ClipEventFilter,
  type ClipSourceFilter,
  type ClipSort,
} from '../../../../shared/clip-library';

export type ClipLayout = 'grid' | 'list';

export interface ClipLibraryControls {
  query: string;
  game: string;
  date: ClipDateFilter;
  favoritesOnly: boolean;
  source: ClipSourceFilter;
  event: ClipEventFilter;
  availableEvents: GameEventType[];
  sort: ClipSort;
  layout: ClipLayout;
  games: string[];
  clips: Clip[];
  totalClipCount: number;
  hasFilters: boolean;
  montageSelectionMode: boolean;
  selectedClipIds: string[];
  selectedClipIdSet: ReadonlySet<string>;
  onQueryChange: (value: string) => void;
  onGameChange: (value: string) => void;
  onDateChange: (value: ClipDateFilter) => void;
  onFavoritesChange: () => void;
  onSourceChange: (value: ClipSourceFilter) => void;
  onEventChange: (value: ClipEventFilter) => void;
  onSortChange: (value: ClipSort) => void;
  onLayoutChange: (value: ClipLayout) => void;
  onStartMontage: () => void;
  onCancelMontage: () => void;
  onSelectAllVisible: () => void;
  onCreateMontage: () => void;
  onToggleClipSelection: (clip: Clip, range?: boolean) => void;
  onBulkFavorite?: (favorite: boolean) => void;
  onBulkDelete?: () => void;
  bulkPending?: boolean;
  onClearFilters: () => void;
}

let sessionView = { query: '', game: 'all', date: 'any' as ClipDateFilter, favoritesOnly: false, source: 'all' as ClipSourceFilter, event: 'all' as ClipEventFilter };

export function useClipLibraryControls(allClips: Clip[], onCreateMontage: (clips: Clip[]) => void): ClipLibraryControls {
  const preferences = useSystemStore(state => state.snapshot?.settings.clipLibraryView);
  const updateSettings = useSystemStore(state => state.updateSettings);
  const anchor = useRef<string | null>(null);
  const [query, setQuery] = useState(sessionView.query);
  const [game, setGame] = useState(sessionView.game);
  const [date, setDate] = useState<ClipDateFilter>(sessionView.date);
  const [favoritesOnly, setFavoritesOnly] = useState(sessionView.favoritesOnly);
  const [source, setSource] = useState<ClipSourceFilter>(sessionView.source);
  const [event, setEvent] = useState<ClipEventFilter>(sessionView.event);
  const sort = preferences?.sort ?? 'newest';
  const layout = preferences?.layout ?? 'grid';
  const [montageSelectionMode, setMontageSelectionMode] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const games = useMemo(() => [...new Set(allClips.map(clipGameLabel))].sort((left, right) => left.localeCompare(right)), [allClips]);
  const availableEvents = useMemo(() => [...new Set(allClips.flatMap((clip) => clip.autoCapture?.events.map((marker) => marker.type) ?? []))].sort(), [allClips]);
  const clips = useMemo(() => filterAndSortClips(allClips, { query, game, date, favoritesOnly, source, event, sort }), [allClips, date, event, favoritesOnly, game, query, sort, source]);
  const hasFilters = query.trim().length > 0 || game !== 'all' || date !== 'any' || favoritesOnly || source !== 'all' || event !== 'all';
  const selectedClipIdSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);

  useEffect(() => {
    const available = new Set(allClips.map((clip) => clip.id));
    setSelectedClipIds((current) => {
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [allClips]);

  useEffect(() => {
    if (!montageSelectionMode) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"]')) return;
      event.preventDefault();
      setMontageSelectionMode(false);
      setSelectedClipIds([]);
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [montageSelectionMode]);

  useEffect(() => { sessionView = { query, game, date, favoritesOnly, source, event }; }, [query, game, date, favoritesOnly, source, event]);
  const toggleClipSelection = useCallback((clip: Clip, range = false) => {
    const start = clips.findIndex(item => item.id === anchor.current);
    const end = clips.findIndex(item => item.id === clip.id);
    if (range && start >= 0 && end >= 0) {
      const ids = clips.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.id);
      setSelectedClipIds(current => [...new Set([...current, ...ids])]);
    } else {
      setSelectedClipIds(current => current.includes(clip.id) ? current.filter(id => id !== clip.id) : [...current, clip.id]);
    }
    anchor.current = clip.id;
  }, [clips]);

  const cancelMontage = () => {
    setMontageSelectionMode(false);
    setSelectedClipIds([]);
  };

  const createMontage = () => {
    if (selectedClipIds.length < 2) return;
    const byId = new Map(allClips.map((clip) => [clip.id, clip]));
    const selected = selectedClipIds.map((id) => byId.get(id)).filter((clip): clip is Clip => Boolean(clip) && clip?.availability !== 'unavailable');
    if (selected.length < 2) return;
    onCreateMontage(selected);
    cancelMontage();
  };

  return {
    query,
    game,
    date,
    favoritesOnly,
    source,
    event,
    availableEvents,
    sort,
    layout,
    games,
    clips,
    totalClipCount: allClips.length,
    hasFilters,
    montageSelectionMode,
    selectedClipIds,
    selectedClipIdSet,
    onQueryChange: setQuery,
    onGameChange: setGame,
    onDateChange: setDate,
    onFavoritesChange: () => setFavoritesOnly((current) => !current),
    onSourceChange: setSource,
    onEventChange: setEvent,
    onSortChange: (sort) => { void updateSettings({ clipLibraryView: { layout, sort } }); },
    onLayoutChange: (layout) => { void updateSettings({ clipLibraryView: { layout, sort } }); },
    onStartMontage: () => setMontageSelectionMode(true),
    onCancelMontage: cancelMontage,
    onSelectAllVisible: () => setSelectedClipIds((current) => {
      const next = [...current];
      const known = new Set(current);
      for (const clip of clips) if (!known.has(clip.id)) next.push(clip.id);
      return next;
    }),
    onCreateMontage: createMontage,
    onToggleClipSelection: toggleClipSelection,
    onClearFilters: () => {
      setQuery('');
      setGame('all');
      setDate('any');
      setFavoritesOnly(false);
      setSource('all');
      setEvent('all');
    },
  };
}
