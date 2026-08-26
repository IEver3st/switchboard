import { Circle, Play } from 'lucide-react';
import type { AudioSupportLevel } from '../../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function MicrophoneTest({ support, onRecord }: { support: AudioSupportLevel; onRecord?: () => void }) {
  const recordable = support === 'available' && Boolean(onRecord);
  const unavailableMessage = support === 'unavailable'
    ? 'Processed testing needs the native Audio.Host microphone stream.'
    : 'Processed recording is not connected in this build.';

  return (
    <div className="grid justify-items-end gap-1 max-[900px]:justify-items-start">
      <div className="flex items-center justify-end gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" tabIndex={recordable ? -1 : 0} aria-describedby={recordable ? undefined : 'microphone-test-status'}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 px-3 text-[10px]"
                disabled={!recordable}
                aria-label="Record a processed microphone test"
                onClick={onRecord}
              >
                <Circle className="size-3 fill-current" /> Test microphone
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{recordable ? 'Record a bounded processed sample' : unavailableMessage}</TooltipContent>
        </Tooltip>
        <Button type="button" variant="ghost" size="icon" className="size-8" disabled aria-label="Play microphone test recording">
          <Play className="size-3.5" />
        </Button>
      </div>
      {!recordable ? (
        <p id="microphone-test-status" className="m-0 max-w-64 text-right text-[8px] leading-3 text-muted-foreground max-[900px]:text-left">
          {unavailableMessage}
        </p>
      ) : null}
    </div>
  );
}
