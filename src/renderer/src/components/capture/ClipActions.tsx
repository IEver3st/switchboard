import { Download, FolderOpen, MoreHorizontal, Pencil, Play, Share2, Star, Trash2 } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import type { ClipActions } from './types';

export function ClipActionsMenu({ clip, actions, className }: { clip: Clip; actions: ClipActions; className?: string }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Actions for ${clip.name}`} className={cn('capture-clip-action', className)}><MoreHorizontal className="size-4" /></button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44 p-1.5">
        <DropdownMenuItem onSelect={() => actions.open(clip)}><Play className="size-3.5" />Open editor</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.favorite(clip, !clip.favorite)}><Star className={cn('size-3.5', clip.favorite && 'fill-warning text-warning')} />{clip.favorite ? 'Remove favorite' : 'Favorite'}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.rename(clip)}><Pencil className="size-3.5" />Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.reveal(clip)}><FolderOpen className="size-3.5" />Show in folder</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.export(clip)}><Download className="size-3.5" />Export</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.delete(clip)}><Trash2 className="size-3.5" />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ClipShare({ clip, onShare, className }: { clip: Clip; onShare: () => void; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`Share ${clip.name}`} onClick={onShare} className={cn('capture-clip-action', className)}><Share2 className="size-3.5" /></button>
      </TooltipTrigger>
      <TooltipContent>Export for sharing</TooltipContent>
    </Tooltip>
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
      className={cn('capture-clip-favorite', className)}
    >
      <Star className={cn('size-4', clip.favorite && 'fill-current')} />
    </button>
  );
}
