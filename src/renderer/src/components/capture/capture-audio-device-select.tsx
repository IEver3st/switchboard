import type { AudioDevice, SystemSnapshot } from '../../../../shared/contracts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';

export function captureOutputDevices(snapshot: SystemSnapshot): AudioDevice[] {
  return snapshot.capture.audioDevices.filter((device) => device.direction === 'output');
}

export function captureInputDevices(snapshot: SystemSnapshot): AudioDevice[] {
  return snapshot.capture.audioDevices.filter((device) => device.direction === 'input');
}

function defaultDeviceName(snapshot: SystemSnapshot, direction: AudioDevice['direction']): string | null {
  return snapshot.capture.audioDevices.find((device) => device.direction === direction && device.isDefault)?.name ?? null;
}

export function gameAutomaticLabel(snapshot: SystemSnapshot): string {
  if (snapshot.capture.config.systemAudioMode === 'game') return 'Selected game process';
  const name = defaultDeviceName(snapshot, 'output');
  return name ? `Automatic (${name})` : 'Automatic (default output)';
}

export function chatAutomaticLabel(_snapshot: SystemSnapshot): string {
  return 'Automatic (communications output)';
}

export function micAutomaticLabel(snapshot: SystemSnapshot): string {
  const name = defaultDeviceName(snapshot, 'input');
  return name ? `Automatic (${name})` : 'Automatic (default microphone)';
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
  const selectedValue = value ?? 'auto';
  const unavailable = Boolean(value) && !devices.some((device) => device.id === value);
  return (
    <Select
      value={selectedValue}
      disabled={disabled}
      onValueChange={(next) => onChange(next === 'auto' ? null : next)}
    >
      <SelectTrigger id={triggerId} aria-label={label}
        title={value ? devices.find(device => device.id === value)?.name ?? 'Unavailable device' : automaticLabel}
        className={cn('h-8 w-full min-w-0 text-[11px]', className)}>
        <SelectValue placeholder={devices.length === 0 ? 'No available device' : automaticLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">{automaticLabel}</SelectItem>
        {unavailable && value ? <SelectItem value={value} disabled>Unavailable device</SelectItem> : null}
        {devices.map((device) => (
          <SelectItem key={device.id} value={device.id}>
            {device.name}{device.isDefault ? ' · Default' : ''}{device.isVirtual ? ' · Virtual' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
