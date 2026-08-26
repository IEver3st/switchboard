import { Circle, Play } from 'lucide-react';
import type { AudioSupportLevel } from '../../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function MicrophoneTest({ support }: { support: AudioSupportLevel }) {
  const unavailable = support === 'unavailable';
  return (
    <div className="flex items-center justify-end gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="secondary" size="sm" className="h-8 gap-1.5 px-3 text-[10px]" disabled={unavailable} aria-label="Record a processed microphone test">
            <Circle className="size-3 fill-current" /> Test microphone
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {unavailable ? 'Processed recording requires the native Audio.Host microphone stream' : 'Record a bounded processed sample'}
        </TooltipContent>
      </Tooltip>
      <Button type="button" variant="ghost" size="icon" className="size-8" disabled aria-label="Play microphone test recording">
        <Play className="size-3.5" />
      </Button>
    </div>
  );
}
