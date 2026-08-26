import { ChevronRight } from 'lucide-react';
import type { MicProcessor, MicProcessorId } from '../../../../shared/contracts';
import { ProcessorNode } from './ProcessorNode';

export function ProcessorChain({
  processors,
  selectedId,
  pendingId,
  onSelect,
  onToggle,
}: {
  processors: MicProcessor[];
  selectedId: MicProcessorId;
  pendingId: string | null;
  onSelect: (id: MicProcessorId) => void;
  onToggle: (processor: MicProcessor) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1" aria-label="Microphone processor chain">
      <span className="shrink-0 text-[8px] font-semibold text-muted-foreground">INPUT</span>
      <ChevronRight className="size-3 shrink-0 text-muted-foreground/45" aria-hidden="true" />
      {processors.map((processor, index) => (
        <div key={processor.id} className="contents">
          <ProcessorNode
            processor={processor}
            selected={processor.id === selectedId}
            pending={pendingId === `audio:processor:${processor.id}`}
            onSelect={() => onSelect(processor.id)}
            onToggle={() => onToggle(processor)}
          />
          {index < processors.length - 1 ? <ChevronRight className="size-3 shrink-0 text-muted-foreground/45" aria-hidden="true" /> : null}
        </div>
      ))}
      <ChevronRight className="size-3 shrink-0 text-muted-foreground/45" aria-hidden="true" />
      <span className="shrink-0 text-[8px] font-semibold text-muted-foreground">OUTPUT</span>
    </div>
  );
}
