import { useMemo, useState } from 'react';
import { CalendarDays, Grid2X2, List, Search, SlidersHorizontal, Star, Video } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import {
  clipGameLabel,
  filterAndSortClips,
  type ClipDateFilter,
  type ClipSort,
} from '../../../../shared/clip-library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export function ClipLibrary({ clips: allClips, actions, replayEnabled, hotkey }: {
  clips: Clip[];
  actions: ClipActions;
  replayEnabled: boolean;
  hotkey: string;
}) {
  const [query, setQuery] = useState('');
  const [game, setGame] = useState('all');
  const [date, setDate] = useState<ClipDateFilter>('any');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<ClipSort>('newest');
  const [layout, setLayout] = useState<ClipLayout>('grid');
  const games = useMemo(() => [...new Set(allClips.map(clipGameLabel))].sort((left, right) => left.localeCompare(right)), [allClips]);
  const clips = useMemo(() => filterAndSortClips(allClips, { query, game, date, favoritesOnly, sort }), [allClips, date, favoritesOnly, game, query, sort]);
  const hasFilters = query.trim().length > 0 || game !== 'all' || date !== 'any' || favoritesOnly;
  const visibleBytes = clips.reduce((total, clip) => total + clip.fileSize, 0);

  const clearFilters = () => {
    setQuery('');
    setGame('all');
    setDate('any');
    setFavoritesOnly(false);
  };

  return (
    <section aria-labelledby="clips-heading" className="min-h-0 flex-1 px-5 pb-8 pt-5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="mr-auto min-w-40">
          <h2 id="clips-heading" className="m-0 text-[16px] font-semibold tracking-[-0.01em] text-foreground">Clips</h2>
          <p className="m-0 mt-0.5 text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
            {hasFilters ? `${clips.length} of ${allClips.length} clips` : `${allClips.length} ${allClips.length === 1 ? 'clip' : 'clips'}`}
            {clips.length > 0 ? <span> <span aria-hidden="true">·</span> {formatBytes(visibleBytes)}</span> : null}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <label className="relative min-w-[220px] flex-1 xl:max-w-[340px]">
            <span className="sr-only">Search clips</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clips" className="h-9 pl-8 text-[12px]" />
          </label>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={cn('h-9 gap-1.5 px-2.5', favoritesOnly && 'border-primary/50 bg-primary/10 text-foreground')}
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((current) => !current)}
          >
            <Star className={cn('size-3.5', favoritesOnly && 'fill-primary text-primary')} /> Favorites
          </Button>

          <div className="w-36 shrink-0">
            <Select value={game} onValueChange={setGame}>
              <SelectTrigger aria-label="Filter clips by game" className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All games</SelectItem>{games.map((label) => <SelectItem key={label} value={label}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <DateFilter value={date} onChange={setDate} />

          <div className="w-32 shrink-0">
            <Select value={sort} onValueChange={(value) => setSort(value as ClipSort)}>
              <SelectTrigger aria-label="Sort clips" className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="flex h-9 shrink-0 overflow-hidden rounded-md border border-input bg-secondary" role="group" aria-label="Clip view">
            <button type="button" className={cn('grid w-9 place-items-center text-muted-foreground hover:text-foreground', layout === 'grid' && 'bg-accent text-primary')} aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 className="size-4" /></button>
            <button type="button" className={cn('grid w-9 place-items-center border-l border-input text-muted-foreground hover:text-foreground', layout === 'list' && 'bg-accent text-primary')} aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List className="size-4" /></button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {clips.length > 0 ? (
          layout === 'grid' ? <ClipGrid clips={clips} actions={actions} grouped={clips.length >= 8} /> : <ClipList clips={clips} actions={actions} />
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
  const [open, setOpen] = useState(false);
  const active = value !== 'any';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className={cn('h-9 gap-1.5 px-2.5', active && 'border-primary/50 bg-primary/10 text-foreground')}>
          {active ? <CalendarDays className="size-3.5 text-primary" /> : <SlidersHorizontal className="size-3.5" />}
          {active ? dateOptions.find((option) => option.value === value)?.label : 'Filter'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        <div className="mb-1 px-2 py-1 text-[10px] font-medium text-muted-foreground">Date</div>
        {dateOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => { onChange(option.value); setOpen(false); }}
            className={cn('flex h-8 w-full items-center justify-between rounded-sm px-2 text-left text-xs text-foreground hover:bg-accent', value === option.value && 'bg-accent')}
          >
            {option.label}
            {value === option.value ? <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
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
