import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { switchboardApi } from '@/lib/demo-api';
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
  const onChange = useRef(onValueChange);
  onChange.current = onValueChange;
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording || disabled) return;
    let active = true;
    let ready = false;
    let finishing = false;
    void switchboardApi.setShortcutRecording(true).then(() => { ready = active; }).catch(error => {
      if (active) { setError(String(error)); setRecording(false); }
    });
    const finish = async (shortcut?: string) => {
      finishing = true;
      try {
        await switchboardApi.setShortcutRecording(false);
        if (!active) return;
        setRecording(false);
        if (shortcut) onChange.current(shortcut);
      } catch (error) { if (active) { setError(String(error)); setRecording(false); } }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!ready || finishing || event.repeat || event.isComposing) return;
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        void finish();
        return;
      }
      const shortcut = shortcutFromKeyboardEvent(event);
      if (!shortcut) return;
      void finish(shortcut);
    };
    const cancel = () => setRecording(false);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', cancel);
    return () => {
      active = false;
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', cancel);
      void switchboardApi.setShortcutRecording(false).catch(() => undefined);
    };
  }, [disabled, recording]);

  useEffect(() => {
    if (disabled) setRecording(false);
  }, [disabled]);

  return (
    <>
    <Button
      type="button"
      variant={recording ? 'primary' : 'secondary'}
      size="sm"
      disabled={disabled}
      aria-label={recording ? `${label}: press the new key combination` : `${label}: ${displayShortcut(value)}. Press to change`}
      aria-pressed={recording}
      onClick={() => { setError(null); setRecording((active) => !active); }}
      onBlur={() => setRecording(false)}
      className={cn('w-full justify-start tabular-nums', className)}
    >
      <Keyboard className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{recording ? 'Press keys…' : displayShortcut(value)}</span>
    </Button>
    {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
