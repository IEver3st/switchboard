import { useEffect, useMemo, useState } from 'react';
import { Film, Search } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDuration, formatVideoQuality } from '@/lib/format';

export function AddMontageClipsDialog({
  open,
  clips,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  clips: readonly Clip[];
  onOpenChange: (open: boolean) => void;
  onAdd: (clips: Clip[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIds([]);
  }, [open]);

  const visibleClips = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return clips;
    return clips.filter((clip) => `${clip.name} ${clip.game ?? ''}`.toLocaleLowerCase().includes(normalized));
  }, [clips, query]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const confirm = () => {
    const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
    const next = selectedIds
      .map((id) => clipsById.get(id))
      .filter((clip): clip is Clip => Boolean(clip && clip.durationMs >= 100));
    if (next.length === 0) return;
    onAdd(next);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[620px] overflow-hidden p-0 no-drag">
        <DialogHeader className="px-5 pb-3 pt-5 pr-12">
          <DialogTitle>Add clips</DialogTitle>
          <DialogDescription>
            Add one or several library clips after the selected segment. A source clip can be reused as many times as needed.
          </DialogDescription>
        </DialogHeader>
        <div className="border-y border-border">
          <label className="flex h-11 items-center gap-2 border-b border-border px-4">
            <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              placeholder="Search clips"
              aria-label="Search clips"
            />
          </label>
          <ScrollArea className="h-[360px]">
            <div className="divide-y divide-border/70">
              {visibleClips.map((clip) => {
                const unavailable = clip.durationMs < 100;
                const checked = selected.has(clip.id);
                return (
                  <label
                    key={clip.id}
                    className="grid min-h-[58px] cursor-pointer grid-cols-[16px_56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 hover:bg-surface-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={unavailable}
                      onCheckedChange={(next) => setSelectedIds((current) => next
                        ? current.includes(clip.id) ? current : [...current, clip.id]
                        : current.filter((id) => id !== clip.id))}
                      aria-label={`Add ${clip.name}`}
                    />
                    <span
                      className="block h-9 w-14 overflow-hidden rounded-[3px] border border-border bg-surface-2 bg-cover bg-center"
                      style={{ backgroundImage: `url("switchboard-media://thumbnail/${encodeURIComponent(clip.id)}")` }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <strong className="block truncate text-[11px] font-semibold text-foreground">{clip.name}</strong>
                      <span className="mt-0.5 block truncate text-[9.5px] text-muted-foreground">
                        {clip.game ?? 'Unknown game'} · {formatVideoQuality(clip.width, clip.height, clip.fps)}
                      </span>
                    </span>
                    <span className="font-mono text-[9.5px] tabular-nums text-muted-foreground">
                      {unavailable ? 'Unavailable' : formatDuration(clip.durationMs / 1_000)}
                    </span>
                  </label>
                );
              })}
              {visibleClips.length === 0 ? (
                <div className="grid h-48 place-items-center text-center text-[10px] text-muted-foreground">
                  <span><Film className="mx-auto mb-2 size-5 opacity-55" />No matching clips</span>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
        <div className="flex flex-row items-center justify-between px-5 py-4">
          <span className="text-[10px] text-muted-foreground">{selectedIds.length} selected</span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" variant="primary" size="sm" disabled={selectedIds.length === 0} onClick={confirm}>
              Add to montage
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
