import { ArrowDownUp, Check, Clapperboard, Grid2X2, List, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { gameEventTypeLabel } from '../../../../shared/auto-capture';
import type { ClipDateFilter, ClipEventFilter, ClipSort, ClipSourceFilter } from '../../../../shared/clip-library';
import type { ClipLibraryControls } from './clip-library-model';

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

export function ClipLibraryToolbar({ controls }: { controls: ClipLibraryControls }) {
  const { totalClipCount, clips, hasFilters } = controls;
  const activeFilterCount = Number(controls.favoritesOnly)
    + Number(controls.game !== 'all')
    + Number(controls.date !== 'any')
    + Number(controls.source !== 'all')
    + Number(controls.event !== 'all');

  if (controls.montageSelectionMode) {
    return (
      <div className="capture-montage-selection" role="region" aria-label="Montage selection" data-testid="montage-selection-toolbar">
        <div className="min-w-0">
          <strong>{controls.selectedClipIds.length > 0 ? `${controls.selectedClipIds.length} selected` : 'Select clips for a montage'}</strong>
          <span aria-live="polite">Choose at least 2 clips</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-[11px]" disabled={clips.length === 0 || clips.every((clip) => controls.selectedClipIdSet.has(clip.id))} onClick={controls.onSelectAllVisible}>Select all{hasFilters ? ' shown' : ''}</Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-[11px]" onClick={controls.onCancelMontage}>Cancel</Button>
          <Button type="button" variant="primary" size="sm" className="h-7 px-2.5 text-[11px]" disabled={controls.selectedClipIds.length < 2} onClick={controls.onCreateMontage}>
            <Clapperboard className="size-3.5" aria-hidden="true" />
            {controls.selectedClipIds.length >= 2 ? `Create Montage · ${controls.selectedClipIds.length} clips` : 'Create Montage'}
          </Button>
        </div>
      </div>
    );
  }

  return (
      <div className="capture-command-header__tools capture-library__tools">
          <label className="capture-library__search capture-tool-control capture-tool-control--search">
            <span className="sr-only">Search clips</span>
            <InputGroup>
              <InputGroupInput type="search" value={controls.query} onChange={(event) => controls.onQueryChange(event.target.value)} placeholder="Search clips" aria-label="Search clips" className="text-[11px]" />
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              {controls.query ? <InputGroupAddon align="inline-end"><InputGroupButton type="button" aria-label="Clear search" onClick={() => controls.onQueryChange('')}><X /></InputGroupButton></InputGroupAddon> : null}
            </InputGroup>
          </label>

          <ButtonGroup className="capture-library-menus" aria-label="Filter and sort clips">
            <ClipFilters
              favoritesOnly={controls.favoritesOnly}
              game={controls.game}
              games={controls.games}
              date={controls.date}
              source={controls.source}
              event={controls.event}
              availableEvents={controls.availableEvents}
              activeFilterCount={activeFilterCount}
              onFavoritesChange={controls.onFavoritesChange}
              onGameChange={controls.onGameChange}
              onDateChange={controls.onDateChange}
              onSourceChange={controls.onSourceChange}
              onEventChange={controls.onEventChange}
              onClearFilters={controls.onClearFilters}
            />
            <Select value={controls.sort} onValueChange={controls.onSortChange}>
              <SelectTrigger aria-label="Sort clips" className="capture-tool-control capture-tool-control--sort capture-sort-trigger h-8 w-28 shrink-0 text-[11px]"><ArrowDownUp className="capture-tool-icon size-3.5 shrink-0" aria-hidden="true" /><SelectValue /></SelectTrigger>
              <SelectContent className="capture-tool-menu">{sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </ButtonGroup>

          <ToggleGroup type="single" value={controls.layout} onValueChange={(value) => { if (value) controls.onLayoutChange(value as 'grid' | 'list'); }} aria-label="Clip view" className="capture-tool-control capture-tool-control--view h-8 shrink-0 bg-surface-interactive">
            <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="grid" aria-label="Grid view" className="h-8 min-w-8 px-0"><Grid2X2 className="size-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent>Grid view</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><ToggleGroupItem value="list" aria-label="List view" className="h-8 min-w-8 px-0"><List className="size-3.5" /></ToggleGroupItem></TooltipTrigger><TooltipContent>List view</TooltipContent></Tooltip>
          </ToggleGroup>

          <Button type="button" variant="secondary" size="sm" className="capture-montage-trigger h-8 shrink-0 gap-1.5 px-3 text-[11px]" aria-label="Create Montage" disabled={totalClipCount < 2} onClick={controls.onStartMontage}>
            <Clapperboard className="size-3.5" aria-hidden="true" /> <span><span className="capture-montage-create">Create </span>Montage</span>
          </Button>
      </div>
  );
}

function ClipFilters({ favoritesOnly, game, games, date, source, event, availableEvents, activeFilterCount, onFavoritesChange, onGameChange, onDateChange, onSourceChange, onEventChange, onClearFilters }: {
  favoritesOnly: boolean;
  game: ClipLibraryControls['game'];
  games: ClipLibraryControls['games'];
  date: ClipDateFilter;
  source: ClipSourceFilter;
  event: ClipEventFilter;
  availableEvents: ClipLibraryControls['availableEvents'];
  activeFilterCount: number;
  onFavoritesChange: () => void;
  onGameChange: (value: string) => void;
  onDateChange: (value: ClipDateFilter) => void;
  onSourceChange: (value: ClipSourceFilter) => void;
  onEventChange: (value: ClipEventFilter) => void;
  onClearFilters: () => void;
}) {
  const active = activeFilterCount > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn('capture-tool-control capture-tool-control--date h-8 gap-1.5 px-2.5 text-[11px]', active && 'capture-filter-active')}
          aria-label={active ? `Filters: ${activeFilterCount} active` : 'Filter clips'}
          aria-pressed={active}
          data-game={game}
          data-favorites={favoritesOnly || undefined}
        >
          <SlidersHorizontal className="size-3.5" />
          <span className="capture-tool-label">Filter{active ? ' · ' : ''}</span>
          {active ? <Badge variant="accent" className="capture-filter-count border-0 bg-transparent px-0 py-0 text-[9px] tracking-normal">{activeFilterCount}</Badge> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="capture-tool-menu capture-filter-menu w-48 p-1.5">
        <DropdownMenuItem onSelect={onFavoritesChange} className={cn('justify-between text-xs', favoritesOnly && 'bg-accent text-foreground')}>
          Favorites only
          {favoritesOnly ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
        </DropdownMenuItem>
        <div className="mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-medium text-muted-foreground">Game</div>
        {(['all', ...games] as const).map((value) => (
          <DropdownMenuItem key={value} onSelect={() => onGameChange(value)} className={cn('justify-between text-xs', game === value && 'bg-accent text-foreground')}>
            {value === 'all' ? 'All games' : value}
            {game === value ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
        <div className="mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-medium text-muted-foreground">Source</div>
        {([
          ['all', 'All clips'],
          ['manual', 'Manual captures'],
          ['auto-capture', 'Auto Captured'],
        ] as const).map(([value, label]) => (
          <DropdownMenuItem key={value} onSelect={() => onSourceChange(value)} className={cn('justify-between text-xs', source === value && 'bg-accent text-foreground')}>
            {label}
            {source === value ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
        {availableEvents.length > 0 ? (
          <>
            <div className="mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-medium text-muted-foreground">Event</div>
            <DropdownMenuItem onSelect={() => onEventChange('all')} className={cn('justify-between text-xs', event === 'all' && 'bg-accent text-foreground')}>
              All events
              {event === 'all' ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
            </DropdownMenuItem>
            {availableEvents.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => onEventChange(type)} className={cn('justify-between text-xs', event === type && 'bg-accent text-foreground')}>
                {gameEventTypeLabel(type)}
                {event === type ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <div className="mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-medium text-muted-foreground">Date</div>
        {dateOptions.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => onDateChange(option.value)} className={cn('justify-between text-xs', date === option.value && 'bg-accent text-foreground')}>
            {option.label}
            {date === option.value ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
        {active ? (
          <DropdownMenuItem onSelect={onClearFilters} className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
            Clear filters
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
