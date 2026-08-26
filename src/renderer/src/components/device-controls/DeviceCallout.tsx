import type { CSSProperties } from 'react';
import type { ButtonAssignmentBinding, MouseAction } from '../../../../shared/contracts';
import { ButtonAssignmentPicker } from './ButtonAssignmentPicker';

interface DeviceCalloutProps {
  binding: ButtonAssignmentBinding;
  currentAction: MouseAction;
  availableActions: MouseAction[];
  disabled?: boolean;
  unavailableReason?: string;
  onChange: (action: MouseAction) => void;
}

export function DeviceCallout({
  binding,
  currentAction,
  availableActions,
  disabled,
  unavailableReason,
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
      trigger={(
        <button
          type="button"
          className="mouse-callout"
          data-callout-id={binding.hotspot.id}
          style={{ '--callout-y': `${binding.hotspot.position.y}%` } as CSSProperties}
          aria-label={`${binding.hotspot.label}, assigned to ${currentAction.label}${disabled ? ', editing unavailable' : ''}`}
          title={disabled ? unavailableReason : undefined}
        >
          <span className="mouse-callout__copy">
            <span className="mouse-callout__label">{binding.hotspot.label}</span>
            <span className="mouse-callout__assignment">{currentAction.label}</span>
          </span>
          <span className="mouse-callout__line" aria-hidden />
        </button>
      )}
    />
  );
}
