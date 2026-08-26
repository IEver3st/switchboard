import type { CSSProperties } from 'react';
import type { DeviceHotspot as DeviceHotspotMetadata } from '../../../../shared/contracts';

export function DeviceHotspot({ hotspot }: { hotspot: DeviceHotspotMetadata }) {
  return (
    <span
      className="device-hotspot"
      data-hotspot-id={hotspot.id}
      data-callout-side={hotspot.calloutSide}
      style={{ '--hotspot-x': `${hotspot.position.x}%`, '--hotspot-y': `${hotspot.position.y}%` } as CSSProperties}
      aria-hidden
    >
      <span className="device-hotspot__leader" />
      <span className="device-hotspot__dot" />
    </span>
  );
}
