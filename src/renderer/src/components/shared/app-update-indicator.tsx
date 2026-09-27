import './app-update-indicator.css';
import { useState } from 'react';
import { ArrowDownToLine, LoaderCircle, RotateCw } from 'lucide-react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { useSystemStore } from '@/stores/use-system-store';

type UpdateSnapshot = Pick<SystemSnapshot, 'appUpdate' | 'settings' | 'prototypeMode' | 'capture'>;

/**
 * Persistent, quiet notice that a Switchboard release is on its way or ready.
 * Renders nothing unless the canonical update state has something the user can act on.
 */
export function AppUpdateIndicator({
  snapshot,
  onOpenUpdateSettings,
  className,
}: {
  snapshot: UpdateSnapshot;
  onOpenUpdateSettings: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const installAppUpdate = useSystemStore((state) => state.installAppUpdate);
  const downloadAppUpdate = useSystemStore((state) => state.downloadAppUpdate);
  const update = snapshot.appUpdate;
  const phase = appUpdatePhase(snapshot);
  if (!phase) return null;

  const version = update.availableVersion ? `Switchboard ${update.availableVersion}` : 'A Switchboard update';
  const progress = Math.round(update.downloadProgress ?? 0);
  const label = phase === 'ready'
    ? 'Update ready'
    : phase === 'downloading'
      ? `Updating ${progress}%`
      : phase === 'installing'
        ? 'Restarting…'
        : 'Update available';
  const title = phase === 'ready'
    ? `${version} is ready`
    : phase === 'downloading'
      ? `Downloading ${update.availableVersion ? version : 'the update'}`
      : phase === 'installing'
        ? 'Installing the update'
        : `${version} is available`;
  const detail = phase === 'ready'
    ? snapshot.settings.installAppUpdatesOnNextStartup
      ? 'It installs automatically the next time Switchboard closes. Restart now to finish sooner.'
      : 'Restart Switchboard to finish updating.'
    : phase === 'downloading'
      ? 'The download continues in the background. You can keep working.'
      : phase === 'installing'
        ? 'Switchboard will reopen on the new version.'
        : 'Download it now, or turn on automatic downloads in Updates.';
  const replayNote = phase === 'ready' && snapshot.capture.config.enabled
    ? 'Instant Replay stops during the restart and resumes when Switchboard reopens.'
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('app-update-indicator no-drag', className)}
          data-app-update-indicator={phase}
          aria-label={`${title}. Show update options.`}
        >
          <span className="app-update-indicator__icon" aria-hidden>
            {phase === 'installing' || phase === 'downloading'
              ? <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              : <ArrowDownToLine />}
          </span>
          <span className="app-update-indicator__label">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="app-update-popover no-drag" data-app-update-popover>
        <div className="app-update-popover__copy">
          <strong>{title}</strong>
          <p role="status" aria-live="polite">{detail}</p>
          {replayNote ? <p className="app-update-popover__note">{replayNote}</p> : null}
        </div>
        {phase === 'downloading' ? (
          <div className="app-update-popover__progress" role="progressbar" aria-label="Update download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}
        <div className="app-update-popover__actions">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              onOpenUpdateSettings();
            }}
          >
            Update settings
          </Button>
          {phase === 'ready' ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Later</Button>
              <Button type="button" variant="primary" size="sm" data-app-update-restart onClick={() => void installAppUpdate()}>
                <RotateCw aria-hidden />
                Restart now
              </Button>
            </>
          ) : null}
          {phase === 'available' ? (
            <Button type="button" variant="primary" size="sm" onClick={() => void downloadAppUpdate()}>
              <ArrowDownToLine aria-hidden />
              Download
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type AppUpdatePhase = 'available' | 'downloading' | 'ready' | 'installing';

export function appUpdatePhase(snapshot: UpdateSnapshot): AppUpdatePhase | null {
  const update = snapshot.appUpdate;
  if (update.capability !== 'available') return null;
  if (update.status === 'downloaded') return 'ready';
  if (update.status === 'installing') return 'installing';
  if (update.status === 'downloading') return 'downloading';
  if (update.status === 'available') {
    // Automatic downloads begin on their own; show progress rather than asking for an action.
    return snapshot.settings.automaticAppUpdateDownloads && !snapshot.prototypeMode ? 'downloading' : 'available';
  }
  return null;
}
