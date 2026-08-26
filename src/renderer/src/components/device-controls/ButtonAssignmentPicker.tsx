import { Check, Search } from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import type { MouseAction } from '../../../../shared/contracts';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';

export interface ButtonAssignmentPickerProps {
  buttonId: string;
  label: string;
  currentAction: MouseAction;
  availableActions: MouseAction[];
  onChange: (action: MouseAction) => void;
  trigger: ReactElement;
  disabled?: boolean;
  unavailableReason?: string;
}

export function ButtonAssignmentPicker({
  label,
  currentAction,
  availableActions,
  onChange,
  trigger,
  disabled,
  unavailableReason,
}: ButtonAssignmentPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return availableActions;
    return availableActions.filter((action) => (
      `${action.label} ${action.searchTerms.join(' ')}`.toLowerCase().includes(needle)
    ));
  }, [availableActions, query]);
  const groups = ['mouse', 'system'] as const;

  return (
    <Popover open={open} onOpenChange={(next) => {
      if (disabled) return;
      setOpen(next);
      if (!next) setQuery('');
    }}>
      <PopoverTrigger asChild disabled={disabled}>{trigger}</PopoverTrigger>
      <PopoverContent
        className="assignment-picker"
        align={currentAction.category === 'mouse' ? 'center' : 'start'}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
      >
        <div className="assignment-picker__heading">
          <span>{label}</span>
          <strong>{currentAction.label}</strong>
        </div>
        {unavailableReason ? <p className="assignment-picker__reason">{unavailableReason}</p> : null}
        <div className="assignment-picker__search">
          <Search aria-hidden className="size-3.5" />
          <Input
            ref={searchRef}
            data-assignment-search
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions…"
            aria-label={`Search assignments for ${label}`}
          />
        </div>
        <div className="assignment-picker__results" role="listbox" aria-label="Available button actions">
          {groups.map((group) => {
            const actions = filtered.filter((action) => action.category === group);
            if (actions.length === 0) return null;
            return (
              <div key={group} className="assignment-picker__group">
                <div className="assignment-picker__group-label">{group}</div>
                {actions.map((action) => {
                  const selected = action.id === currentAction.id;
                  const selectable = action.selectable !== false;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={!selectable}
                      className={cn('assignment-picker__option', selected && 'is-selected')}
                      onClick={() => {
                        if (!selectable) return;
                        onChange(action);
                        setOpen(false);
                      }}
                    >
                      <span>{action.label}</span>
                      {selected ? <Check aria-hidden className="size-3.5" /> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 ? <p className="assignment-picker__empty">No matching supported actions.</p> : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
