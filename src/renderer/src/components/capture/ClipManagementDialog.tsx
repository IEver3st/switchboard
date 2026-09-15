import { useEffect, useState } from 'react';
import type { Clip, ClipOperationResult } from '../../../../shared/contracts';
import { montageV2Api } from '@/lib/montage-v2-api';
import { switchboardApi } from '@/lib/demo-api';
import { useSystemStore } from '@/stores/use-system-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatBytes } from '@/lib/format';

export function ClipManagementDialog({ clips, action, onClose, onComplete }: {
  clips: Clip[]; action: 'delete' | 'remove'; onClose: () => void; onComplete: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [references, setReferences] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<ClipOperationResult['failures']>([]);
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    let active = true;
    void montageV2Api.listMontageDrafts().then(drafts => {
      const ids = new Set(clips.map(clip => clip.id));
      if (active) setReferences(drafts.filter(draft => draft.segments.some(segment => ids.has(segment.clipId))).map(draft => draft.name));
    }).catch(cause => { if (active) setError(`Could not check project references: ${String(cause)}`); });
    return () => { active = false; };
  }, [clips]);
  const confirm = async () => {
    setPending(true); setError(null);
    try {
      const result = await switchboardApi.operateClips({ ids: (failures.length ? failures : clips).map(clip => clip.id), action });
      useSystemStore.setState({ snapshot: result.snapshot });
      setFailures(result.failures); setCompleted(true);
      if (!result.failures.length) { onComplete(); onClose(); }
    } catch (cause) { setError(String(cause)); }
    finally { setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent className="max-w-lg p-5">
      <DialogHeader><DialogTitle>{completed ? `${clips.length - failures.length} processed; ${failures.length} failed` : action === 'delete' ? 'Move clips to Recycle Bin?' : 'Remove unavailable clips from library?'}</DialogTitle>
        <DialogDescription>{completed ? `${failures.length} ${failures.length === 1 ? 'clip remains' : 'clips remain'}. Retry applies only to the failures below.` : <>{clips.length} {clips.length === 1 ? 'clip' : 'clips'} · {formatBytes(clips.reduce((sum, clip) => sum + clip.fileSize, 0))}. {action === 'delete' ? 'Media files go to the Windows Recycle Bin.' : 'Media files will not be changed. Library names and favorites will be removed.'}</>}</DialogDescription>
      </DialogHeader>
      {references === null && !error ? <p role="status">Checking project references…</p> : null}
      {!completed && references && references.length > 0 ? <p className="text-xs text-status-warning">Used by {references.length} saved {references.length === 1 ? 'project' : 'projects'}: {references.join(', ')}. These projects will need their source clips restored.</p> : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      {failures.length ? <div role="alert" className="max-h-48 overflow-auto text-xs"><p>{completed ? 'Other clips were processed. These could not be changed:' : ''}</p><ul>{failures.map(failure => <li key={failure.id}>{failure.name}: {failure.message}</li>)}</ul></div> : null}
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" disabled={pending} onClick={onClose}>{completed ? 'Close' : 'Cancel'}</Button><Button size="sm" variant="danger" disabled={pending || references === null} onClick={() => void confirm()}>{pending ? 'Working…' : failures.length ? 'Retry failed clips' : action === 'delete' ? 'Move to Recycle Bin' : 'Remove from library'}</Button></div>
    </DialogContent>
  </Dialog>;
}
