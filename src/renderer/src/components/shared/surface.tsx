import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[10px] border border-[var(--border)] bg-[var(--surface-1)]', className)}
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
        {eyebrow ? <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-2)]">{eyebrow}</div> : null}
        <h2 className="m-0 text-[18px] font-semibold tracking-[-0.02em] text-[#f3f4f6]">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--muted)]">{description}</p> : null}
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
        warning ? 'bg-[var(--warning)]' : active ? 'bg-[var(--success)]' : 'bg-[#4e5560]',
      )}
    />
  );
}

export function KeyValue({ label, value, muted = false }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-5 py-2 text-[12px]">
      <span className="text-[var(--muted-2)]">{label}</span>
      <span className={cn('font-medium tabular-nums', muted ? 'text-[var(--muted)]' : 'text-[#e6e8eb]')}>{value}</span>
    </div>
  );
}
