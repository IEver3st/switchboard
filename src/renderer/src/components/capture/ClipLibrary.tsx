import { Search, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClipGrid } from './ClipGrid';
import { ClipList } from './ClipList';
import type { ClipLibraryControls } from './clip-library-model';
import type { ClipActions } from './types';

export function ClipLibrary({ actions, replayEnabled, hotkey, controls }: {
  actions: ClipActions;
  replayEnabled: boolean;
  hotkey: string;
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
          <EmptyLibrary replayEnabled={replayEnabled} hotkey={hotkey} />
        ) : (
          <div className="grid min-h-64 place-items-center border-y border-border py-12 text-center">
            <div>
              <Search className="mx-auto size-6 text-muted-foreground" strokeWidth={1.5} />
              <h3 className="m-0 mt-3 text-[14px] font-semibold text-foreground">No clips found</h3>
              <p className="m-0 mt-1 text-[12px] text-muted-foreground">Try another search or filter.</p>
              <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={controls.onClearFilters}>Clear filters</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyLibrary({ replayEnabled, hotkey }: { replayEnabled: boolean; hotkey: string }) {
  return (
    <div className="grid min-h-72 place-items-center border-y border-border py-12 text-center">
      <div className="max-w-sm">
        <Video className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="m-0 mt-3 text-[15px] font-semibold text-foreground">No clips yet</h3>
        <p className="m-0 mt-1.5 text-[12px] leading-5 text-muted-foreground">
          {replayEnabled ? <>Press {hotkey} when something worth saving happens.</> : <>Turn on Instant Replay in Capture Settings.<br />Then press {hotkey} when something worth saving happens.</>}
        </p>
      </div>
    </div>
  );
}
