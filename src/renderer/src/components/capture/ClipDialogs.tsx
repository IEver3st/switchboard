import { useState } from 'react';
import type { Clip } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DeleteClipDialog({ clip, pending, onCancel, onConfirm }: { clip: Clip; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6" role="dialog" aria-modal="true" aria-labelledby="delete-clip-title">
      <div className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl">
        <h3 id="delete-clip-title" className="m-0 text-[14px] font-semibold">Delete clip?</h3>
        <p className="m-0 mt-2 text-[12px] leading-5 text-muted-foreground"><strong className="font-medium text-foreground">{clip.name}</strong> will be moved to the Recycle Bin.</p>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="button" variant="danger" size="sm" disabled={pending} onClick={onConfirm}>{pending ? 'Deleting…' : 'Delete clip'}</Button></div>
      </div>
    </div>
  );
}

export function RenameClipDialog({ clip, pending, onCancel, onConfirm }: { clip: Clip; pending: boolean; onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(clip.name);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6" role="dialog" aria-modal="true" aria-labelledby="rename-clip-title">
      <form className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 shadow-xl" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onConfirm(name.trim()); }}>
        <h3 id="rename-clip-title" className="m-0 text-[14px] font-semibold">Rename clip</h3>
        <label className="mt-3 block text-[11px] font-medium text-muted-foreground">Name<Input autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-9 text-[12px]" /></label>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" size="sm" disabled={pending || !name.trim()}>{pending ? 'Renaming…' : 'Rename'}</Button></div>
      </form>
    </div>
  );
}
