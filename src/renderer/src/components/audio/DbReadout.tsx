import { cn } from '@/lib/cn';

export function formatDb(db: number): string {
  if (db <= -59.5) return '−∞ dB';
  const rounded = Math.round(db * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(Number.isInteger(rounded) ? 0 : 1)} dB`;
}

export function DbReadout({ db, className }: { db: number; className?: string }) {
  return (
    <output className={cn('text-[10px] font-semibold tabular-nums text-foreground', className)}>
      {formatDb(db)}
    </output>
  );
}
