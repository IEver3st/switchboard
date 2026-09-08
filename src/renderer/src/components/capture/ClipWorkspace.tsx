import { useEffect, useState } from 'react';
import type { Clip, DefaultClipTrackLevels } from '../../../../shared/contracts';
import type { MontageProjectV2 } from '../../../../shared/montage-v2';
import { montageV2Api } from '@/lib/montage-v2-api';
import { Button } from '@/components/ui/button';
import { MontageComposer } from './MontageComposer';
import { createSingleClipDraft, reconcileMontageProject } from './montage-v2-model';

/** Single clips and montages share editing, history, rendering, and main-owned drafts. */
export function ClipWorkspace({ clip, clips, defaultTrackLevels, ...props }: {
  clip: Clip; clips: readonly Clip[]; inspectorOpen: boolean;
  defaultTrackLevels?: DefaultClipTrackLevels;
  onClose: () => void; onInspectorOpenChange: (open: boolean) => void;
  onReveal: (clip: Clip) => void; onDraftsChanged: () => void;
  onRename: () => void; onFavorite: (favorite: boolean) => void; onDelete: () => void;
}) {
  const [project, setProject] = useState<MontageProjectV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setProject(null); setError(null);
    void montageV2Api.listMontageDrafts().then(drafts => {
      if (!active) return;
      const saved = drafts.find(draft => draft.sourceClipId === clip.id);
      setProject(saved ? reconcileMontageProject(saved, clips) : createSingleClipDraft(clip, defaultTrackLevels));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [clip.id, retry]);
  if (!project) return <section className="montage-v2-shell grid place-content-center gap-3" role="dialog" aria-label="Clip editor">
    <p role={error ? 'alert' : 'status'}>{error ? `Could not recover this clip's edits: ${error}` : 'Opening clip editor…'}</p>
    {error ? <Button onClick={() => setRetry(value => value + 1)}>Retry</Button> : null}
    <Button variant="ghost" onClick={props.onClose}>Back to clips</Button>
  </section>;
  return <MontageComposer key={project.id} initialProject={project} clips={clips} {...props} sourceClipActions={{ clip, onRename: props.onRename, onFavorite: props.onFavorite, onDelete: props.onDelete }} />;
}
