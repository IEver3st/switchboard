import type { Clip } from '../../../../shared/contracts';
import { formatClipDateGroup } from '@/lib/format';
import { ClipCard } from './ClipCard';
import type { ClipActions } from './types';

export function ClipGrid({ clips, actions, grouped }: { clips: Clip[]; actions: ClipActions; grouped: boolean }) {
  if (!grouped) {
    return <ul className="capture-clip-grid m-0 list-none p-0">{clips.map((clip) => <ClipCard key={clip.id} clip={clip} actions={actions} />)}</ul>;
  }
  return (
    <div className="grid gap-6">
      {groupClips(clips).map((group) => (
        <section key={group.label} aria-labelledby={`clip-group-${group.key}`}>
          <h3 id={`clip-group-${group.key}`} className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.label}</h3>
          <ul className="capture-clip-grid m-0 list-none p-0">{group.clips.map((clip) => <ClipCard key={clip.id} clip={clip} actions={actions} />)}</ul>
        </section>
      ))}
    </div>
  );
}

export function groupClips(clips: Clip[]): Array<{ key: string; label: string; clips: Clip[] }> {
  const groups = new Map<string, { key: string; label: string; clips: Clip[] }>();
  for (const clip of clips) {
    const date = new Date(clip.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const existing = groups.get(key);
    if (existing) existing.clips.push(clip);
    else groups.set(key, { key: key.replace(/[^a-z0-9-]/gi, ''), label: formatClipDateGroup(clip.createdAt), clips: [clip] });
  }
  return [...groups.values()];
}
