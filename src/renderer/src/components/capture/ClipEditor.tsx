import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowLeft, Clapperboard, FolderOpen, Maximize, Minimize, MoreVertical, PanelRightClose, PanelRightOpen, Pencil, Star, Trash2, Volume2 } from 'lucide-react';
import type { Clip, ClipAudioChannel, ClipAudioTrackTrim, ClipCanvasSize, ClipExportPreset, PreparedShareFile } from '../../../../shared/contracts';
import { clipGameLabel } from '../../../../shared/clip-library';
import { singularEventLabel } from '../../../../shared/auto-capture';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { channelColor } from '@/components/audio/channel-identity';
import { cn } from '@/lib/cn';
import { formatBytes, formatDuration, formatVideoQuality } from '@/lib/format';
import { ClipTimeline } from './ClipTimeline';
import { MontageTimeline } from './MontageTimeline';
import { ShareClipDialog } from './ShareClipDialog';
import {
  normalizeClipProject,
  segmentDurationMs,
  updateProjectSegment,
  type MontageClipEditorProject,
} from './clip-project-model';

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

type SingleClipEditorProps = {
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
  onExport: (preset: ClipExportPreset, startMs: number, endMs: number, audioTrackTrims: Array<ClipAudioTrackTrim | null>, exportId: string) => Promise<PreparedShareFile | null>;
  onCancelExport: (exportId: string) => Promise<void>;
  onDelete: () => void;
};

type MontageClipEditorProps = {
  project: MontageClipEditorProject;
  exportPending: boolean;
  inspectorOpen: boolean;
  onClose: () => void;
  onReveal: (clip: Clip) => void;
  onInspectorOpenChange: (open: boolean) => void;
  onExport: (preset: ClipExportPreset, project: MontageClipEditorProject, exportId: string) => Promise<boolean>;
  onCancelExport: (exportId: string) => Promise<void>;
};

export function ClipEditor(props: SingleClipEditorProps | MontageClipEditorProps) {
  return 'project' in props ? <MontageClipEditor {...props} /> : <SingleClipEditor {...props} />;
}

function SingleClipEditor({ clip, exportPending, trimPending, canvasPending, inspectorOpen, onClose, onFavorite, onRename, onReveal, onInspectorOpenChange, onCanvasSizeChange, onSaveTrim, onAudioTrackLevelChange, onExport, onCancelExport, onDelete }: SingleClipEditorProps) {
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
  const seekToEvent = (timestampMs: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = timestampMs / 1_000;
    void videoRef.current.play().catch(() => undefined);
  };

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
        <div className="clip-editor-header__actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="no-drag" aria-label={inspectorOpen ? 'Collapse Inspector' : 'Open Inspector'} aria-pressed={inspectorOpen} onClick={() => onInspectorOpenChange(!inspectorOpen)}>
                {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{inspectorOpen ? 'Collapse Inspector' : 'Open Inspector'}</TooltipContent>
          </Tooltip>
          <ShareClipDialog clip={clip} startMs={startMs} endMs={endMs} exportPending={exportPending} disabled={clip.durationMs < 100} onExport={(preset, exportId) => onExport(preset, startMs, endMs, audioTrackTrims, exportId)} onCancelExport={onCancelExport} />
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
        </div>
      </header>

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
            eventMarkers={clip.autoCapture?.events}
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
              {clip.autoCapture?.events.length ? (
                <>
                  <Separator />
                  <section className="clip-editor-inspector__section clip-editor-events" aria-labelledby="clip-events-heading">
                    <div className="clip-editor-section-heading">
                      <h3 id="clip-events-heading">Events</h3>
                      <span>{clip.autoCapture.events.length}</span>
                    </div>
                    <ul>
                      {clip.autoCapture.events.map((marker) => (
                        <li key={marker.id}>
                          <button type="button" onClick={() => seekToEvent(marker.timestampMs)}>
                            <span data-event-type={marker.type} aria-hidden="true" />
                            <strong>{marker.label ?? singularEventLabel(marker.type)}</strong>
                            <time>{formatEventTime(marker.timestampMs)}</time>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              ) : null}
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

function MontageClipEditor({ project: initialProject, exportPending, inspectorOpen, onClose, onReveal, onInspectorOpenChange, onExport, onCancelExport }: MontageClipEditorProps) {
  const backRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const cropGuideRef = useRef<HTMLDivElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const montageVideoRefs = useMemo(() => [videoARef, videoBRef] as const, []);
  const [project, setProject] = useState(() => normalizeClipProject(initialProject));
  const [selectedSegmentId, setSelectedSegmentId] = useState(initialProject.segments[0]?.id ?? '');
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeVideoSlot, setActiveVideoSlot] = useState<0 | 1>(0);
  const [viewerFullscreen, setViewerFullscreen] = useState(false);
  const selectedSegment = project.segments.find((segment) => segment.id === selectedSegmentId) ?? project.segments[0];
  const selectedClip = selectedSegment?.source ?? initialProject.segments[0]!.source;
  const proportionalBytes = project.segments.reduce((total, segment) => (
    total + segment.source.fileSize * segmentDurationMs(segment) / Math.max(1, segment.source.durationMs)
  ), 0);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  useEffect(() => {
    setProject((current) => normalizeClipProject({
      ...current,
      segments: current.segments.map((segment) => {
        const latest = initialProject.segments.find((candidate) => candidate.source.id === segment.source.id);
        return latest ? { ...segment, source: latest.source, unavailableReason: latest.unavailableReason } : segment;
      }),
    }));
  }, [initialProject.segments]);

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
    if (!viewer || !guide || project.canvasSize !== '9:16') return;
    const updateCropGuide = () => {
      const width = viewer.clientWidth;
      const height = viewer.clientHeight;
      const sourceAspect = selectedClip.width > 0 && selectedClip.height > 0 ? selectedClip.width / selectedClip.height : 16 / 9;
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
  }, [project.canvasSize, selectedClip.height, selectedClip.width, viewerFullscreen]);

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

  const updateProject = (nextProject: MontageClipEditorProject) => {
    setProject(normalizeClipProject(nextProject));
  };

  const updateSelectedAudioLevel = (trackIndex: number, level: number) => {
    if (!selectedSegment) return;
    updateProject(updateProjectSegment(project, selectedSegment.id, (segment) => {
      const levels = [...segment.audioTrackLevels];
      while (levels.length <= trackIndex) levels.push(100);
      levels[trackIndex] = level;
      return { ...segment, audioTrackLevels: levels };
    }));
  };

  return (
    <section ref={editorRef} className="clip-editor-shell" role="dialog" aria-modal="true" aria-labelledby="clip-editor-title" data-testid="clip-editor" data-project-type="montage" onKeyDown={keepFocusInside}>
      <header className="clip-editor-header no-drag">
        <Button ref={backRef} type="button" variant="ghost" size="sm" className="no-drag px-2" onClick={onClose}>
          <ArrowLeft className="size-4" /> Back to clips
        </Button>
        <div className="clip-editor-header__identity clip-editor-header__identity--montage">
          <Clapperboard className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h2 id="clip-editor-title" title={project.name}>{project.name}</h2>
          <span>{project.segments.length} {project.segments.length === 1 ? 'clip' : 'clips'}</span>
        </div>
        <dl className="clip-editor-metadata no-drag" aria-label="Montage details">
          <Metadata label="Duration" value={formatDuration(project.durationMs / 1_000)} />
          <Metadata label="Output" value={project.canvasSize === '9:16' ? '9:16 vertical' : formatVideoQuality(project.segments[0]?.source.width ?? 0, project.segments[0]?.source.height ?? 0, project.segments[0]?.source.fps ?? 0)} />
          <Metadata label="Selected" value={selectedClip.name} />
          <div className="clip-editor-metadata__location">
            <dt>Source</dt>
            <dd>
              <button type="button" className="clip-editor-metadata__path" title={selectedClip.path} aria-label={`Show ${selectedClip.path} in File Explorer`} onClick={() => onReveal(selectedClip)}>
                <FolderOpen aria-hidden="true" /><span>{selectedClip.path}</span>
              </button>
            </dd>
          </div>
        </dl>
        <div className="clip-editor-header__actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="no-drag" aria-label={inspectorOpen ? 'Collapse Inspector' : 'Open Inspector'} aria-pressed={inspectorOpen} onClick={() => onInspectorOpenChange(!inspectorOpen)}>
                {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{inspectorOpen ? 'Collapse Inspector' : 'Open Inspector'}</TooltipContent>
          </Tooltip>
          <ShareClipDialog
            clip={project.segments[0]!.source}
            startMs={0}
            endMs={project.durationMs}
            selectedDurationMs={project.durationMs}
            sourceBytes={proportionalBytes}
            projectType="montage"
            segmentCount={project.segments.length}
            exportPending={exportPending}
            disabled={project.durationMs < 100 || project.segments.length === 0 || project.segments.some((segment) => Boolean(segment.unavailableReason))}
            onExport={(preset, exportId) => onExport(preset, project, exportId)}
            onCancelExport={onCancelExport}
          />
        </div>
      </header>

      <div className="clip-editor-layout" data-inspector={inspectorOpen ? 'open' : 'closed'}>
        <main className="clip-editor-workspace">
          <div ref={viewerRef} className="clip-editor-preview clip-editor-preview--montage" data-state={previewState} data-canvas-size={project.canvasSize} data-fullscreen={viewerFullscreen ? 'true' : 'false'} data-active-slot={activeVideoSlot}>
            <video ref={videoARef} preload="metadata" data-preview-slot="0" aria-label={`Montage preview, ${selectedClip.name}`} />
            <video ref={videoBRef} preload="metadata" data-preview-slot="1" aria-hidden={activeVideoSlot !== 1} />
            {project.canvasSize === '9:16' ? <div ref={cropGuideRef} className="clip-editor-crop-guide" aria-hidden="true" /> : null}
            <div className="clip-editor-preview__controls no-drag">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="clip-editor-preview__fullscreen" aria-label={viewerFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => setViewerFullscreen((current) => !current)}>
                    {viewerFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{viewerFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
              </Tooltip>
            </div>
            {previewState !== 'ready' ? (
              <div className="clip-editor-preview__status" role={previewState === 'error' ? 'alert' : 'status'}>
                <strong>{previewState === 'error' ? 'Preview unavailable' : 'Loading montage preview'}</strong>
                <span>{previewState === 'error' ? 'A source clip is missing, inaccessible, or could not be decoded.' : 'Preparing the current clip and the next boundary…'}</span>
              </div>
            ) : null}
          </div>
          <MontageTimeline
            key={initialProject.id}
            project={project}
            selectedSegmentId={selectedSegmentId}
            videoRefs={montageVideoRefs}
            activeVideoSlot={activeVideoSlot}
            onActiveVideoSlotChange={setActiveVideoSlot}
            onPreviewStateChange={setPreviewState}
            onSelectedSegmentChange={setSelectedSegmentId}
            onProjectChange={updateProject}
          />
        </main>

        <aside className="clip-editor-inspector" aria-label="Montage inspector" aria-hidden={!inspectorOpen || undefined} inert={!inspectorOpen ? true : undefined}>
          <ScrollArea className="h-full">
            <div className="clip-editor-inspector__content">
              <div className="clip-editor-inspector__heading">
                <div><span>Montage inspector</span><h3>{selectedClip.name}</h3></div>
              </div>

              <section className="clip-editor-inspector__section clip-editor-canvas" aria-labelledby="montage-canvas-size-heading">
                <div className="clip-editor-section-heading">
                  <h3 id="montage-canvas-size-heading">Canvas size</h3>
                  <span>{project.canvasSize === '9:16' ? 'Vertical' : 'Source'}</span>
                </div>
                <RadioGroup className="clip-editor-canvas__options" aria-label="Montage canvas size" value={project.canvasSize} onValueChange={(value) => updateProject({ ...project, canvasSize: value as ClipCanvasSize })}>
                  {canvasSizes.map((option) => {
                    const selected = project.canvasSize === option.id;
                    const id = `montage-canvas-${option.id.replace(':', '-')}`;
                    return (
                      <label key={option.id} htmlFor={id} className="clip-editor-canvas__option" data-state={selected ? 'checked' : 'unchecked'}>
                        <RadioGroupItem id={id} value={option.id} className="sr-only" aria-label={option.label} />
                        <span className="clip-editor-canvas__glyph" data-shape={option.id} aria-hidden="true"><i /></span>
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </RadioGroup>
                <p>Every segment is normalized to this canvas during export.</p>
              </section>

              <Separator />
              <dl className="clip-editor-details">
                <Detail label="Position" value={`${Math.max(0, project.segments.findIndex((segment) => segment.id === selectedSegmentId)) + 1} of ${project.segments.length}`} />
                <Detail label="Trimmed duration" value={formatDuration(selectedSegment ? segmentDurationMs(selectedSegment) / 1_000 : 0)} />
                <Detail label="Source" value={formatVideoQuality(selectedClip.width, selectedClip.height, selectedClip.fps)} />
              </dl>

              <Separator />
              <section className="clip-editor-inspector__section" aria-labelledby="montage-audio-heading">
                <h3 id="montage-audio-heading"><Volume2 className="size-3.5" aria-hidden="true" /> Segment audio</h3>
                {selectedClip.audioChannels && selectedClip.audioChannels.length > 0 ? (
                  <div className="montage-audio-controls">
                    {selectedClip.audioChannels.map((channel, trackIndex) => {
                      const level = selectedSegment?.audioTrackLevels[trackIndex] ?? 100;
                      return (
                        <div key={`${channel}-${trackIndex}`} style={{ '--track-color': channelColor(channel) } as CSSProperties}>
                          <span><i aria-hidden="true" />{channelLabels[channel]}</span>
                          <output>{level}%</output>
                          <Slider min={0} max={100} step={1} value={[level]} aria-label={`${channelLabels[channel]} level for ${selectedClip.name}`} onValueChange={([next]) => { if (typeof next === 'number') updateSelectedAudioLevel(trackIndex, next); }} />
                        </div>
                      );
                    })}
                  </div>
                ) : <p>This source has no separate audio-channel metadata. Any decodable audio is still included in export.</p>}
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
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>;
}

function formatEventTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}
