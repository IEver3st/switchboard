import { Settings } from 'lucide-react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { AppUpdateIndicator, appUpdatePhase } from '@/components/shared/app-update-indicator';
import { Button } from '@/components/ui/button';

export function TitleStrip({ snapshot, captureOnly = false, onOpenSettings, onOpenUpdateSettings }: {
  snapshot: SystemSnapshot;
  captureOnly?: boolean;
  onOpenSettings?: () => void;
  onOpenUpdateSettings: () => void;
}) {
  const hasUpdate = appUpdatePhase(snapshot) !== null;
  return (
    <div
      className={`app-drag app-toolbar flex h-[38px] shrink-0 items-center bg-chrome px-4${captureOnly ? ' capture-title-strip' : ''}`}
      aria-hidden={captureOnly || hasUpdate ? undefined : true}
    >
      {captureOnly ? (
        <>
          <img src="./switchboard-mark.png" alt="" draggable={false} className="size-6 shrink-0 object-contain" />
          <span className="ml-2 text-[11px] font-semibold text-secondary-foreground">Switchboard</span>
        </>
      ) : null}
      <div className="title-strip__actions ml-auto flex items-center gap-1">
        <AppUpdateIndicator snapshot={snapshot} onOpenUpdateSettings={onOpenUpdateSettings} />
        {captureOnly ? (
          <Button type="button" variant="ghost" size="icon" className="capture-title-strip__settings no-drag" aria-label="Settings" title="Settings" onClick={onOpenSettings}>
            <Settings aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
