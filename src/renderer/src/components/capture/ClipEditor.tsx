import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, FolderOpen, Maximize, Minimize, MoreVertical, PanelRightClose, PanelRightOpen, Pencil, Star, Trash2, Volume2 } from 'lucide-react';
import type { Clip, ClipAudioChannel, ClipExportPreset } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { channelColor } from '@/components/audio/channel-identity';
import { cn } from '@/lib/cn';
import { formatBytes, formatDuration } from '@/lib/format';
import { ClipTimeline } from './ClipTimeline';
import { ShareClipDialog } from './ShareClipDialog';

const channelLabels: Record<ClipAudioChannel, string> = {
  game: 'Game',
  chat: 'Chat',
  microphone: 'Microphone',
  media: 'Media',
};

export function ClipEditor({ clip, exportPending, trimPending, inspectorOpen, onClose, onFavorite, onRename, onReveal, onInspectorOpenChange, onSaveTrim, onExport, onDelete }: {
  clip: Clip;
  exportPending: boolean;
  trimPending: boolean;
  inspectorOpen: boolean;
  onClose: () => void;
  onFavorite: (favorite: boolean) => void;
  onRename: () => void;
  onReveal: () => void;
  onInspectorOpenChange: (open: boolean) => void;
  onSaveTrim: (startMs: number, endMs: number) => Promise<void>;
  onExport: (preset: ClipExportPreset, startMs: number, endMs: number) => Promise<boolean>;
  onDelete: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedStartMs = clip.trimStartMs ?? 0;
  const savedEndMs = clip.trimEndMs ?? clip.durationMs;
  const [startMs, setStartMs] = useState(savedStartMs);
  const [endMs, setEndMs] = useState(savedEndMs);
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewerFullscreen, setViewerFullscreen] = useState(false);
  const dirty = startMs !== savedStartMs || endMs !== savedEndMs;

  useEffect(() => {
    setStartMs(clip.trimStartMs ?? 0);
    setEndMs(clip.trimEndMs ?? clip.durationMs);
    setPreviewState('loading');
  }, [clip.id]);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!viewerFullscreen) return;
    const exitFocusedViewer = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setViewerFullscreen(false);
    };
    window.addEventListener('keydown', exitFocusedViewer, { capture: true });
    return () => window.removeEventListener('keydown', exitFocusedViewer, { capture: true });
  }, [viewerFullscreen]);

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && viewerFullscreen) return;
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

  const toggleViewerFullscreen = () => setViewerFullscreen((current) => !current);

  return (
    <section ref={editorRef} className="clip-editor-shell" role="dialog" aria-modal="true" aria-labelledby="clip-editor-title" data-testid="clip-editor" onKeyDown={keepFocusInside}>
      <header className="clip-editor-header no-drag">
        <Button ref={backRef} type="button" variant="ghost" size="sm" className="no-drag px-2" onClick={onClose}>
          <ArrowLeft className="size-4" /> Back to clips
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <div className="clip-editor-header__identity">
          <h2 id="clip-editor-title">
            <button type="button" className="clip-editor-header__rename no-drag" onClick={onRename} aria-label={`Rename ${clip.name}`}>
              <span>{clip.name}</span><Pencil aria-hidden="true" />
            </button>
          </h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className={cn('no-drag size-7', clip.favorite && 'text-primary')} aria-label={clip.favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={clip.favorite} onClick={() => onFavorite(!clip.favorite)}>
                <Star className={cn('size-3.5', clip.favorite && 'fill-current')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{clip.favorite ? 'Remove from favorites' : 'Add to favorites'}</TooltipContent>
          </Tooltip>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="no-drag" aria-label={inspectorOpen ? 'Collapse Inspector' : 'Open Inspector'} aria-pressed={inspectorOpen} onClick={() => onInspectorOpenChange(!inspectorOpen)}>
              {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{inspectorOpen ? 'Collapse Inspector' : 'Open Inspector'}</TooltipContent>
        </Tooltip>
        <Separator orientation="vertical" className="h-5" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="no-drag clip-editor-header__file-action" onClick={onReveal}>
              <FolderOpen className="size-3.5" /><span>Show in folder</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Show in folder</TooltipContent>
        </Tooltip>
        <ShareClipDialog clip={clip} startMs={startMs} endMs={endMs} exportPending={exportPending} disabled={clip.durationMs < 100} onExport={(preset) => onExport(preset, startMs, endMs)} />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="no-drag" aria-label="More clip actions">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>More clip actions</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="no-drag">
            <DropdownMenuItem onSelect={onRename}><Pencil className="size-3.5" /> Rename clip</DropdownMenuItem>
            <DropdownMenuItem onSelect={onReveal}><FolderOpen className="size-3.5" /> Show in folder</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onSelect={onDelete}>
              <Trash2 className="size-3.5" /> Delete clip
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="clip-editor-layout" data-inspector={inspectorOpen ? 'open' : 'closed'}>
        <main className="clip-editor-workspace">
          <div ref={viewerRef} className="clip-editor-preview" data-state={previewState} data-fullscreen={viewerFullscreen ? 'true' : 'false'}>
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
            <div className="clip-editor-preview__controls no-drag">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="clip-editor-preview__fullscreen" aria-label={viewerFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={toggleViewerFullscreen}>
                    {viewerFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{viewerFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
              </Tooltip>
            </div>
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

        <aside className="clip-editor-inspector" aria-label="Clip inspector" aria-hidden={!inspectorOpen || undefined} inert={!inspectorOpen ? true : undefined}>
          <ScrollArea className="h-full">
            <div className="clip-editor-inspector__content">
              <div className="clip-editor-inspector__heading">
                <div><span>Inspector</span><h3>Clip details</h3></div>
              </div>
              <dl className="clip-editor-details">
                <Detail label="Game" value={clipGameLabel(clip)} />
                <Detail label="Duration" value={formatDuration(clip.durationMs / 1_000)} />
                <Detail label="Recorded" value={new Date(clip.createdAt).toLocaleString()} />
                <Detail label="Resolution" value={`${clip.width} × ${clip.height} · ${Math.round(clip.fps)} FPS`} />
                <Detail label="File size" value={formatBytes(clip.fileSize)} />
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
