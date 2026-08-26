import { Power } from 'lucide-react';
import type { MicProcessor } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

export function ProcessorNode({
  processor,
  selected,
  pending,
  onSelect,
  onToggle,
}: {
  processor: MicProcessor;
  selected: boolean;
  pending: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'relative grid h-12 min-w-[88px] flex-1 grid-cols-[minmax(0,1fr)_26px] items-stretch border border-border bg-card',
        selected && 'border-input bg-accent',
        !processor.enabled && 'bg-background',
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-[2px] bg-transparent', selected && 'bg-primary')} aria-hidden="true" />
      <button
        type="button"
        className="min-w-0 px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className="block truncate text-[9px] font-semibold text-foreground">{processor.label}</span>
        <span className={cn('mt-0.5 block text-[8px] text-muted-foreground', !processor.enabled && 'text-muted-foreground/55')}>
          {processor.enabled ? 'Active' : 'Bypassed'}
        </span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-full w-[26px] rounded-none border-l border-border text-muted-foreground', processor.enabled && 'text-primary')}
            disabled={pending}
            aria-label={`${processor.enabled ? 'Bypass' : 'Enable'} ${processor.label}`}
            aria-pressed={processor.enabled}
            onClick={onToggle}
          >
            <Power className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{processor.enabled ? 'Bypass processor' : 'Enable processor'}</TooltipContent>
      </Tooltip>
    </div>
  );
}
