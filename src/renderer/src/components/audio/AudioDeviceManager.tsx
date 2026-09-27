import { useState, type DragEvent } from 'react';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import type { AudioDevice, AudioDeviceDirection } from '../../../../shared/contracts';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/cn';

const DRAG_TYPE = 'application/x-switchboard-audio-device';

/**
 * Hide Windows endpoints from Switchboard's pickers. Exclusion is a picker
 * preference only: Windows, other apps, and a channel already using the
 * device are unaffected.
 */
export function AudioDeviceManager({
  open,
  onOpenChange,
  initialDirection = 'output',
  devices,
  excludedIds,
  inUseIds,
  pending,
  onExcludedChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDirection?: AudioDeviceDirection;
  devices: AudioDevice[];
  excludedIds: readonly string[];
  inUseIds: readonly string[];
  pending: boolean;
  onExcludedChange: (deviceId: string, excluded: boolean) => void;
}) {
  const [direction, setDirection] = useState<AudioDeviceDirection>(initialDirection);
  const [openedWith, setOpenedWith] = useState(initialDirection);
  if (open && openedWith !== initialDirection) {
    setOpenedWith(initialDirection);
    setDirection(initialDirection);
  }

  const candidates = devices
    .filter((device) => device.direction === direction && !device.isSwitchboard)
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name));
  const included = candidates.filter((device) => device.available && !excludedIds.includes(device.id));
  const excluded = candidates.filter((device) => excludedIds.includes(device.id));
  const noun = direction === 'output' ? 'output' : 'input';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="audio-devices max-w-md p-0">
        <DialogHeader className="audio-devices__header">
          <DialogTitle>Audio devices</DialogTitle>
          <DialogDescription>Excluded devices stay out of Switchboard's device lists. Windows is not changed.</DialogDescription>
        </DialogHeader>
        <ToggleGroup
          type="single"
          value={direction}
          onValueChange={(value) => value && setDirection(value as AudioDeviceDirection)}
          className="audio-devices__direction"
          aria-label="Device type"
        >
          <ToggleGroupItem value="output">Outputs</ToggleGroupItem>
          <ToggleGroupItem value="input">Inputs</ToggleGroupItem>
        </ToggleGroup>
        <div className="audio-devices__lists" aria-busy={pending || undefined}>
          <DeviceGroup
            title={`All ${noun} devices`}
            empty={`No ${noun} devices are available.`}
            devices={included}
            excluded={false}
            inUseIds={inUseIds}
            pending={pending}
            onExcludedChange={onExcludedChange}
          />
          <DeviceGroup
            title="Excluded devices"
            empty="Drag a device here to hide it."
            devices={excluded}
            excluded
            inUseIds={inUseIds}
            pending={pending}
            onExcludedChange={onExcludedChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeviceGroup({
  title,
  empty,
  devices,
  excluded,
  inUseIds,
  pending,
  onExcludedChange,
}: {
  title: string;
  empty: string;
  devices: AudioDevice[];
  excluded: boolean;
  inUseIds: readonly string[];
  pending: boolean;
  onExcludedChange: (deviceId: string, excluded: boolean) => void;
}) {
  const [dropping, setDropping] = useState(false);

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (pending || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!dropping) setDropping(true);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    setDropping(false);
    const deviceId = event.dataTransfer.getData(DRAG_TYPE);
    if (!deviceId || pending || devices.some((device) => device.id === deviceId)) return;
    event.preventDefault();
    onExcludedChange(deviceId, excluded);
  };

  return (
    <section
      className={cn('audio-devices__group', dropping && 'is-dropping')}
      aria-label={title}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={onDrop}
    >
      <h3 className="audio-devices__title">{title}</h3>
      {devices.length === 0 ? <p className="audio-devices__empty">{empty}</p> : (
        <ul className="audio-devices__list">
          {devices.map((device) => {
            const inUse = inUseIds.includes(device.id);
            return (
              <li
                key={device.id}
                className={cn('audio-devices__row', excluded && 'is-excluded')}
                draggable={!pending}
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_TYPE, device.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
              >
                <GripVertical className="audio-devices__grip" aria-hidden="true" />
                <span className="audio-devices__name" title={device.name}>{device.name}</span>
                {device.isDefault ? <span className="audio-devices__tag">Default</span> : null}
                {inUse ? <span className="audio-devices__tag">In use</span> : null}
                {!device.available ? <span className="audio-devices__tag">Disconnected</span> : null}
                <button
                  type="button"
                  className="audio-devices__toggle"
                  disabled={pending}
                  aria-label={`${excluded ? 'Include' : 'Exclude'} ${device.name}`}
                  title={excluded ? 'Include' : 'Exclude'}
                  onClick={() => onExcludedChange(device.id, !excluded)}
                >
                  {excluded ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
