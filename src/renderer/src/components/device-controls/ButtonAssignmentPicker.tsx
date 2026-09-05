import { Check } from 'lucide-react';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type { MouseAction } from '../../../../shared/contracts';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';

export interface ButtonAssignmentPickerProps {
  buttonId: string;
  label: string;
  currentAction: MouseAction;
  availableActions: MouseAction[];
  onChange: (action: MouseAction) => void;
  onOpenChange?: (open: boolean) => void;
  trigger: ReactElement;
  disabled?: boolean;
  unavailableReason?: string;
  unavailableAction?: ReactNode;
}

export function ButtonAssignmentPicker({
  label,
  currentAction,
  availableActions,
  onChange,
  onOpenChange,
  trigger,
  disabled,
  unavailableReason,
  unavailableAction,
}: ButtonAssignmentPickerProps) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupActions(availableActions), [availableActions]);
  const searchable = availableActions.length >= 7;

  return (
    <Popover open={open} onOpenChange={(next) => {
      setOpen(next);
      onOpenChange?.(next);
    }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="assignment-picker" align="center">
        <div className="assignment-picker__heading">
          <span>{label}</span>
          <strong>{currentAction.label}</strong>
        </div>
        {disabled ? (
          <>
            <p className="assignment-picker__reason" role="status">
              {unavailableReason ?? 'Button assignments are unavailable for this connection.'}
            </p>
            {unavailableAction ? <div className="px-3 pb-3">{unavailableAction}</div> : null}
          </>
        ) : null}
        <Command>
          {searchable ? <CommandInput placeholder="Search supported actions…" aria-label={`Search assignments for ${label}`} /> : null}
          <CommandList>
            <CommandEmpty>No matching supported actions.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.id} heading={group.label}>
                {group.actions.map((action) => {
                  const selected = action.id === currentAction.id;
                  const selectable = !disabled && action.selectable !== false;
                  return (
                    <CommandItem
                      key={action.id}
                      value={`${action.label} ${action.searchTerms.join(' ')}`}
                      keywords={action.searchTerms}
                      disabled={!selectable}
                      className={cn(selected && 'is-selected')}
                      onSelect={() => {
                        if (!selectable) return;
                        onChange(action);
                        setOpen(false);
                        onOpenChange?.(false);
                      }}
                    >
                      <span>{action.label}</span>
                      {selected ? <Check aria-hidden className="ml-auto size-3.5" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function groupActions(actions: MouseAction[]) {
  const definitions = [
    { id: 'mouse', label: 'Mouse', match: (action: MouseAction) => action.category === 'mouse' && !action.id.startsWith('mouse.dpi-') },
    { id: 'device', label: 'Device', match: (action: MouseAction) => action.id.startsWith('mouse.dpi-') },
    { id: 'system', label: 'Existing assignment', match: (action: MouseAction) => action.category === 'system' },
  ];
  return definitions
    .map((definition) => ({ ...definition, actions: actions.filter(definition.match) }))
    .filter((definition) => definition.actions.length > 0);
}
