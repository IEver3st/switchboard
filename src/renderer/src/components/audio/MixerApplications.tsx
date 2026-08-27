import { memo } from 'react';
import { AppWindow, CircleSlash2 } from 'lucide-react';
import type { AudioApplication, AudioSupportLevel } from '../../../../shared/contracts';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/cn';

const applicationDestinations: Array<{ id: AudioApplication['destination']; label: string }> = [
  { id: 'game', label: 'Game' },
  { id: 'chat', label: 'Chat' },
  { id: 'media', label: 'Media' },
];

function supportLabel(support: AudioSupportLevel): string {
  if (support === 'simulation') return 'Prototype';
  if (support === 'unavailable') return 'Unavailable';
  return 'Ready';
}

export const MixerApplications = memo(function MixerApplications({
  channelLabel,
  applications,
  routingSupport,
  unavailableReason,
  pending,
  onApplicationRoute,
}: {
  channelLabel: string;
  applications: AudioApplication[];
  routingSupport: AudioSupportLevel;
  unavailableReason?: string | null;
  pending: boolean;
  onApplicationRoute: (applicationId: string, destination: AudioApplication['destination']) => void;
}) {
  const sortedApplications = [...applications].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  const activeCount = applications.filter((application) => application.active).length;
  const canRoute = routingSupport !== 'unavailable' && !pending;

  return (
    <section className="mixer-channel__apps" aria-label={`${channelLabel} applications`}>
      <div className="mixer-channel__apps-heading">
        <span>Applications</span>
        {routingSupport === 'available' ? (
          <Badge variant={activeCount > 0 ? 'success' : 'default'}>
            {activeCount > 0
              ? `${activeCount}${activeCount < applications.length ? `/${applications.length}` : ''} live`
              : `${applications.length} assigned`}
          </Badge>
        ) : (
          <Badge variant={routingSupport === 'simulation' ? 'warning' : 'default'}>
            {supportLabel(routingSupport)}
          </Badge>
        )}
      </div>

      {routingSupport === 'unavailable' ? (
        <div className="mixer-channel__apps-empty" title={unavailableReason ?? undefined}>
          <CircleSlash2 className="size-3.5" aria-hidden="true" />
          <span>App routing unavailable</span>
        </div>
      ) : sortedApplications.length === 0 ? (
        <div className="mixer-channel__apps-empty">
          <AppWindow className="size-3.5" aria-hidden="true" />
          <span>No apps on this channel</span>
        </div>
      ) : (
        <ScrollArea className="mixer-channel__apps-scroll">
          <ul className="mixer-channel__app-list">
            {sortedApplications.map((application) => {
              const restartRequired = application.routingState === 'pending-restart';
              const status = restartRequired
                ? 'Restart required'
                : application.active ? `Playing through ${channelLabel}.` : `Assigned to ${channelLabel}; currently idle.`;

              return (
                <li
                  key={application.id}
                  className={cn(!application.active && 'is-inactive')}
                  title={restartRequired
                    ? `Using ${channelLabel}. Restart ${application.name} to move it to ${application.destination}.`
                    : undefined}
                >
                  <span
                    className={cn('mixer-channel__app-activity', application.active && 'is-active')}
                    aria-hidden="true"
                  />
                  {application.iconDataUrl ? (
                    <img src={application.iconDataUrl} alt="" className="mixer-channel__app-icon" />
                  ) : (
                    <AppWindow className="mixer-channel__app-icon" aria-hidden="true" />
                  )}
                  <span className="mixer-channel__app-copy">
                    <span className="mixer-channel__app-name">{application.name}</span>
                    <span className={cn('mixer-channel__app-state', restartRequired && 'is-pending')}>{status}</span>
                  </span>
                  <Select
                    value={application.destination}
                    disabled={!canRoute}
                    onValueChange={(destination) => onApplicationRoute(
                      application.id,
                      destination as AudioApplication['destination'],
                    )}
                  >
                    <SelectTrigger className="mixer-channel__route-select" aria-label={`Route ${application.name} to channel`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {applicationDestinations.map((destination) => (
                        <SelectItem key={destination.id} value={destination.id}>{destination.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </section>
  );
});
