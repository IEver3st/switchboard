import { Circle } from 'lucide-react';
import type { AudioSupportLevel } from '../../../../../shared/contracts';
import { Button } from '@/components/ui/button';

export function MicrophoneTest({ support, pending = false, compact = false, onRecord }: { support: AudioSupportLevel; pending?: boolean; compact?: boolean; onRecord?: () => void }) {
  const recordable = support === 'available' && Boolean(onRecord);
  const unavailableMessage = support === 'unavailable'
    ? 'Microphone testing is not available with the current audio setup.'
    : 'Recording is not available with the current audio setup.';

  return (
    <div className="microphone-test">
      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={!recordable || pending}
        aria-describedby="microphone-test-status"
        onClick={onRecord}
      >
        <Circle className="size-3.5 fill-current" /> Test microphone
      </Button>
      <p id="microphone-test-status" className={compact ? 'sr-only' : undefined}>
        {pending ? 'Recording and playing your processed microphone sample…' : recordable ? 'Record a short sample and hear your current processing.' : unavailableMessage}
      </p>
    </div>
  );
}
