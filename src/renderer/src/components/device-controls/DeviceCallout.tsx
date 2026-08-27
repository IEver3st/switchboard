import { ChevronDown } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ButtonAssignmentBinding, MouseAction } from '../../../../shared/contracts';
import { ButtonAssignmentPicker } from './ButtonAssignmentPicker';

interface DeviceCalloutProps {
  binding: ButtonAssignmentBinding;
  currentAction: MouseAction;
  availableActions: MouseAction[];
  disabled?: boolean;
  unavailableReason?: string;
  active?: boolean;
  onActiveChange?: (active: boolean) => void;
  onChange: (action: MouseAction) => void;
}

export function DeviceCallout({
  binding,
  currentAction,
  availableActions,
  disabled,
  unavailableReason,
  active,
  onActiveChange,
  onChange,
}: DeviceCalloutProps) {
  return (
    <ButtonAssignmentPicker
      buttonId={binding.buttonId}
      label={binding.hotspot.label}
      currentAction={currentAction}
      availableActions={availableActions}
      disabled={disabled}
      unavailableReason={unavailableReason}
      onChange={onChange}
      onOpenChange={onActiveChange}
      trigger={(
        <button
          type="button"
          className="mouse-callout"
          data-callout-id={binding.hotspot.id}
          data-linked-active={active || undefined}
          style={{ '--callout-y': `${binding.hotspot.position.y}%` } as CSSProperties}
          aria-label={`${binding.hotspot.label}, assigned to ${currentAction.label}${disabled ? ', editing unavailable' : ''}`}
          title={disabled ? unavailableReason : undefined}
          onPointerEnter={() => onActiveChange?.(true)}
          onPointerLeave={() => onActiveChange?.(false)}
          onFocus={() => onActiveChange?.(true)}
          onBlur={() => onActiveChange?.(false)}
        >
          <span className="mouse-callout__copy">
            <span className="mouse-callout__label">{binding.hotspot.label}</span>
            <span className="mouse-callout__assignment">{currentAction.label}<ChevronDown aria-hidden /></span>
          </span>
          <span className="mouse-callout__line" aria-hidden />
        </button>
      )}
    />
  );
}
