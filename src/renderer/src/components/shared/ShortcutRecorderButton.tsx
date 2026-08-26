import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { displayShortcut, shortcutFromKeyboardEvent } from '@/lib/shortcut';

export function ShortcutRecorderButton({
  value,
  disabled,
  label = 'Keyboard shortcut',
  className,
  onValueChange,
}: {
  value: string;
  disabled?: boolean;
  label?: string;
  className?: string;
  onValueChange: (value: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording || disabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(false);
        return;
      }
      const shortcut = shortcutFromKeyboardEvent(event);
      if (!shortcut) return;
      onValueChange(shortcut);
      setRecording(false);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [disabled, onValueChange, recording]);

  useEffect(() => {
    if (disabled) setRecording(false);
  }, [disabled]);

  return (
    <Button
      type="button"
      variant={recording ? 'primary' : 'secondary'}
      size="sm"
      disabled={disabled}
      aria-label={recording ? `${label}: press the new key combination` : `${label}: ${displayShortcut(value)}. Press to change`}
      aria-pressed={recording}
      onClick={() => setRecording((active) => !active)}
      className={cn('w-full justify-start tabular-nums', className)}
    >
      <Keyboard className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{recording ? 'Press keys…' : displayShortcut(value)}</span>
    </Button>
  );
}
