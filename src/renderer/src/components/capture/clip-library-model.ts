import { useEffect, useMemo, useState } from 'react';
import type { Clip } from '../../../../shared/contracts';
import {
  clipGameLabel,
  filterAndSortClips,
  type ClipDateFilter,
  type ClipSort,
} from '../../../../shared/clip-library';

export type ClipLayout = 'grid' | 'list';

export interface ClipLibraryControls {
  query: string;
  game: string;
  date: ClipDateFilter;
  favoritesOnly: boolean;
  sort: ClipSort;
  layout: ClipLayout;
  games: string[];
  clips: Clip[];
  totalClipCount: number;
  hasFilters: boolean;
  visibleBytes: number;
  montageSelectionMode: boolean;
  selectedClipIds: string[];
  selectedClipIdSet: ReadonlySet<string>;
  onQueryChange: (value: string) => void;
  onGameChange: (value: string) => void;
  onDateChange: (value: ClipDateFilter) => void;
  onFavoritesChange: () => void;
  onSortChange: (value: ClipSort) => void;
  onLayoutChange: (value: ClipLayout) => void;
  onStartMontage: () => void;
  onCancelMontage: () => void;
  onSelectAllVisible: () => void;
  onCreateMontage: () => void;
  onToggleClipSelection: (clip: Clip) => void;
  onClearFilters: () => void;
}

export function useClipLibraryControls(allClips: Clip[], onCreateMontage: (clips: Clip[]) => void): ClipLibraryControls {
  const [query, setQuery] = useState('');
  const [game, setGame] = useState('all');
  const [date, setDate] = useState<ClipDateFilter>('any');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<ClipSort>('newest');
  const [layout, setLayout] = useState<ClipLayout>('grid');
  const [montageSelectionMode, setMontageSelectionMode] = useState(false);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const games = useMemo(() => [...new Set(allClips.map(clipGameLabel))].sort((left, right) => left.localeCompare(right)), [allClips]);
  const clips = useMemo(() => filterAndSortClips(allClips, { query, game, date, favoritesOnly, sort }), [allClips, date, favoritesOnly, game, query, sort]);
  const hasFilters = query.trim().length > 0 || game !== 'all' || date !== 'any' || favoritesOnly;
  const visibleBytes = clips.reduce((total, clip) => total + clip.fileSize, 0);
  const selectedClipIdSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);

  useEffect(() => {
    const available = new Set(allClips.map((clip) => clip.id));
    setSelectedClipIds((current) => current.filter((id) => available.has(id)));
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

  const cancelMontage = () => {
    setMontageSelectionMode(false);
    setSelectedClipIds([]);
  };

  const createMontage = () => {
    if (selectedClipIds.length < 2) return;
    const byId = new Map(allClips.map((clip) => [clip.id, clip]));
    const selected = selectedClipIds.map((id) => byId.get(id)).filter((clip): clip is Clip => Boolean(clip));
    if (selected.length < 2) return;
    onCreateMontage(selected);
    cancelMontage();
  };

  return {
    query,
    game,
    date,
    favoritesOnly,
    sort,
    layout,
    games,
    clips,
    totalClipCount: allClips.length,
    hasFilters,
    visibleBytes,
    montageSelectionMode,
    selectedClipIds,
    selectedClipIdSet,
    onQueryChange: setQuery,
    onGameChange: setGame,
    onDateChange: setDate,
    onFavoritesChange: () => setFavoritesOnly((current) => !current),
    onSortChange: setSort,
    onLayoutChange: setLayout,
    onStartMontage: () => setMontageSelectionMode(true),
    onCancelMontage: cancelMontage,
    onSelectAllVisible: () => setSelectedClipIds((current) => {
      const next = [...current];
      const known = new Set(current);
      for (const clip of clips) if (!known.has(clip.id)) next.push(clip.id);
      return next;
    }),
    onCreateMontage: createMontage,
    onToggleClipSelection: (clip) => setSelectedClipIds((current) => current.includes(clip.id)
      ? current.filter((id) => id !== clip.id)
      : [...current, clip.id]),
    onClearFilters: () => {
      setQuery('');
      setGame('all');
      setDate('any');
      setFavoritesOnly(false);
    },
  };
}
