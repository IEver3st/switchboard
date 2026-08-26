import { Keyboard, Mic2, Mouse, Radio, type LucideIcon } from 'lucide-react';
import type { DeviceKind } from '../../../../shared/contracts';
import { cn } from '@/lib/cn';

const icons: Record<DeviceKind, LucideIcon> = {
  mouse: Mouse,
  microphone: Mic2,
  keyboard: Keyboard,
  headset: Radio,
  unknown: Radio,
};

export function DeviceGlyph({
  kind,
  active = false,
  large = false,
  bare = false,
}: {
  kind: DeviceKind;
  active?: boolean;
  large?: boolean;
  bare?: boolean;
}) {
  const Icon = icons[kind];
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center text-muted-foreground',
        !bare && 'rounded-md border border-border bg-muted',
        active && (bare ? 'text-primary' : 'border-primary/40 bg-primary/10 text-primary'),
        large ? 'size-24' : 'size-9',
      )}
    >
      <Icon strokeWidth={1.6} className={large ? 'size-11' : 'size-[17px]'} />
    </div>
  );
}
