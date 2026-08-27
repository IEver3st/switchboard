import type { CSSProperties } from 'react';
import type { DeviceHotspot as DeviceHotspotMetadata } from '../../../../shared/contracts';

export function DeviceHotspot({
  hotspot,
  active,
  disabled,
  onActiveChange,
  onActivate,
}: {
  hotspot: DeviceHotspotMetadata;
  active?: boolean;
  disabled?: boolean;
  onActiveChange?: (active: boolean) => void;
  onActivate?: () => void;
}) {
  return (
    <button
      type="button"
      className="device-hotspot"
      data-hotspot-id={hotspot.id}
      data-callout-side={hotspot.calloutSide}
      data-linked-active={active || undefined}
      style={{ '--hotspot-x': `${hotspot.position.x}%`, '--hotspot-y': `${hotspot.position.y}%` } as CSSProperties}
      aria-label={`Configure ${hotspot.label}`}
      disabled={disabled}
      tabIndex={-1}
      onPointerEnter={() => onActiveChange?.(true)}
      onPointerLeave={() => onActiveChange?.(false)}
      onFocus={() => onActiveChange?.(true)}
      onBlur={() => onActiveChange?.(false)}
      onClick={onActivate}
    >
      <span className="device-hotspot__leader" />
      <span className="device-hotspot__dot" />
    </button>
  );
}
