import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, FolderOpen, Pencil, Star, Trash2, Volume2 } from 'lucide-react';
import type { Clip, ClipAudioChannel, ClipExportPreset } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { channelColor } from '@/components/audio/channel-identity';
import { cn } from '@/lib/cn';
import { formatBytes, formatClipTimestamp, formatDuration } from '@/lib/format';
import { ClipTimeline } from './ClipTimeline';
import { ShareClipDialog } from './ShareClipDialog';

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
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('loading');
  const dirty = startMs !== savedStartMs || endMs !== savedEndMs;

  useEffect(() => {
    setStartMs(clip.trimStartMs ?? 0);
    setEndMs(clip.trimEndMs ?? clip.durationMs);
    setPreviewState('loading');
  }, [clip.id]);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[data-radix-popper-content-wrapper], [data-share-clip-dialog][data-state="open"]')) {
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
    <section ref={editorRef} className="clip-editor-shell" role="dialog" aria-modal="true" aria-labelledby="clip-editor-title" data-testid="clip-editor" onKeyDown={keepFocusInside}>
      <header className="clip-editor-header no-drag">
        <Button ref={backRef} type="button" variant="ghost" size="sm" className="no-drag px-2" onClick={onClose}>
          <ArrowLeft className="size-4" /> Back to clips
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="clip-editor-header__identity">
          <h2 id="clip-editor-title">{clip.name}</h2>
          <p>{clipGameLabel(clip)} <span aria-hidden="true">·</span> {formatClipTimestamp(clip.createdAt)}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className={cn('no-drag', clip.favorite && 'text-primary')} aria-label={clip.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={clip.favorite} onClick={() => onFavorite(!clip.favorite)}>
              <Star className={cn('size-4', clip.favorite && 'fill-current')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{clip.favorite ? 'Remove from favorites' : 'Add to favorites'}</TooltipContent>
        </Tooltip>
        <ShareClipDialog clip={clip} startMs={startMs} endMs={endMs} exportPending={exportPending} disabled={clip.durationMs < 100} onExport={(preset) => onExport(preset, startMs, endMs)} />
      </header>

      <div className="clip-editor-layout">
        <main className="clip-editor-workspace">
          <div className="clip-editor-preview" data-state={previewState}>
            <video
              ref={videoRef}
              src={`switchboard-media://clip/${encodeURIComponent(clip.id)}`}
              preload="metadata"
              aria-label={`Preview ${clip.name}`}
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = startMs / 1_000;
              }}
              onCanPlay={() => setPreviewState('ready')}
              onError={() => setPreviewState('error')}
            />
            {previewState !== 'ready' ? (
              <div className="clip-editor-preview__status" role={previewState === 'error' ? 'alert' : 'status'}>
                <strong>{previewState === 'error' ? 'Preview unavailable' : 'Loading preview'}</strong>
                <span>{previewState === 'error' ? 'The clip could not be decoded. File actions remain available.' : 'Reading clip metadata…'}</span>
              </div>
            ) : null}
          </div>
          <ClipTimeline
            key={clip.id}
            videoRef={videoRef}
            durationMs={clip.durationMs}
            fps={clip.fps}
            startMs={startMs}
            endMs={endMs}
            dirty={dirty}
            savePending={trimPending}
            onChange={updateTrim}
            onSave={() => void onSaveTrim(startMs, endMs)}
          />
        </main>

        <aside className="clip-editor-inspector" aria-label="Clip details and actions">
          <ScrollArea className="h-full">
            <div className="clip-editor-inspector__content">
              <div className="clip-editor-inspector__heading">
                <span>Inspector</span>
                <h3>Clip details</h3>
              </div>
              <dl className="clip-editor-details">
                <Detail label="Game" value={clipGameLabel(clip)} />
                <Detail label="Selection" value={formatDuration((endMs - startMs) / 1_000)} />
                <Detail label="Original" value={formatDuration(clip.durationMs / 1_000)} />
                <Detail label="Recorded" value={new Date(clip.createdAt).toLocaleString()} />
                <Detail label="Quality" value={`${clip.width} × ${clip.height} · ${Math.round(clip.fps)} FPS`} />
                <Detail label="Size" value={formatBytes(clip.fileSize)} />
              </dl>

              <Separator />
              <section className="clip-editor-inspector__section" aria-labelledby="audio-tracks-heading">
                <h3 id="audio-tracks-heading"><Volume2 className="size-3.5" aria-hidden="true" /> Audio tracks</h3>
                {clip.audioChannels && clip.audioChannels.length > 0 ? (
                  <ul className="clip-editor-audio-tracks">
                    {clip.audioChannels.map((channel) => (
                      <li key={channel}>
                        <span style={{ backgroundColor: channelColor(channel) }} aria-hidden="true" />
                        {channelLabels[channel]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No separate channel metadata is available.</p>
                )}
              </section>

              <Separator />
              <section className="clip-editor-inspector__section clip-editor-inspector__actions" aria-labelledby="clip-actions-heading">
                <h3 id="clip-actions-heading">File actions</h3>
                <Button type="button" variant="ghost" size="sm" onClick={onRename}><Pencil className="size-3.5" /> Rename</Button>
                <Button type="button" variant="ghost" size="sm" onClick={onReveal}><FolderOpen className="size-3.5" /> Show in folder</Button>
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}><Trash2 className="size-3.5" /> Delete clip</Button>
              </section>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}
