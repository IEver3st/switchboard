import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TitleStrip({ captureOnly = false, onOpenSettings }: {
  captureOnly?: boolean;
  onOpenSettings?: () => void;
}) {
  return (
    <div className={`app-drag app-toolbar flex h-[38px] shrink-0 items-center bg-chrome px-4${captureOnly ? ' capture-title-strip' : ''}`} aria-hidden={captureOnly ? undefined : true}>
      {captureOnly ? (
        <>
          <img src="./switchboard-mark.png" alt="" draggable={false} className="size-6 shrink-0 object-contain" />
          <span className="ml-2 text-[11px] font-semibold text-secondary-foreground">Switchboard</span>
          <Button type="button" variant="ghost" size="icon" className="capture-title-strip__settings no-drag ml-auto" aria-label="Settings" title="Settings" onClick={onOpenSettings}>
            <Settings aria-hidden="true" className="size-4" />
          </Button>
        </>
      ) : null}
    </div>
  );
}
