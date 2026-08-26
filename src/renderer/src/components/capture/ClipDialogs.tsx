import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import type { Clip } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DeleteClipDialog({ clip, pending, onCancel, onConfirm }: { clip: Clip; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const handleKeyDown = useModalKeyboard(dialogRef, cancelRef, pending, onCancel);
  return (
    <div ref={dialogRef} className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6" role="alertdialog" aria-modal="true" aria-labelledby="delete-clip-title" aria-describedby="delete-clip-description" onKeyDown={handleKeyDown}>
      <div className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl">
        <h3 id="delete-clip-title" className="m-0 text-[14px] font-semibold">Delete clip?</h3>
        <p id="delete-clip-description" className="m-0 mt-2 text-[12px] leading-5 text-muted-foreground"><strong className="font-medium text-foreground">{clip.name}</strong> will be moved to the Recycle Bin.</p>
        <div className="mt-4 flex justify-end gap-2"><Button ref={cancelRef} type="button" variant="secondary" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="button" variant="danger" size="sm" disabled={pending} onClick={onConfirm}>{pending ? 'Deleting…' : 'Delete clip'}</Button></div>
      </div>
    </div>
  );
}

export function RenameClipDialog({ clip, pending, onCancel, onConfirm }: { clip: Clip; pending: boolean; onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(clip.name);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleKeyDown = useModalKeyboard(dialogRef, inputRef, pending, onCancel);
  return (
    <div ref={dialogRef} className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6" role="dialog" aria-modal="true" aria-labelledby="rename-clip-title" onKeyDown={handleKeyDown}>
      <form className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onConfirm(name.trim()); }}>
        <h3 id="rename-clip-title" className="m-0 text-[14px] font-semibold">Rename clip</h3>
        <label className="mt-3 block text-[11px] font-medium text-muted-foreground">Name<Input ref={inputRef} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-9 text-[12px]" /></label>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" size="sm" disabled={pending || !name.trim()}>{pending ? 'Renaming…' : 'Rename'}</Button></div>
      </form>
    </div>
  );
}

function useModalKeyboard(
  dialogRef: RefObject<HTMLDivElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  pending: boolean,
  onCancel: () => void,
) {
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus();
    return () => previousFocus?.focus();
  }, [initialFocusRef]);

  return (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!pending) onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = focusableElements(dialogRef.current);
    if (controls.length === 0) {
      event.preventDefault();
      return;
    }
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? (current <= 0 ? controls.length - 1 : current - 1)
      : (current === controls.length - 1 ? 0 : current + 1);
    event.preventDefault();
    controls[next]?.focus();
  };
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}
