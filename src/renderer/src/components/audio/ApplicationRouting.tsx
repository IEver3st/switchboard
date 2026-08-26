import { AppWindow, LockKeyhole } from 'lucide-react';
import type { AudioState } from '../../../../shared/contracts';

export function ApplicationRouting({ audio }: { audio: AudioState }) {
  return (
    <section aria-labelledby="applications-heading" className="border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <AppWindow className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <h2 id="applications-heading" className="m-0 text-[12px] font-semibold text-foreground">Applications</h2>
      </div>

      {audio.capabilities.applicationRouting === 'unavailable' ? (
        <div className="mt-3 flex min-h-12 items-start gap-2 border-y border-border py-3 text-[9px] text-muted-foreground">
          <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p className="m-0 max-w-2xl leading-4">
            Application routing requires installed Switchboard virtual endpoints. Core Audio session discovery exists in Audio.Host, but this build cannot move application streams yet.
          </p>
        </div>
      ) : audio.applications.length === 0 ? (
        <p className="m-0 mt-3 border-y border-border py-3 text-[9px] text-muted-foreground">No active audio applications.</p>
      ) : (
        <div className="mt-2 divide-y divide-border border-y border-border">
          {audio.applications.map((application) => (
            <div key={application.id} className="grid min-h-10 grid-cols-[minmax(0,1fr)_120px] items-center gap-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                {application.iconDataUrl ? <img src={application.iconDataUrl} alt="" className="size-4 object-contain" /> : <AppWindow className="size-4 text-muted-foreground" aria-hidden="true" />}
                <span className="truncate text-[10px] text-foreground">{application.name}</span>
              </div>
              <span className="text-right text-[9px] capitalize text-muted-foreground">{application.destination}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
