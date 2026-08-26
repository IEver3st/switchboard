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

export function DeviceGlyph({ kind, active = false, large = false }: { kind: DeviceKind; active?: boolean; large?: boolean }) {
  const Icon = icons[kind];
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-[8px] border border-[var(--border)] bg-[#15181d] text-[#8f98a5]',
        active && 'border-[#593242] bg-[#21161a] text-[var(--accent)]',
        large ? 'size-24' : 'size-9',
      )}
    >
      <Icon strokeWidth={1.6} className={large ? 'size-11' : 'size-[17px]'} />
    </div>
  );
}
