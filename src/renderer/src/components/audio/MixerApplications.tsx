import { memo, useState, type CSSProperties, type DragEvent } from 'react';
import { AlertTriangle, AppWindow, Check, Clock3 } from 'lucide-react';
import type { AudioApplication } from '../../../../shared/contracts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import { channelColor } from './channel-identity';

export type AppDestination = AudioApplication['destination'];

const destinations: Array<{ id: AppDestination; label: string }> = [
  { id: 'game', label: 'Game' },
  { id: 'chat', label: 'Chat' },
  { id: 'media', label: 'Media' },
];

const DRAG_TYPE = 'application/x-switchboard-audio-app';

/** The channel a chip belongs in: where it was sent (while waiting), else where it plays. */
export function applicationChannel(application: AudioApplication): AppDestination | null {
  if (application.routingState === 'pending-restart' && application.preferredDestination) return application.preferredDestination;
  return application.currentDestination ?? application.preferredDestination ?? null;
}

function sortApplications(applications: AudioApplication[]): AudioApplication[] {
  return [...applications].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function applicationStatus(application: AudioApplication, channel: AppDestination | null): string {
  if (application.routingError) return application.routingError;
  const label = destinations.find((destination) => destination.id === channel)?.label;
  if (application.routingState === 'pending-restart') {
    return `Waiting for audio on ${label ?? 'the new channel'}. Restart the app if it keeps the old output.`;
  }
  if (!label) return application.active ? 'Playing, not routed yet.' : 'Idle, not routed yet.';
  return application.active ? `Playing through ${label}.` : `Routed to ${label}, idle.`;
}

/**
 * A strip's application well. Apps are chips: drag one to another well, or
 * open it to pick a channel from the keyboard. Only routed channels accept
 * drops; the host cannot return an app to "unrouted".
 */
export const AppRoutingWell = memo(function AppRoutingWell({
  title,
  destination,
  applications,
  disabled,
  onApplicationRoute,
}: {
  title: string;
  destination: AppDestination | null;
  applications: AudioApplication[];
  disabled: boolean;
  onApplicationRoute: (applicationId: string, destination: AppDestination) => void;
}) {
  const [dropping, setDropping] = useState(false);
  const acceptsDrop = destination !== null && !disabled;

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!acceptsDrop || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!dropping) setDropping(true);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    setDropping(false);
    if (!acceptsDrop) return;
    const applicationId = event.dataTransfer.getData(DRAG_TYPE);
    if (!applicationId) return;
    event.preventDefault();
    const application = applications.find((candidate) => candidate.id === applicationId);
    if (application && applicationChannel(application) === destination) return;
    onApplicationRoute(applicationId, destination);
  };

  return (
    <section
      className={cn('app-well', dropping && 'is-dropping', destination === null && 'app-well--pool')}
      aria-label={title}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={onDrop}
    >
      <h4 className="app-well__title">{title}</h4>
      <div className="app-well__body">
        {applications.length === 0 ? (
          <p className="app-well__empty">{destination === null ? 'Every app is routed.' : 'Drop apps here'}</p>
        ) : (
          <ul className="app-well__list">
            {sortApplications(applications).map((application) => (
              <li key={application.id}>
                <AppChip application={application} disabled={disabled} onApplicationRoute={onApplicationRoute} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
});

function AppChip({
  application,
  disabled,
  onApplicationRoute,
}: {
  application: AudioApplication;
  disabled: boolean;
  onApplicationRoute: (applicationId: string, destination: AppDestination) => void;
}) {
  const channel = applicationChannel(application);
  const waiting = application.routingState === 'pending-restart';
  const failed = Boolean(application.routingError);
  const status = applicationStatus(application, channel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn('app-chip', !application.active && 'is-idle', waiting && 'is-waiting', failed && 'is-failed', channel === null && 'is-unrouted')}
          style={channel ? { '--chip-color': channelColor(channel) } as CSSProperties : undefined}
          draggable={!disabled}
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_TYPE, application.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          title={`${application.name}. ${status}`}
          aria-label={`${application.name}. ${status} Choose a channel.`}
        >
          {application.iconDataUrl ? (
            <img src={application.iconDataUrl} alt="" className="app-chip__icon" draggable={false} />
          ) : (
            <AppWindow className="app-chip__icon" aria-hidden="true" />
          )}
          <span className="app-chip__name">{application.name}</span>
          {failed ? <AlertTriangle className="app-chip__state" aria-hidden="true" />
            : waiting ? <Clock3 className="app-chip__state" aria-hidden="true" /> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuLabel className="app-chip__menu-label">Route {application.name} to</DropdownMenuLabel>
        {destinations.map((destination) => (
          <DropdownMenuItem
            key={destination.id}
            disabled={destination.id === channel}
            onSelect={() => onApplicationRoute(application.id, destination.id)}
          >
            <span className="app-chip__menu-dot" style={{ background: channelColor(destination.id) }} aria-hidden="true" />
            {destination.label}
            {destination.id === channel ? <Check className="ml-auto size-3.5" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
