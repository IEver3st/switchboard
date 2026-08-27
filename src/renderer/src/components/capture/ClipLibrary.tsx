import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, CalendarDays, Check, Clapperboard, Gamepad2, Grid2X2, List, Search, SlidersHorizontal, Star, Video } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import {
  clipGameLabel,
  filterAndSortClips,
  type ClipDateFilter,
  type ClipSort,
} from '../../../../shared/clip-library';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { ClipGrid } from './ClipGrid';
import { ClipList } from './ClipList';
import type { ClipActions } from './types';

type ClipLayout = 'grid' | 'list';

const sortOptions: Array<{ value: ClipSort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'largest', label: 'Largest' },
  { value: 'smallest', label: 'Smallest' },
  { value: 'longest', label: 'Longest' },
  { value: 'shortest', label: 'Shortest' },
];

const dateOptions: Array<{ value: ClipDateFilter; label: string }> = [
  { value: 'any', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last-7-days', label: 'Last 7 days' },
  { value: 'last-30-days', label: 'Last 30 days' },
];

export function ClipLibrary({ clips: allClips, actions, replayEnabled, hotkey, onCreateMontage }: {
  clips: Clip[];
  actions: ClipActions;
  replayEnabled: boolean;
  hotkey: string;
  onCreateMontage: (clips: Clip[]) => void;
}) {
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

  const toggleClipSelection = (clip: Clip) => {
    setSelectedClipIds((current) => current.includes(clip.id)
      ? current.filter((id) => id !== clip.id)
      : [...current, clip.id]);
  };

  const cancelMontageSelection = () => {
    setMontageSelectionMode(false);
    setSelectedClipIds([]);
  };

  const createMontage = () => {
    if (selectedClipIds.length < 2) return;
    const byId = new Map(allClips.map((clip) => [clip.id, clip]));
    const selected = selectedClipIds.map((id) => byId.get(id)).filter((clip): clip is Clip => Boolean(clip));
    if (selected.length < 2) return;
    onCreateMontage(selected);
    cancelMontageSelection();
  };

  const clearFilters = () => {
    setQuery('');
    setGame('all');
    setDate('any');
    setFavoritesOnly(false);
  };

  return (
    <section aria-labelledby="clips-heading" className="capture-library min-h-0 flex-1">
      <div className="capture-library__header">
        <div className="capture-library__title min-w-40">
          <div className="flex items-center gap-2.5">
            <h2 id="clips-heading" className="m-0 text-[16px] font-semibold tracking-[-0.01em] text-foreground">Clips</h2>
            {!montageSelectionMode ? (
              <Button type="button" variant="primary" size="sm" className="capture-montage-trigger h-8 gap-1.5 px-3 text-[11px]" disabled={allClips.length < 2} onClick={() => setMontageSelectionMode(true)}>
                <Clapperboard className="size-3.5" aria-hidden="true" /> Create Montage
              </Button>
            ) : null}
          </div>
          <p className="m-0 mt-0.5 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
            {hasFilters ? `${clips.length} of ${allClips.length} clips` : `${allClips.length} ${allClips.length === 1 ? 'clip' : 'clips'}`}
            {clips.length > 0 ? <span> <span aria-hidden="true">·</span> {formatBytes(visibleBytes)}</span> : null}
          </p>
        </div>

        <div className="capture-library__tools">
          <label className="capture-library__search capture-tool-control capture-tool-control--search relative">
            <span className="sr-only">Search clips</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clips" className="h-9 pl-8 text-[12px]" />
          </label>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={cn('capture-tool-control capture-tool-control--favorites h-9 gap-1.5 px-2.5', favoritesOnly && 'capture-filter-active')}
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((current) => !current)}
          >
            <Star className={cn('size-3.5', favoritesOnly && 'fill-warning text-warning')} /> Favorites
          </Button>

          <div className="capture-tool-control capture-tool-control--game w-36 shrink-0">
            <Select value={game} onValueChange={setGame}>
              <SelectTrigger aria-label="Filter clips by game" className={cn('h-9', game !== 'all' && 'capture-filter-active')}><Gamepad2 className="capture-tool-icon size-3.5 shrink-0" aria-hidden="true" /><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All games</SelectItem>{games.map((label) => <SelectItem key={label} value={label}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <DateFilter value={date} onChange={setDate} />

          <div className="capture-tool-control capture-tool-control--sort w-32 shrink-0">
            <Select value={sort} onValueChange={(value) => setSort(value as ClipSort)}>
              <SelectTrigger aria-label="Sort clips" className="capture-sort-trigger h-9"><ArrowDownUp className="capture-tool-icon size-3.5 shrink-0" aria-hidden="true" /><SelectValue /></SelectTrigger>
              <SelectContent>{sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <ToggleGroup type="single" value={layout} onValueChange={(value) => { if (value) setLayout(value as ClipLayout); }} aria-label="Clip view" className="capture-tool-control capture-tool-control--view h-9 shrink-0 bg-surface-1">
            <ToggleGroupItem value="grid" aria-label="Grid view" title="Grid view" className="h-9 min-w-9 px-0"><Grid2X2 className="size-4" /></ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" title="List view" className="h-9 min-w-9 px-0"><List className="size-4" /></ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {montageSelectionMode ? (
        <div className="capture-montage-selection" role="region" aria-label="Montage selection" data-testid="montage-selection-toolbar">
          <div className="min-w-0">
            <strong>Select 2 or more clips to create a montage</strong>
            <span aria-live="polite">{selectedClipIds.length} selected</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              disabled={clips.length === 0 || clips.every((clip) => selectedClipIdSet.has(clip.id))}
              onClick={() => setSelectedClipIds((current) => {
                const next = [...current];
                const known = new Set(current);
                for (const clip of clips) if (!known.has(clip.id)) next.push(clip.id);
                return next;
              })}
            >
              Select all{hasFilters ? ' shown' : ''}
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-[11px]" onClick={cancelMontageSelection}>Cancel</Button>
            <Button type="button" variant="primary" size="sm" className="h-7 px-2.5 text-[11px]" disabled={selectedClipIds.length < 2} onClick={createMontage}>
              <Clapperboard className="size-3.5" aria-hidden="true" />
              {selectedClipIds.length >= 2 ? `Create Montage · ${selectedClipIds.length} clips` : 'Create Montage'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="capture-library__content">
        {clips.length > 0 ? (
          layout === 'grid' ? (
            <ClipGrid clips={clips} actions={actions} grouped selectionMode={montageSelectionMode} selectedClipIds={selectedClipIds} onToggleSelection={toggleClipSelection} />
          ) : (
            <ClipList clips={clips} actions={actions} selectionMode={montageSelectionMode} selectedClipIds={selectedClipIds} onToggleSelection={toggleClipSelection} />
          )
        ) : allClips.length === 0 ? (
          <EmptyLibrary replayEnabled={replayEnabled} hotkey={hotkey} />
        ) : (
          <div className="grid min-h-64 place-items-center border-y border-border py-12 text-center">
            <div>
              <Search className="mx-auto size-6 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="m-0 mt-3 text-[14px] font-semibold text-foreground">No clips found</h3>
              <p className="m-0 mt-1 text-[12px] text-muted-foreground">Try another search or filter.</p>
              <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DateFilter({ value, onChange }: { value: ClipDateFilter; onChange: (value: ClipDateFilter) => void }) {
  const active = value !== 'any';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className={cn('capture-tool-control capture-tool-control--date h-9 gap-1.5 px-2.5', active && 'capture-filter-active')}>
          {active ? <CalendarDays className="size-3.5 text-primary" /> : <SlidersHorizontal className="size-3.5" />}
          {active ? dateOptions.find((option) => option.value === value)?.label : 'Filter'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1.5">
        <div className="mb-1 px-2 py-1 text-[10px] font-medium text-muted-foreground">Date</div>
        {dateOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className={cn('justify-between text-xs', value === option.value && 'bg-accent text-foreground')}
          >
            {option.label}
            {value === option.value ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyLibrary({ replayEnabled, hotkey }: { replayEnabled: boolean; hotkey: string }) {
  return (
    <div className="grid min-h-72 place-items-center border-y border-border py-12 text-center">
      <div className="max-w-sm">
        <Video className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="m-0 mt-3 text-[15px] font-semibold text-foreground">No clips yet</h3>
        <p className="m-0 mt-1.5 text-[12px] leading-5 text-muted-foreground">
          {replayEnabled ? <>Press {hotkey} when something worth saving happens.</> : <>Turn on Instant Replay in Capture Settings.<br />Then press {hotkey} when something worth saving happens.</>}
        </p>
      </div>
    </div>
  );
}
