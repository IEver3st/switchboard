import type { AudioDevice, AudioDeviceDirection } from '../../../../shared/contracts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';

export function AudioDevicePicker({
  value,
  devices,
  direction,
  label,
  disabled,
  className,
  onChange,
}: {
  value: string;
  devices: AudioDevice[];
  direction: AudioDeviceDirection;
  label: string;
  disabled?: boolean;
  className?: string;
  onChange: (deviceId: string) => void;
}) {
  const options = devices.filter((device) => device.direction === direction && device.available);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || options.length === 0}>
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
      </SelectContent>
    </Select>
  );
}
