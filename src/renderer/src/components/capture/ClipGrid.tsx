import { memo, useMemo } from 'react';
import type { Clip } from '../../../../shared/contracts';
import { formatClipDateGroup } from '@/lib/format';
import { ClipCard } from './ClipCard';
import { ClipSavePlaceholder, type PendingClipSave } from './ClipSavePlaceholder';
import type { ClipActions } from './types';
import { useVirtualClipRows } from './use-virtual-clip-rows';

export const ClipGrid = memo(function ClipGrid({ clips, actions, grouped, selectionMode, selectedClipIds, onToggleSelection, retainedClipId, pendingSaveCount = 0 }: {
  pendingSaveCount?: number;
  retainedClipId?: string | null;
  clips: Clip[];
  actions: ClipActions;
  grouped: boolean;
  selectionMode: boolean;
  selectedClipIds: string[];
  onToggleSelection: (clip: Clip) => void;
}) {
  const groups = useMemo(() => groupClips(clips, pendingSaveCount, grouped), [clips, grouped, pendingSaveCount]);
  const virtual = useVirtualClipRows(groups, 'grid', retainedClipId);
  const selectionOrder = useMemo(() => new Map(selectedClipIds.map((id, index) => [id, index + 1])), [selectedClipIds]);
  const card = (clip: Clip, index: number, count: number) => (
    <ClipCard
      key={clip.id}
      clip={clip}
      style={virtual.itemStyle(index)}
      position={index + 1}
      total={count}
      actions={actions}
      selectionMode={selectionMode}
      selectedOrder={selectionOrder.get(clip.id) ?? null}
      onToggleSelection={onToggleSelection}
    />
  );
  return (
    <div className="capture-clip-groups" {...virtual.rootProps}>
      {groups.map((group, groupIndex) => (
        <section key={group.key} aria-labelledby={grouped ? `clip-group-${group.key}` : undefined}>
          {grouped ? <div className="capture-clip-group__header flex items-center gap-2.5">
            <h3 id={`clip-group-${group.key}`} className="m-0 text-[11px] font-semibold tracking-[-0.01em] text-text-secondary">{group.label}</h3>
            <span className="text-[9.5px] tabular-nums text-text-description">{group.clips.filter(clip => !('pendingSave' in clip)).length}</span>
          </div> : null}
          <ul className="capture-clip-grid capture-virtual-group m-0 list-none p-0" data-virtual-clip-group={group.key} style={virtual.listStyle(group.clips.length)}>
            {virtual.indexes(groupIndex).map(index => {
              const clip = group.clips[index];
              if (!clip) return null;
              return 'pendingSave' in clip
                ? <ClipSavePlaceholder key={clip.id} layout="grid" style={virtual.itemStyle(index)} position={index + 1} total={group.clips.length} />
                : card(clip, index, group.clips.length);
            })}
          </ul>
        </section>
      ))}
    </div>
  );
});

export function groupClips(clips: Clip[], pendingSaveCount = 0, grouped = true): Array<{ key: string; label: string; clips: Array<Clip | PendingClipSave> }> {
  const pending: PendingClipSave[] = Array.from({ length: pendingSaveCount }, (_, index) => ({ id: `pending-save-${index}`, pendingSave: true }));
  if (!grouped) return [{ key: 'all', label: 'All clips', clips: [...pending, ...clips] }];
  const groups = new Map<string, { key: string; label: string; clips: Array<Clip | PendingClipSave> }>();
  if (pending.length > 0) {
    const date = new Date();
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    groups.set(key, { key, label: formatClipDateGroup(date.getTime()), clips: pending });
  }
  for (const clip of clips) {
    const date = new Date(clip.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const existing = groups.get(key);
    if (existing) existing.clips.push(clip);
    else groups.set(key, { key: key.replace(/[^a-z0-9-]/gi, ''), label: formatClipDateGroup(clip.createdAt), clips: [clip] });
  }
  return [...groups.values()];
}
