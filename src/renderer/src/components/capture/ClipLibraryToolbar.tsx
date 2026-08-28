import { ArrowDownUp, Check, Clapperboard, Gamepad2, Grid2X2, List, Search, SlidersHorizontal, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/cn';
import type { ClipDateFilter, ClipSort } from '../../../../shared/clip-library';
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
  const activeFilterCount = Number(controls.favoritesOnly) + Number(controls.game !== 'all') + Number(controls.date !== 'any');

  return (
    <>
      <div className="capture-command-header__tools capture-library__tools">
          <label className="capture-library__search capture-tool-control capture-tool-control--search relative">
            <span className="sr-only">Search clips</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" value={controls.query} onChange={(event) => controls.onQueryChange(event.target.value)} placeholder="Search clips" className="h-8 pl-8 text-[11px]" />
          </label>

          <Button type="button" variant="secondary" size="sm" className={cn('capture-tool-control capture-tool-control--favorites h-8 gap-1.5 px-2.5 text-[11px]', controls.favoritesOnly && 'capture-filter-active')} aria-pressed={controls.favoritesOnly} onClick={controls.onFavoritesChange}>
            <Star className={cn('size-3.5', controls.favoritesOnly && 'fill-warning text-warning')} /> <span className="capture-tool-label">Favorites</span>
          </Button>

          <div className="capture-tool-control capture-tool-control--game w-36 shrink-0">
            <Select value={controls.game} onValueChange={controls.onGameChange}>
              <SelectTrigger aria-label="Filter clips by game" className={cn('h-8 text-[11px]', controls.game !== 'all' && 'capture-filter-active')}><Gamepad2 className="capture-tool-icon size-3.5 shrink-0" aria-hidden="true" /><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All games</SelectItem>{controls.games.map((label) => <SelectItem key={label} value={label}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <DateFilter value={controls.date} activeFilterCount={activeFilterCount} onChange={controls.onDateChange} />

          <div className="capture-tool-control capture-tool-control--sort w-32 shrink-0">
            <Select value={controls.sort} onValueChange={controls.onSortChange}>
              <SelectTrigger aria-label="Sort clips" className="capture-sort-trigger h-8 text-[11px]"><ArrowDownUp className="capture-tool-icon size-3.5 shrink-0" aria-hidden="true" /><SelectValue /></SelectTrigger>
              <SelectContent>{sortOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <ToggleGroup type="single" value={controls.layout} onValueChange={(value) => { if (value) controls.onLayoutChange(value as 'grid' | 'list'); }} aria-label="Clip view" className="capture-tool-control capture-tool-control--view h-8 shrink-0 bg-surface-interactive">
            <ToggleGroupItem value="grid" aria-label="Grid view" title="Grid view" className="h-8 min-w-8 px-0"><Grid2X2 className="size-3.5" /></ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" title="List view" className="h-8 min-w-8 px-0"><List className="size-3.5" /></ToggleGroupItem>
          </ToggleGroup>

          {!controls.montageSelectionMode ? (
            <Button type="button" variant="primary" size="sm" className="capture-montage-trigger h-8 shrink-0 gap-1.5 px-3 text-[11px]" disabled={totalClipCount < 2} onClick={controls.onStartMontage}>
              <Clapperboard className="size-3.5" aria-hidden="true" /> <span>Create Montage</span>
            </Button>
          ) : null}
      </div>

      {controls.montageSelectionMode ? (
        <div className="capture-montage-selection" role="region" aria-label="Montage selection" data-testid="montage-selection-toolbar">
          <div className="min-w-0">
            <strong>Select 2 or more clips to create a montage</strong>
            <span aria-live="polite">{controls.selectedClipIds.length} selected</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-[11px]" disabled={clips.length === 0 || clips.every((clip) => controls.selectedClipIdSet.has(clip.id))} onClick={controls.onSelectAllVisible}>Select all{hasFilters ? ' shown' : ''}</Button>
            <Separator orientation="vertical" className="h-5" />
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-[11px]" onClick={controls.onCancelMontage}>Cancel</Button>
            <Button type="button" variant="primary" size="sm" className="h-7 px-2.5 text-[11px]" disabled={controls.selectedClipIds.length < 2} onClick={controls.onCreateMontage}>
              <Clapperboard className="size-3.5" aria-hidden="true" />
              {controls.selectedClipIds.length >= 2 ? `Create Montage · ${controls.selectedClipIds.length} clips` : 'Create Montage'}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DateFilter({ value, activeFilterCount, onChange }: { value: ClipDateFilter; activeFilterCount: number; onChange: (value: ClipDateFilter) => void }) {
  const active = activeFilterCount > 0;
  const selectedDate = dateOptions.find((option) => option.value === value)?.label ?? 'Any date';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={cn('capture-tool-control capture-tool-control--date h-8 gap-1.5 px-2.5 text-[11px]', active && 'capture-filter-active')}
          aria-label={active ? `Filters: ${activeFilterCount} active. Date: ${selectedDate}` : 'Filter clips by date'}
          aria-pressed={active}
        >
          <SlidersHorizontal className="size-3.5" />
          <span className="capture-tool-label">{active ? `Filter · ${activeFilterCount}` : 'Filter'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1.5">
        <div className="mb-1 px-2 py-1 text-[10px] font-medium text-muted-foreground">Date</div>
        {dateOptions.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)} className={cn('justify-between text-xs', value === option.value && 'bg-accent text-foreground')}>
            {option.label}
            {value === option.value ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
