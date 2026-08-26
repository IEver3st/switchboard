import { useState, type ComponentType, type SVGProps } from 'react';
import { Download, FolderOpen, MoreHorizontal, Pencil, Play, Star, Trash2 } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import type { ClipActions } from './types';

export function ClipActionsMenu({ clip, actions, className }: { clip: Clip; actions: ClipActions; className?: string }) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => {
    setOpen(false);
    action();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${clip.name}`}
          className={cn(
            'grid size-8 place-items-center rounded-md border border-white/10 bg-black/75 text-white/80 opacity-0 transition-[opacity,background-color] duration-100 hover:bg-black/90 hover:text-white focus-visible:opacity-100 group-hover:opacity-100',
            className,
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1.5">
        <MenuAction icon={Play} label="Open editor" onClick={() => run(() => actions.open(clip))} />
        <MenuAction icon={Star} label={clip.favorite ? 'Remove favorite' : 'Favorite'} onClick={() => run(() => actions.favorite(clip, !clip.favorite))} />
        <MenuAction icon={Pencil} label="Rename" onClick={() => run(() => actions.rename(clip))} />
        <MenuAction icon={FolderOpen} label="Show in folder" onClick={() => run(() => actions.reveal(clip))} />
        <MenuAction icon={Download} label="Export" onClick={() => run(() => actions.export(clip))} />
        <div className="my-1 border-t border-border" />
        <MenuAction icon={Trash2} label="Delete" danger onClick={() => run(() => actions.delete(clip))} />
      </PopoverContent>
    </Popover>
  );
}

function MenuAction({ icon: Icon, label, onClick, danger }: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45',
        danger ? 'text-destructive' : 'text-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </button>
  );
}

export function ClipFavorite({ clip, onChange, className }: {
  clip: Clip;
  onChange: (favorite: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-favorite={clip.favorite}
      aria-label={clip.favorite ? `Remove ${clip.name} from favorites` : `Add ${clip.name} to favorites`}
      aria-pressed={clip.favorite}
      onClick={() => onChange(!clip.favorite)}
      className={cn(
        'grid size-8 place-items-center rounded-md border border-border bg-background/90 text-text-secondary opacity-0 transition-[opacity,color,background-color] duration-100 hover:bg-surface-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[favorite=true]:text-primary data-[favorite=true]:opacity-100',
        className,
      )}
    >
      <Star className={cn('size-4', clip.favorite && 'fill-current')} />
    </button>
  );
}
