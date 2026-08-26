import { Circle } from 'lucide-react';
import type { AudioSupportLevel } from '../../../../../shared/contracts';
import { Button } from '@/components/ui/button';

export function MicrophoneTest({ support, onRecord }: { support: AudioSupportLevel; onRecord?: () => void }) {
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
        disabled={!recordable}
        aria-describedby="microphone-test-status"
        onClick={onRecord}
      >
        <Circle className="size-3.5 fill-current" /> Test microphone
      </Button>
      <p id="microphone-test-status">
        {recordable ? 'Record a short sample and hear your current processing.' : unavailableMessage}
      </p>
    </div>
  );
}
