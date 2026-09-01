import { Fragment, type ReactNode } from 'react';
import { Download, FolderOpen, MoreHorizontal, Pencil, Play, Share2, Star, Trash2, type LucideIcon } from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import type { ClipActions } from './types';

interface ClipActionDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  run: () => void;
}

export function ClipActionsMenu({ clip, actions, className }: { clip: Clip; actions: ClipActions; className?: string }) {
  const groups = clipActionGroups(clip, actions);
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
      <DropdownMenuContent align="end" className="w-48 p-1.5">
        {groups.map((group, groupIndex) => (
          <Fragment key={group[0]?.id ?? groupIndex}>
            {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((action) => <DropdownAction key={action.id} action={action} />)}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ClipContextMenu({ clip, actions, children }: { clip: Clip; actions: ClipActions; children: ReactNode }) {
  const groups = clipActionGroups(clip, actions);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48 p-1.5">
        {groups.map((group, groupIndex) => (
          <Fragment key={group[0]?.id ?? groupIndex}>
            {groupIndex > 0 ? <ContextMenuSeparator /> : null}
            {group.map((action) => {
              const Icon = action.icon;
              return <ContextMenuItem key={action.id} className={cn(action.destructive && 'text-destructive focus:text-destructive')} onSelect={action.run}><Icon className="size-3.5" />{action.label}</ContextMenuItem>;
            })}
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DropdownAction({ action }: { action: ClipActionDefinition }) {
  const Icon = action.icon;
  return <DropdownMenuItem className={cn(action.destructive && 'text-destructive focus:text-destructive')} onSelect={action.run}><Icon className="size-3.5" />{action.label}</DropdownMenuItem>;
}

function clipActionGroups(clip: Clip, actions: ClipActions): ClipActionDefinition[][] {
  return [
    [
      { id: 'open', label: 'Open editor', icon: Play, run: () => actions.open(clip) },
      { id: 'favorite', label: clip.favorite ? 'Remove from favorites' : 'Add to favorites', icon: Star, run: () => actions.favorite(clip, !clip.favorite) },
      { id: 'rename', label: 'Rename', icon: Pencil, run: () => actions.rename(clip) },
    ],
    [
      { id: 'export', label: 'Export for sharing', icon: Download, run: () => actions.export(clip) },
      { id: 'reveal', label: 'Show in folder', icon: FolderOpen, run: () => actions.reveal(clip) },
    ],
    [
      { id: 'delete', label: 'Delete…', icon: Trash2, destructive: true, run: () => actions.delete(clip) },
    ],
  ];
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
    <Tooltip>
      <TooltipTrigger asChild>
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
      </TooltipTrigger>
      <TooltipContent>{clip.favorite ? 'Remove favorite' : 'Favorite'}</TooltipContent>
    </Tooltip>
  );
}
