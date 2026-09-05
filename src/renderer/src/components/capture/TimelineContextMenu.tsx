import type { ComponentProps, ReactElement } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';

export type TimelineMenuAction = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean } | 'separator';

/** The owning timeline freezes the clicked source position before this menu opens. */
export function TimelineContextMenu({ children, label, actions, onContextMenu }: {
  children: ReactElement;
  label: string;
  actions: TimelineMenuAction[];
  onContextMenu: ComponentProps<typeof ContextMenuTrigger>['onContextMenu'];
}) {
  return <ContextMenu>
    <ContextMenuTrigger asChild onContextMenu={onContextMenu}>{children}</ContextMenuTrigger>
    <ContextMenuContent aria-label={label} collisionPadding={8} className="min-w-52 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto" onKeyDown={(event) => event.stopPropagation()}>
      <div className="max-w-64 truncate px-2 py-1.5 text-[10px] text-muted-foreground" title={label}>{label}</div>
      <ContextMenuSeparator />
      {actions.map((action, index) => action === 'separator' ? <ContextMenuSeparator key={index} /> : <ContextMenuItem key={action.label} disabled={action.disabled} onSelect={action.onSelect} className={action.danger ? 'text-destructive focus:text-destructive' : undefined}>{action.label}</ContextMenuItem>)}
    </ContextMenuContent>
  </ContextMenu>;
}
