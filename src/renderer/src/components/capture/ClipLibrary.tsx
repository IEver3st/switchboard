import { Search, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ClipGrid } from './ClipGrid';
import { ClipList } from './ClipList';
import type { ClipLibraryControls } from './clip-library-model';
import type { ClipActions } from './types';

export function ClipLibrary({ actions, replayEnabled, hotkey, captureUnavailableReason, controls }: {
  actions: ClipActions;
  replayEnabled: boolean;
  hotkey: string;
  captureUnavailableReason?: string | null;
  controls: ClipLibraryControls;
}) {
  const { clips, layout, montageSelectionMode, selectedClipIds } = controls;

  return (
    <section aria-labelledby="clips-heading" className="capture-library min-h-0 flex-1">
      <div className="capture-library__content">
        {clips.length > 0 ? (
          layout === 'grid' ? (
            <ClipGrid clips={clips} actions={actions} grouped selectionMode={montageSelectionMode} selectedClipIds={selectedClipIds} onToggleSelection={controls.onToggleClipSelection} />
          ) : (
            <ClipList clips={clips} actions={actions} selectionMode={montageSelectionMode} selectedClipIds={selectedClipIds} onToggleSelection={controls.onToggleClipSelection} />
          )
        ) : controls.totalClipCount === 0 ? (
          <EmptyLibrary replayEnabled={replayEnabled} hotkey={hotkey} captureUnavailableReason={captureUnavailableReason} />
        ) : (
          <Empty>
            <EmptyHeader><EmptyMedia><Search strokeWidth={1.5} /></EmptyMedia><EmptyTitle>No clips match these filters</EmptyTitle><EmptyDescription>Clear the current search and filters to show your library.</EmptyDescription></EmptyHeader>
            <EmptyContent><Button type="button" variant="secondary" size="sm" onClick={controls.onClearFilters}>Clear filters</Button></EmptyContent>
          </Empty>
        )}
      </div>
    </section>
  );
}

function EmptyLibrary({ replayEnabled, hotkey, captureUnavailableReason }: { replayEnabled: boolean; hotkey: string; captureUnavailableReason?: string | null }) {
  if (captureUnavailableReason) {
    return <Empty><EmptyHeader><EmptyMedia><Video strokeWidth={1.5} /></EmptyMedia><EmptyTitle>Capture unavailable</EmptyTitle><EmptyDescription>{captureUnavailableReason}</EmptyDescription></EmptyHeader></Empty>;
  }
  return (
    <Empty className="min-h-72">
      <EmptyHeader>
        <EmptyMedia><Video strokeWidth={1.5} /></EmptyMedia>
        <EmptyTitle>No clips yet</EmptyTitle>
        <EmptyDescription>
          {replayEnabled ? <>Press {hotkey} when something worth saving happens.</> : <>Turn on Instant Replay in Capture Settings.<br />Then press {hotkey} when something worth saving happens.</>}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
