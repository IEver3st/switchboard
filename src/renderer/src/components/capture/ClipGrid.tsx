import type { Clip } from '../../../../shared/contracts';
import { formatClipDateGroup } from '@/lib/format';
import { ClipCard } from './ClipCard';
import type { ClipActions } from './types';

export function ClipGrid({ clips, actions, grouped, selectionMode, selectedClipIds, onToggleSelection }: {
  clips: Clip[];
  actions: ClipActions;
  grouped: boolean;
  selectionMode: boolean;
  selectedClipIds: string[];
  onToggleSelection: (clip: Clip) => void;
}) {
  const card = (clip: Clip) => (
    <ClipCard
      key={clip.id}
      clip={clip}
      actions={actions}
      selectionMode={selectionMode}
      selectedOrder={selectedClipIds.includes(clip.id) ? selectedClipIds.indexOf(clip.id) + 1 : null}
      onToggleSelection={onToggleSelection}
    />
  );
  if (!grouped) {
    return <ul className="capture-clip-grid m-0 list-none p-0">{clips.map(card)}</ul>;
  }
  return (
    <div className="capture-clip-groups">
      {groupClips(clips).map((group) => (
        <section key={group.label} aria-labelledby={`clip-group-${group.key}`}>
          <div className="capture-clip-group__header flex items-baseline gap-2">
            <h3 id={`clip-group-${group.key}`} className="m-0 text-[12px] font-semibold tracking-[-0.01em] text-text-secondary">{group.label}</h3>
            <span className="text-[10px] tabular-nums text-text-muted">{group.clips.length}</span>
          </div>
          <ul className="capture-clip-grid m-0 list-none p-0">{group.clips.map(card)}</ul>
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
