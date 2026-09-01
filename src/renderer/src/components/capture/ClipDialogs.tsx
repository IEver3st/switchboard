import { useState } from 'react';
import type { Clip } from '../../../../shared/contracts';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function DeleteClipDialog({ clip, pending, onCancel, onConfirm }: { clip: Clip; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete clip?</AlertDialogTitle>
          <AlertDialogDescription><strong className="font-medium text-foreground">{clip.name}</strong> and its media file will be moved to the Recycle Bin.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild><Button type="button" variant="secondary" size="sm" disabled={pending}>Cancel</Button></AlertDialogCancel>
          <AlertDialogAction asChild><Button type="button" variant="danger" size="sm" disabled={pending} onClick={onConfirm}>{pending ? 'Deleting…' : 'Delete clip'}</Button></AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RenameClipDialog({ clip, pending, onCancel, onConfirm }: { clip: Clip; pending: boolean; onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(clip.name);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <DialogContent className="max-w-sm p-4">
        <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onConfirm(name.trim()); }}>
          <DialogHeader>
            <DialogTitle>Rename clip</DialogTitle>
            <DialogDescription>Choose the name shown in your Clips library.</DialogDescription>
          </DialogHeader>
          <Field className="mt-4">
            <FieldLabel htmlFor="rename-clip-name">Name</FieldLabel>
            <Input id="rename-clip-name" autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className="h-9 text-[12px]" />
          </Field>
          <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary" size="sm" disabled={pending || !name.trim()}>{pending ? 'Renaming…' : 'Rename'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
