import type { AudioDevice, SystemSnapshot } from '../../../../shared/contracts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';

export function captureOutputDevices(snapshot: SystemSnapshot): AudioDevice[] {
  return snapshot.audio.devices.filter(
    (device) => device.direction === 'output' && device.available && !device.isSwitchboard,
  );
}

export function captureInputDevices(snapshot: SystemSnapshot): AudioDevice[] {
  return snapshot.audio.devices.filter(
    (device) => device.direction === 'input' && device.available && !device.isSwitchboard,
  );
}

export function gameAutomaticLabel(snapshot: SystemSnapshot): string {
  return snapshot.audio.host?.running
    ? 'Automatic (Switchboard clip mix)'
    : 'Automatic (default system audio)';
}

export function chatAutomaticLabel(): string {
  return 'Automatic (default system audio)';
}

export function micAutomaticLabel(snapshot: SystemSnapshot): string {
  return snapshot.audio.microphoneDevice
    ? `Automatic (${snapshot.audio.microphoneDevice})`
    : 'Automatic (follow Audio settings)';
}

export function captureAudioDeviceName(
  snapshot: SystemSnapshot,
  deviceId: string | null,
  automaticLabel: string,
): string {
  if (!deviceId) return automaticLabel;
  const device = snapshot.audio.devices.find((candidate) => candidate.id === deviceId);
  return device ? device.name : 'Unavailable device';
}

export function CaptureAudioDeviceSelect({
  label,
  value,
  devices,
  automaticLabel,
  disabled,
  onChange,
  className,
  triggerId,
}: {
  label: string;
  value: string | null;
  devices: AudioDevice[];
  automaticLabel: string;
  disabled: boolean;
  onChange: (deviceId: string | null) => void;
  className?: string;
  triggerId?: string;
}) {
  const selectedValue = value && devices.some((device) => device.id === value) ? value : 'auto';
  return (
    <Select
      value={selectedValue}
      disabled={disabled || (devices.length === 0 && selectedValue === 'auto')}
      onValueChange={(next) => onChange(next === 'auto' ? null : next)}
    >
      <SelectTrigger id={triggerId} aria-label={label} className={cn('h-8 w-full min-w-0 text-[11px]', className)}>
        <SelectValue placeholder={devices.length === 0 ? 'No available device' : automaticLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">{automaticLabel}</SelectItem>
        {devices.map((device) => (
          <SelectItem key={device.id} value={device.id}>
            {device.name}{device.isDefault ? ' · Default' : ''}{device.isVirtual ? ' · Virtual' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
