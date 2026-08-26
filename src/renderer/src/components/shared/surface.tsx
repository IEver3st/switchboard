import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-card text-card-foreground', className)}
      {...props}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-start justify-between gap-6">
      <div>
        {eyebrow ? <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">{eyebrow}</div> : null}
        <h2 className="m-0 text-base font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatusDot({ active, warning = false }: { active: boolean; warning?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block size-[7px] rounded-full',
        warning ? 'bg-warning' : active ? 'bg-success' : 'bg-[#4e5560]',
      )}
    />
  );
}

export function KeyValue({ label, value, muted = false }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-5 py-2 text-xs">
      <span className="text-muted-foreground/80">{label}</span>
      <span className={cn('font-medium tabular-nums', muted ? 'text-muted-foreground' : 'text-foreground')}>{value}</span>
    </div>
  );
}
