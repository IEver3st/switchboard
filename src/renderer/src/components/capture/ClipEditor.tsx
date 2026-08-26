import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, FolderOpen, Pencil, Star, Trash2, Volume2 } from 'lucide-react';
import type { Clip, ClipAudioChannel, ClipExportPreset } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { Button } from '@/components/ui/button';
import { channelColor } from '@/components/audio/channel-identity';
import { cn } from '@/lib/cn';
import { formatBytes, formatClipTimestamp, formatDuration } from '@/lib/format';
import { ClipTimeline } from './ClipTimeline';
import { ShareClipPopover } from './ShareClipPopover';

const channelLabels: Record<ClipAudioChannel, string> = {
  game: 'Game',
  chat: 'Chat',
  microphone: 'Microphone',
  media: 'Media',
};

export function ClipEditor({ clip, exportPending, trimPending, onClose, onFavorite, onRename, onReveal, onSaveTrim, onExport, onDelete }: {
  clip: Clip;
  exportPending: boolean;
  trimPending: boolean;
  onClose: () => void;
  onFavorite: (favorite: boolean) => void;
  onRename: () => void;
  onReveal: () => void;
  onSaveTrim: (startMs: number, endMs: number) => Promise<void>;
  onExport: (preset: ClipExportPreset, startMs: number, endMs: number) => Promise<boolean>;
  onDelete: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedStartMs = clip.trimStartMs ?? 0;
  const savedEndMs = clip.trimEndMs ?? clip.durationMs;
  const [startMs, setStartMs] = useState(savedStartMs);
  const [endMs, setEndMs] = useState(savedEndMs);
  const dirty = startMs !== savedStartMs || endMs !== savedEndMs;

  useEffect(() => {
    setStartMs(clip.trimStartMs ?? 0);
    setEndMs(clip.trimEndMs ?? clip.durationMs);
  }, [clip.id]);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[data-radix-popper-content-wrapper]')) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = focusableElements(editorRef.current);
    if (controls.length === 0) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && current <= 0) {
      event.preventDefault();
      controls.at(-1)?.focus();
    } else if (!event.shiftKey && current === controls.length - 1) {
      event.preventDefault();
      controls[0]?.focus();
    }
  };

  const updateTrim = (nextStartMs: number, nextEndMs: number) => {
    setStartMs(nextStartMs);
    setEndMs(nextEndMs);
  };

  return (
    <section ref={editorRef} className="fixed bottom-0 left-[68px] right-0 top-[38px] z-40 flex min-h-0 flex-col bg-background" role="dialog" aria-modal="true" aria-labelledby="clip-editor-title" data-testid="clip-editor" onKeyDown={keepFocusInside}>
      <header className="flex min-h-[52px] shrink-0 items-center gap-3 border-b border-border bg-card px-3 no-drag">
        <Button ref={backRef} type="button" variant="ghost" size="sm" className="no-drag px-2" onClick={onClose}>
          <ArrowLeft className="size-4" /> Back to clips
        </Button>
        <div className="h-5 w-px bg-border" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="clip-editor-title" className="m-0 truncate text-[14px] font-semibold text-foreground">{clip.name}</h2>
          <p className="m-0 mt-0.5 truncate text-[10px] text-muted-foreground">{clipGameLabel(clip)} <span aria-hidden="true">·</span> {formatClipTimestamp(clip.createdAt)}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className={cn('no-drag', clip.favorite && 'text-primary')} aria-label={clip.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={clip.favorite} onClick={() => onFavorite(!clip.favorite)}>
          <Star className={cn('size-4', clip.favorite && 'fill-current')} />
        </Button>
        <ShareClipPopover clip={clip} startMs={startMs} endMs={endMs} exportPending={exportPending} disabled={clip.durationMs < 100} onExport={(preset) => onExport(preset, startMs, endMs)} />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_272px] max-[900px]:grid-cols-1 max-[900px]:overflow-y-auto">
        <main className="flex min-h-0 min-w-0 flex-col gap-3 bg-background p-3">
          <div className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-black">
            <video
              ref={videoRef}
              src={`switchboard-media://clip/${encodeURIComponent(clip.id)}`}
              controls
              preload="metadata"
              className="block size-full bg-black object-contain"
              onLoadedMetadata={(event) => { event.currentTarget.currentTime = startMs / 1_000; }}
            />
          </div>
          <ClipTimeline
            videoRef={videoRef}
            durationMs={clip.durationMs}
            startMs={startMs}
            endMs={endMs}
            dirty={dirty}
            savePending={trimPending}
            onChange={updateTrim}
            onSave={() => void onSaveTrim(startMs, endMs)}
          />
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-border bg-card p-4 max-[900px]:border-l-0 max-[900px]:border-t">
          <h3 className="m-0 text-[12px] font-semibold text-foreground">Clip details</h3>
          <dl className="mt-2 grid gap-0 text-[11px]">
            <Detail label="Game" value={clipGameLabel(clip)} />
            <Detail label="Selection" value={formatDuration((endMs - startMs) / 1_000)} />
            <Detail label="Original" value={formatDuration(clip.durationMs / 1_000)} />
            <Detail label="Recorded" value={new Date(clip.createdAt).toLocaleString()} />
            <Detail label="Quality" value={`${clip.width} × ${clip.height} · ${Math.round(clip.fps)} FPS`} />
            <Detail label="Size" value={formatBytes(clip.fileSize)} />
          </dl>

          <section className="mt-4 border-t border-border pt-3" aria-labelledby="audio-tracks-heading">
            <h3 id="audio-tracks-heading" className="m-0 flex items-center gap-2 text-[11px] font-semibold text-foreground"><Volume2 className="size-3.5" /> Audio tracks</h3>
            {clip.audioChannels && clip.audioChannels.length > 0 ? (
              <ul className="m-0 mt-2 grid list-none gap-1 p-0">
                {clip.audioChannels.map((channel) => (
                  <li key={channel} className="grid h-7 grid-cols-[3px_minmax(0,1fr)] items-center gap-2 bg-surface-1 pr-2 text-[10px] text-text-secondary">
                    <span className="h-full" style={{ backgroundColor: channelColor(channel) }} aria-hidden="true" />
                    <span>{channelLabels[channel]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 mt-2 text-[10px] leading-4 text-muted-foreground">No separate channel metadata is available.</p>
            )}
          </section>

          <div className="mt-4 grid gap-2 border-t border-border pt-3">
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
  return <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-2 border-b border-border py-2"><dt className="text-muted-foreground">{label}</dt><dd className="m-0 min-w-0 break-words tabular-nums text-text-secondary">{value}</dd></div>;
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}
