import { useEffect, useRef } from 'react';
import { ArrowLeft, Download, FolderOpen, Pencil, Star, Trash2, Volume2 } from 'lucide-react';
import type { Clip, ClipAudioChannel } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { Button } from '@/components/ui/button';
import { channelColor } from '@/components/audio/channel-identity';
import { cn } from '@/lib/cn';
import { formatBytes, formatClipTimestamp, formatDuration } from '@/lib/format';

const channelLabels: Record<ClipAudioChannel, string> = {
  game: 'Game',
  chat: 'Chat',
  microphone: 'Microphone',
  media: 'Media',
};

export function ClipEditor({ clip, exportPending, onClose, onFavorite, onRename, onReveal, onExport, onDelete }: {
  clip: Clip;
  exportPending: boolean;
  onClose: () => void;
  onFavorite: (favorite: boolean) => void;
  onRename: () => void;
  onReveal: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <section className="fixed inset-0 z-40 flex min-h-0 flex-col bg-background" aria-labelledby="clip-editor-title">
      <header className="flex min-h-[54px] items-center gap-3 border-b border-border bg-card px-4">
        <Button ref={backRef} type="button" variant="ghost" size="sm" className="px-2" onClick={onClose}><ArrowLeft className="size-4" /> Back to clips</Button>
        <div className="h-5 w-px bg-border" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="clip-editor-title" className="m-0 truncate text-[14px] font-semibold text-foreground">{clip.name}</h2>
          <p className="m-0 mt-0.5 truncate text-[10px] text-muted-foreground">{clipGameLabel(clip)} <span aria-hidden="true">·</span> {formatClipTimestamp(clip.createdAt)}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className={cn(clip.favorite && 'text-primary')} aria-label={clip.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={clip.favorite} onClick={() => onFavorite(!clip.favorite)}>
          <Star className={cn('size-4', clip.favorite && 'fill-current')} />
        </Button>
        <Button type="button" variant="primary" size="sm" disabled={exportPending} onClick={onExport}><Download className="size-4" />{exportPending ? 'Exporting…' : 'Export'}</Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] max-[920px]:grid-cols-1 max-[920px]:overflow-y-auto">
        <div className="flex min-h-0 flex-col bg-background p-5 max-[920px]:min-h-[480px]">
          <div className="grid min-h-0 flex-1 place-items-center">
            <video src={`switchboard-media://clip/${encodeURIComponent(clip.id)}`} controls autoPlay className="max-h-full max-w-full bg-black" />
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground"><Volume2 className="size-3.5" /> Audio tracks</div>
            {clip.audioChannels && clip.audioChannels.length > 0 ? (
              <div className="mt-2 grid gap-1.5">
                {clip.audioChannels.map((channel) => (
                  <div key={channel} className="grid h-8 grid-cols-[4px_110px_minmax(0,1fr)] items-center gap-2 rounded-sm bg-surface-1 pr-3 text-[11px] text-text-secondary">
                    <span className="h-full" style={{ backgroundColor: channelColor(channel) }} aria-hidden="true" />
                    <span>{channelLabels[channel]}</span>
                    <span className="h-[3px] rounded-full opacity-60" style={{ backgroundColor: channelColor(channel) }} aria-hidden="true" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="m-0 mt-2 text-[11px] text-muted-foreground">No separate channel metadata is available for this clip.</p>
            )}
          </div>
        </div>

        <aside className="min-h-0 overflow-y-auto border-l border-border bg-card p-4 max-[920px]:border-l-0 max-[920px]:border-t">
          <h3 className="m-0 text-[12px] font-semibold text-foreground">Clip details</h3>
          <dl className="mt-3 grid gap-0 text-[11px]">
            <Detail label="Game" value={clipGameLabel(clip)} />
            <Detail label="Duration" value={formatDuration(clip.durationMs / 1_000)} />
            <Detail label="Recorded" value={new Date(clip.createdAt).toLocaleString()} />
            <Detail label="Quality" value={`${clip.width} × ${clip.height} · ${Math.round(clip.fps)} FPS`} />
            <Detail label="Size" value={formatBytes(clip.fileSize)} />
          </dl>
          <div className="mt-5 grid gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" size="sm" className="justify-start" onClick={onRename}><Pencil className="size-3.5" /> Rename</Button>
            <Button type="button" variant="secondary" size="sm" className="justify-start" onClick={onReveal}><FolderOpen className="size-3.5" /> Show in folder</Button>
            <Button type="button" variant="danger" size="sm" className="justify-start" onClick={onDelete}><Trash2 className="size-3.5" /> Delete clip</Button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-3 border-b border-border py-2.5"><dt className="text-muted-foreground">{label}</dt><dd className="m-0 min-w-0 break-words text-text-secondary">{value}</dd></div>;
}
