import type { CSSProperties } from 'react';
import type { DeviceHotspot as DeviceHotspotMetadata } from '../../../../shared/contracts';

export function DeviceHotspot({ hotspot }: { hotspot: DeviceHotspotMetadata }) {
  return (
    <span
      className="device-hotspot"
      style={{ '--hotspot-x': `${hotspot.position.x}%`, '--hotspot-y': `${hotspot.position.y}%` } as CSSProperties}
      aria-hidden
    />
  );
}
