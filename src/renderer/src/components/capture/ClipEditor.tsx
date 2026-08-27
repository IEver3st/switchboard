import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, FolderOpen, Maximize, Minimize, MoreVertical, PanelRightClose, PanelRightOpen, Pencil, Star, Trash2, Volume2 } from 'lucide-react';
import type { Clip, ClipAudioChannel, ClipAudioTrackTrim, ClipCanvasSize, ClipExportPreset } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { channelColor } from '@/components/audio/channel-identity';
import { cn } from '@/lib/cn';
import { formatBytes, formatDuration, formatVideoQuality } from '@/lib/format';
import { ClipTimeline } from './ClipTimeline';
import { ShareClipDialog } from './ShareClipDialog';

const channelLabels: Record<ClipAudioChannel, string> = {
  game: 'Game',
  chat: 'Chat',
  microphone: 'Microphone',
  media: 'Media',
};

const canvasSizes: Array<{ id: ClipCanvasSize; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: '9:16', label: '9:16' },
];

export function ClipEditor({ clip, exportPending, trimPending, canvasPending, inspectorOpen, onClose, onFavorite, onRename, onReveal, onInspectorOpenChange, onCanvasSizeChange, onSaveTrim, onAudioTrackLevelChange, onExport, onDelete }: {
  clip: Clip;
  exportPending: boolean;
  trimPending: boolean;
  canvasPending: boolean;
  inspectorOpen: boolean;
  onClose: () => void;
  onFavorite: (favorite: boolean) => void;
  onRename: () => void;
  onReveal: () => void;
  onInspectorOpenChange: (open: boolean) => void;
  onCanvasSizeChange: (canvasSize: ClipCanvasSize) => void;
  onSaveTrim: (startMs: number, endMs: number, audioTrackTrims: Array<ClipAudioTrackTrim | null>) => Promise<void>;
  onAudioTrackLevelChange: (trackIndex: number, level: number) => Promise<void>;
  onExport: (preset: ClipExportPreset, startMs: number, endMs: number, audioTrackTrims: Array<ClipAudioTrackTrim | null>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const cropGuideRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const savedStartMs = clip.trimStartMs ?? 0;
  const savedEndMs = clip.trimEndMs ?? clip.durationMs;
  const savedAudioTrackTrims = clip.audioTrackTrims ?? [];
  const [startMs, setStartMs] = useState(savedStartMs);
  const [endMs, setEndMs] = useState(savedEndMs);
  const [audioTrackTrims, setAudioTrackTrims] = useState<Array<ClipAudioTrackTrim | null>>(() => [...savedAudioTrackTrims]);
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewerFullscreen, setViewerFullscreen] = useState(false);
  const dirty = startMs !== savedStartMs
    || endMs !== savedEndMs
    || !sameAudioTrackTrims(audioTrackTrims, savedAudioTrackTrims);

  useEffect(() => {
    setStartMs(clip.trimStartMs ?? 0);
    setEndMs(clip.trimEndMs ?? clip.durationMs);
    setAudioTrackTrims([...(clip.audioTrackTrims ?? [])]);
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

  useEffect(() => {
    const viewer = viewerRef.current;
    const guide = cropGuideRef.current;
    if (!viewer || !guide || clip.canvasSize !== '9:16') return;
    const updateCropGuide = () => {
      const width = viewer.clientWidth;
      const height = viewer.clientHeight;
      const sourceAspect = clip.width > 0 && clip.height > 0 ? clip.width / clip.height : 16 / 9;
      const viewerAspect = width / Math.max(1, height);
      const videoWidth = viewerAspect > sourceAspect ? height * sourceAspect : width;
      const videoHeight = viewerAspect > sourceAspect ? height : width / sourceAspect;
      const targetAspect = 9 / 16;
      const cropWidth = sourceAspect >= targetAspect ? videoHeight * targetAspect : videoWidth;
      const cropHeight = sourceAspect >= targetAspect ? videoHeight : videoWidth / targetAspect;
      guide.style.left = `${(width - cropWidth) / 2}px`;
      guide.style.top = `${(height - cropHeight) / 2}px`;
      guide.style.width = `${cropWidth}px`;
      guide.style.height = `${cropHeight}px`;
    };
    const observer = new ResizeObserver(updateCropGuide);
    observer.observe(viewer);
    updateCropGuide();
    return () => observer.disconnect();
  }, [clip.canvasSize, clip.height, clip.width, viewerFullscreen]);

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

  const updateAudioTrackTrim = (trackIndex: number, nextStartMs: number, nextEndMs: number) => {
    setAudioTrackTrims((current) => {
      const next = [...current];
      while (next.length <= trackIndex) next.push(null);
      next[trackIndex] = nextStartMs === 0 && nextEndMs === clip.durationMs
        ? null
        : { startMs: nextStartMs, endMs: nextEndMs };
      while (next.at(-1) === null) next.pop();
      return next;
    });
  };

  const toggleViewerFullscreen = () => setViewerFullscreen((current) => !current);

  return (
    <section ref={editorRef} className="clip-editor-shell" role="dialog" aria-modal="true" aria-labelledby="clip-editor-title" data-testid="clip-editor" onKeyDown={keepFocusInside}>
      <header className="clip-editor-header no-drag">
        <Button ref={backRef} type="button" variant="ghost" size="sm" className="no-drag px-2" onClick={onClose}>
          <ArrowLeft className="size-4" /> Back to clips
        </Button>
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
        <ShareClipDialog clip={clip} startMs={startMs} endMs={endMs} exportPending={exportPending} disabled={clip.durationMs < 100} onExport={(preset) => onExport(preset, startMs, endMs, audioTrackTrims)} />
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

      <dl className="clip-editor-metadata no-drag" aria-label="Clip file details">
        <Metadata label="Created" value={new Date(clip.createdAt).toLocaleString()} />
        <Metadata label="Video quality" value={formatVideoQuality(clip.width, clip.height, clip.fps)} />
        <Metadata label="Size" value={formatBytes(clip.fileSize)} />
        <div className="clip-editor-metadata__location">
          <dt>Location</dt>
          <dd>
            <button type="button" className="clip-editor-metadata__path" title={clip.path} aria-label={`Show ${clip.path} in File Explorer`} onClick={onReveal}>
              <FolderOpen aria-hidden="true" /><span>{clip.path}</span>
            </button>
          </dd>
        </div>
      </dl>

      <div className="clip-editor-layout" data-inspector={inspectorOpen ? 'open' : 'closed'}>
        <main className="clip-editor-workspace">
          <div ref={viewerRef} className="clip-editor-preview" data-state={previewState} data-canvas-size={clip.canvasSize} data-fullscreen={viewerFullscreen ? 'true' : 'false'}>
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
            {clip.canvasSize === '9:16' ? <div ref={cropGuideRef} className="clip-editor-crop-guide" aria-hidden="true" /> : null}
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
            clipId={clip.id}
            videoRef={videoRef}
            durationMs={clip.durationMs}
            fps={clip.fps}
            audioChannels={clip.audioChannels}
            audioTrackLevels={clip.audioTrackLevels}
            audioTrackTrims={audioTrackTrims}
            startMs={startMs}
            endMs={endMs}
            dirty={dirty}
            savePending={trimPending}
            onChange={updateTrim}
            onAudioTrackTrimChange={updateAudioTrackTrim}
            onResetTrims={() => {
              updateTrim(0, clip.durationMs);
              setAudioTrackTrims([]);
            }}
            onAudioTrackLevelChange={onAudioTrackLevelChange}
            onSave={() => void onSaveTrim(startMs, endMs, audioTrackTrims)}
          />
        </main>

        <aside className="clip-editor-inspector" aria-label="Clip inspector" aria-hidden={!inspectorOpen || undefined} inert={!inspectorOpen ? true : undefined}>
          <ScrollArea className="h-full">
            <div className="clip-editor-inspector__content">
              <div className="clip-editor-inspector__heading">
                <div><span>Inspector</span><h3>Adjustments</h3></div>
              </div>

              <section className="clip-editor-inspector__section clip-editor-canvas" aria-labelledby="canvas-size-heading">
                <div className="clip-editor-section-heading">
                  <h3 id="canvas-size-heading">Canvas size</h3>
                  <span>{canvasPending ? 'Saving…' : clip.canvasSize === '9:16' ? 'Vertical' : 'Source'}</span>
                </div>
                <RadioGroup className="clip-editor-canvas__options" aria-label="Canvas size" value={clip.canvasSize} disabled={canvasPending} onValueChange={(value) => onCanvasSizeChange(value as ClipCanvasSize)}>
                  {canvasSizes.map((option) => {
                    const selected = clip.canvasSize === option.id;
                    const id = `clip-canvas-${option.id.replace(':', '-')}`;
                    return (
                      <label key={option.id} htmlFor={id} className="clip-editor-canvas__option" data-state={selected ? 'checked' : 'unchecked'} data-disabled={canvasPending ? '' : undefined}>
                        <RadioGroupItem id={id} value={option.id} className="sr-only" aria-label={option.label} />
                        <span className="clip-editor-canvas__glyph" data-shape={option.id} aria-hidden="true"><i /></span>
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </RadioGroup>
                <p>{clip.canvasSize === '9:16' ? 'Exports use the centered vertical crop shown in the preview.' : 'Exports keep the source frame.'}</p>
              </section>

              <Separator />
              <dl className="clip-editor-details">
                <Detail label="Game" value={clipGameLabel(clip)} />
                <Detail label="Duration" value={formatDuration(clip.durationMs / 1_000)} />
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

function sameAudioTrackTrims(
  left: readonly (ClipAudioTrackTrim | null)[],
  right: readonly (ClipAudioTrackTrim | null)[],
): boolean {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftTrim = left[index] ?? null;
    const rightTrim = right[index] ?? null;
    if (leftTrim?.startMs !== rightTrim?.startMs || leftTrim?.endMs !== rightTrim?.endMs) return false;
  }
  return true;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}
