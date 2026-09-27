import { useState } from 'react';
import { ListFilter } from 'lucide-react';
import type { AudioDevice, AudioDeviceDirection } from '../../../../shared/contracts';
import { isAudioTransport } from '../../../../shared/audio-devices';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';

/** Devices a picker may offer. The current selection stays listed even when excluded. */
export function pickableAudioDevices(
  devices: AudioDevice[],
  direction: AudioDeviceDirection,
  excludedIds: readonly string[] = [],
  selectedId?: string,
): AudioDevice[] {
  return devices.filter((device) => (
    device.direction === direction
    && device.available
    && !isAudioTransport(device)
    && (!excludedIds.includes(device.id) || device.id === selectedId)
  ));
}

export function AudioDevicePicker({
  value,
  devices,
  direction,
  label,
  disabled,
  className,
  excludedIds,
  onManage,
  onChange,
}: {
  value: string;
  devices: AudioDevice[];
  direction: AudioDeviceDirection;
  label: string;
  disabled?: boolean;
  className?: string;
  excludedIds?: readonly string[];
  /** Opens the device manager from the list footer. */
  onManage?: () => void;
  onChange: (deviceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = pickableAudioDevices(devices, direction, excludedIds, value);
  const selectedValue = options.some((device) => device.id === value) ? value : undefined;

  return (
    <Select open={open} onOpenChange={setOpen} value={selectedValue} onValueChange={onChange} disabled={disabled || options.length === 0}>
      <SelectTrigger
        aria-label={label}
        className={cn('h-9 w-full min-w-0 border-0 bg-transparent px-0 text-xs font-medium shadow-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45', className)}
      >
        <SelectValue placeholder="No available device" />
      </SelectTrigger>
      <SelectContent>
        {options.map((device) => (
          <SelectItem key={device.id} value={device.id}>
            {device.name}{device.isDefault ? ' · Default' : ''}
          </SelectItem>
        ))}
        {onManage ? (
          <button
            type="button"
            className="audio-device-picker__manage"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
          >
            <ListFilter aria-hidden="true" />
            Manage devices
          </button>
        ) : null}
      </SelectContent>
    </Select>
  );
}
