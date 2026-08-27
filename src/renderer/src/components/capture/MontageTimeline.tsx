import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { GripVertical, Pause, Play, SkipBack, SkipForward, Trash2, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  mapMontageTime,
  montageStartForSegment,
  removeProjectSegment,
  reorderProjectSegment,
  segmentDurationMs,
  updateProjectSegment,
  type ClipEditorSegment,
  type MontageClipEditorProject,
} from './clip-project-model';
import { applyMontageSegmentTrim, trimSourceTimeFromPointerDelta, type MontageTrimEdge } from './montage-timeline-model';

type PreviewState = 'loading' | 'ready' | 'error';

export function MontageTimeline({
  project,
  selectedSegmentId,
  videoRefs,
  activeVideoSlot,
  onActiveVideoSlotChange,
  onPreviewStateChange,
  onSelectedSegmentChange,
  onProjectChange,
}: {
  project: MontageClipEditorProject;
  selectedSegmentId: string;
  videoRefs: readonly [RefObject<HTMLVideoElement | null>, RefObject<HTMLVideoElement | null>];
  activeVideoSlot: 0 | 1;
  onActiveVideoSlotChange: (slot: 0 | 1) => void;
  onPreviewStateChange: (state: PreviewState) => void;
  onSelectedSegmentChange: (segmentId: string) => void;
  onProjectChange: (project: MontageClipEditorProject) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const projectRef = useRef(project);
  const activeSlotRef = useRef(activeVideoSlot);
  const currentMsRef = useRef(0);
  const lastRenderedMsRef = useRef(0);
  const seekGenerationRef = useRef(0);
  const playbackFrameRef = useRef<number | null>(null);
  const transitioningRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const draggedSegmentIdRef = useRef<string | null>(null);
  const trimDragRef = useRef<{
    pointerId: number;
    segment: ClipEditorSegment;
    edge: MontageTrimEdge;
    startX: number;
    timelineWidth: number;
    durationMs: number;
  } | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [interaction, setInteraction] = useState<'idle' | 'scrubbing' | 'trimming'>('idle');

  projectRef.current = project;
  activeSlotRef.current = activeVideoSlot;

  const stopPlaybackFrame = useCallback(() => {
    if (playbackFrameRef.current === null) return;
    window.cancelAnimationFrame(playbackFrameRef.current);
    playbackFrameRef.current = null;
  }, []);

  const preloadNext = useCallback(async (segmentIndex: number, activeSlot: 0 | 1, segments = projectRef.current.segments) => {
    const next = segments[segmentIndex + 1];
    if (!next || next.unavailableReason) return;
    const preloadSlot = activeSlot === 0 ? 1 : 0;
    const video = videoRefs[preloadSlot].current;
    if (!video) return;
    try {
      await prepareVideo(video, next, next.trimStartMs, false);
    } catch {
      // The active source remains usable; the boundary switch will surface the error.
    }
  }, [videoRefs]);

  const seekMontage = useCallback(async (
    requestedMs: number,
    resumePlayback = false,
    segments = projectRef.current.segments,
  ) => {
    const mapping = mapMontageTime(segments, requestedMs);
    if (!mapping || mapping.segment.unavailableReason) {
      onPreviewStateChange('error');
      setPlaying(false);
      return;
    }
    const generation = ++seekGenerationRef.current;
    const activeVideo = videoRefs[activeSlotRef.current].current;
    const inactiveSlot = activeSlotRef.current === 0 ? 1 : 0;
    const inactiveVideo = videoRefs[inactiveSlot].current;
    const matchingActive = activeVideo?.dataset.clipId === mapping.segment.source.id;
    const matchingInactive = inactiveVideo?.dataset.clipId === mapping.segment.source.id;
    const targetSlot: 0 | 1 = matchingActive ? activeSlotRef.current : matchingInactive ? inactiveSlot : inactiveSlot;
    const targetVideo = videoRefs[targetSlot].current;
    if (!targetVideo) return;

    onPreviewStateChange('loading');
    videoRefs[0].current?.pause();
    videoRefs[1].current?.pause();
    try {
      await prepareVideo(targetVideo, mapping.segment, mapping.sourceTimeMs, false);
      if (generation !== seekGenerationRef.current) return;
      activeSlotRef.current = targetSlot;
      onActiveVideoSlotChange(targetSlot);
      onSelectedSegmentChange(mapping.segment.id);
      currentMsRef.current = Math.min(projectRef.current.durationMs, Math.max(0, requestedMs));
      lastRenderedMsRef.current = currentMsRef.current;
      setCurrentMs(currentMsRef.current);
      positionPlayhead(playheadRef.current, timelineRef.current, currentMsRef.current, projectRef.current.durationMs);
      targetVideo.muted = muted;
      targetVideo.volume = volume;
      onPreviewStateChange('ready');
      void preloadNext(mapping.segmentIndex, targetSlot, segments);
      if (resumePlayback) {
        await targetVideo.play();
        setPlaying(true);
      }
    } catch {
      if (generation === seekGenerationRef.current) {
        onPreviewStateChange('error');
        setPlaying(false);
      }
    }
  }, [muted, onActiveVideoSlotChange, onPreviewStateChange, onSelectedSegmentChange, preloadNext, videoRefs, volume]);

  const advancePlayback = useCallback(async () => {
    if (transitioningRef.current) return;
    const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
    if (!mapping) return;
    const next = projectRef.current.segments[mapping.segmentIndex + 1];
    if (!next) {
      setPlaying(false);
      currentMsRef.current = projectRef.current.durationMs;
      lastRenderedMsRef.current = currentMsRef.current;
      setCurrentMs(currentMsRef.current);
      positionPlayhead(playheadRef.current, timelineRef.current, currentMsRef.current, projectRef.current.durationMs);
      return;
    }
    transitioningRef.current = true;
    try {
      await seekMontage(mapping.montageEndMs, true);
    } finally {
      transitioningRef.current = false;
    }
  }, [seekMontage]);

  const tickPlayback = useCallback(() => {
    playbackFrameRef.current = null;
    const segments = projectRef.current.segments;
    const activeVideo = videoRefs[activeSlotRef.current].current;
    const mapping = mapMontageTime(segments, currentMsRef.current);
    if (!activeVideo || !mapping || activeVideo.paused) return;
    const sourceTimeMs = activeVideo.currentTime * 1_000;
    if (sourceTimeMs >= mapping.segment.trimEndMs - Math.max(8, 500 / Math.max(1, mapping.segment.source.fps || 30))) {
      void advancePlayback();
      return;
    }
    const nextMs = Math.min(mapping.montageEndMs, mapping.montageStartMs + sourceTimeMs - mapping.segment.trimStartMs);
    currentMsRef.current = nextMs;
    positionPlayhead(playheadRef.current, timelineRef.current, nextMs, projectRef.current.durationMs);
    if (Math.abs(nextMs - lastRenderedMsRef.current) >= 80) {
      lastRenderedMsRef.current = nextMs;
      setCurrentMs(nextMs);
    }
    playbackFrameRef.current = window.requestAnimationFrame(tickPlayback);
  }, [advancePlayback, videoRefs]);

  useEffect(() => {
    if (!playing) {
      stopPlaybackFrame();
      return;
    }
    if (playbackFrameRef.current === null) playbackFrameRef.current = window.requestAnimationFrame(tickPlayback);
    return stopPlaybackFrame;
  }, [playing, stopPlaybackFrame, tickPlayback]);

  useEffect(() => {
    const videos = videoRefs.map((ref) => ref.current).filter((video): video is HTMLVideoElement => Boolean(video));
    const continueAtBoundary = (event: Event) => {
      const video = event.currentTarget as HTMLVideoElement;
      if (video !== videoRefs[activeSlotRef.current].current) return;
      const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
      if (!mapping) return;
      const thresholdMs = Math.max(8, 500 / Math.max(1, mapping.segment.source.fps || 30));
      if (video.ended || video.currentTime * 1_000 >= mapping.segment.trimEndMs - thresholdMs) void advancePlayback();
    };
    for (const video of videos) {
      video.addEventListener('timeupdate', continueAtBoundary);
      video.addEventListener('ended', continueAtBoundary);
    }
    return () => {
      for (const video of videos) {
        video.removeEventListener('timeupdate', continueAtBoundary);
        video.removeEventListener('ended', continueAtBoundary);
      }
    };
  }, [advancePlayback, videoRefs]);

  useEffect(() => {
    void seekMontage(0, false);
    return () => {
      stopPlaybackFrame();
      for (const ref of videoRefs) {
        const video = ref.current;
        if (!video) continue;
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, []);

  useEffect(() => {
    const updateWidth = () => positionPlayhead(playheadRef.current, timelineRef.current, currentMsRef.current, project.durationMs);
    const timeline = timelineRef.current;
    if (!timeline) return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(timeline);
    updateWidth();
    return () => observer.disconnect();
  }, [project.durationMs]);

  const togglePlayback = async () => {
    const activeVideo = videoRefs[activeSlotRef.current].current;
    if (playing && activeVideo) {
      activeVideo.pause();
      setPlaying(false);
      return;
    }
    if (currentMsRef.current >= project.durationMs) await seekMontage(0, false);
    const video = videoRefs[activeSlotRef.current].current;
    if (!video) return;
    try {
      await video.play();
      setPlaying(true);
    } catch {
      onPreviewStateChange('error');
    }
  };

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
    void seekMontage(Math.round(ratio * projectRef.current.durationMs), false);
  };

  const beginScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    resumeAfterScrubRef.current = playing;
    videoRefs[activeSlotRef.current].current?.pause();
    setPlaying(false);
    setInteraction('scrubbing');
    capturePointer(event.currentTarget, event.pointerId);
    seekFromPointer(event);
  };

  const finishScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interaction !== 'scrubbing') return;
    seekFromPointer(event);
    releasePointer(event.currentTarget, event.pointerId);
    setInteraction('idle');
    if (resumeAfterScrubRef.current) void togglePlayback();
  };

  const beginTrim = (event: ReactPointerEvent<HTMLDivElement>, segment: ClipEditorSegment, edge: MontageTrimEdge) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    videoRefs[activeSlotRef.current].current?.pause();
    setPlaying(false);
    const width = timelineRef.current?.getBoundingClientRect().width ?? 1;
    trimDragRef.current = { pointerId: event.pointerId, segment, edge, startX: event.clientX, timelineWidth: width, durationMs: project.durationMs };
    setInteraction('trimming');
    capturePointer(event.currentTarget, event.pointerId);
  };

  const continueTrim = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = trimDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const initialSourceMs = drag.edge === 'start' ? drag.segment.trimStartMs : drag.segment.trimEndMs;
    const requested = trimSourceTimeFromPointerDelta(drag.edge, initialSourceMs, event.clientX - drag.startX, drag.timelineWidth, drag.durationMs);
    const nextProject = updateProjectSegment(projectRef.current, drag.segment.id, (segment) => applyMontageSegmentTrim(segment, drag.edge, requested));
    projectRef.current = nextProject;
    onProjectChange(nextProject);
  };

  const finishTrim = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!trimDragRef.current) return;
    continueTrim(event);
    const segmentId = trimDragRef.current.segment.id;
    releasePointer(event.currentTarget, event.pointerId);
    trimDragRef.current = null;
    setInteraction('idle');
    void seekMontage(montageStartForSegment(projectRef.current.segments, segmentId), false);
  };

  const keyboardTrim = (event: ReactKeyboardEvent<HTMLDivElement>, segment: ClipEditorSegment, edge: MontageTrimEdge) => {
    const step = Math.max(1, Math.round(1_000 / Math.max(1, segment.source.fps || 30)));
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const current = edge === 'start' ? segment.trimStartMs : segment.trimEndMs;
    const nextProject = updateProjectSegment(projectRef.current, segment.id, (currentSegment) => applyMontageSegmentTrim(currentSegment, edge, current + direction * step));
    projectRef.current = nextProject;
    onProjectChange(nextProject);
  };

  const moveSegment = (activeId: string, overId: string) => {
    const nextProject = reorderProjectSegment(projectRef.current, activeId, overId);
    if (nextProject === projectRef.current) return;
    projectRef.current = nextProject;
    onProjectChange(nextProject);
    onSelectedSegmentChange(activeId);
    void seekMontage(montageStartForSegment(nextProject.segments, activeId), false, nextProject.segments);
  };

  const removeSegment = (segmentId: string) => {
    if (projectRef.current.segments.length <= 1) return;
    const removedIndex = projectRef.current.segments.findIndex((segment) => segment.id === segmentId);
    const nextProject = removeProjectSegment(projectRef.current, segmentId);
    const nextSelected = nextProject.segments[Math.min(Math.max(0, removedIndex), nextProject.segments.length - 1)]!;
    projectRef.current = nextProject;
    onProjectChange(nextProject);
    onSelectedSegmentChange(nextSelected.id);
    void seekMontage(montageStartForSegment(nextProject.segments, nextSelected.id), false, nextProject.segments);
  };

  const selectedIndex = project.segments.findIndex((segment) => segment.id === selectedSegmentId);

  return (
    <section className="montage-timeline" aria-label="Montage timeline" data-interaction={interaction} data-playing={playing || undefined}>
      <div className="montage-transport">
        <output className="montage-timecode" aria-label={`Current montage time ${formatTimelineTime(currentMs)}`}>{formatTimelineTime(currentMs)}</output>
        <span className="montage-duration">/ {formatTimelineTime(project.durationMs)}</span>
        <Separator orientation="vertical" className="h-5" />
        <TransportButton label="Previous clip" icon={SkipBack} disabled={selectedIndex <= 0} onClick={() => {
          const segment = project.segments[Math.max(0, selectedIndex - 1)];
          if (segment) void seekMontage(montageStartForSegment(project.segments, segment.id), false);
        }} />
        <TransportButton label={playing ? 'Pause' : 'Play montage'} icon={playing ? Pause : Play} primary onClick={() => void togglePlayback()} />
        <TransportButton label="Next clip" icon={SkipForward} disabled={selectedIndex < 0 || selectedIndex >= project.segments.length - 1} onClick={() => {
          const segment = project.segments[Math.min(project.segments.length - 1, selectedIndex + 1)];
          if (segment) void seekMontage(montageStartForSegment(project.segments, segment.id), false);
        }} />
        <Separator orientation="vertical" className="h-5" />
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={muted ? 'Unmute montage preview' : 'Mute montage preview'} onClick={() => {
          const next = !muted;
          setMuted(next);
          for (const ref of videoRefs) if (ref.current) ref.current.muted = next;
        }}>{muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}</Button>
        <Slider className="montage-volume" min={0} max={100} step={1} value={[Math.round(volume * 100)]} aria-label="Montage preview volume" onValueChange={([next]) => {
          if (typeof next !== 'number') return;
          const value = next / 100;
          setVolume(value);
          for (const ref of videoRefs) if (ref.current) ref.current.volume = value;
        }} />
        <span className="montage-transport__summary">{project.segments.length} {project.segments.length === 1 ? 'clip' : 'clips'} · cuts preview continuously</span>
      </div>

      <div ref={timelineRef} className="montage-timeline__surface" data-testid="montage-timeline-surface">
        <div className="montage-segments" role="list" aria-label="Montage clip order">
          {project.segments.map((segment, index) => {
            const width = project.durationMs > 0 ? segmentDurationMs(segment) / project.durationMs * 100 : 100 / project.segments.length;
            const selected = segment.id === selectedSegmentId;
            return (
              <div key={segment.id} className="montage-segment-slot" style={{ width: `${width}%` }} role="listitem">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      draggable
                      className="montage-segment"
                      data-selected={selected || undefined}
                      data-unavailable={segment.unavailableReason ? true : undefined}
                      aria-label={`${segment.source.name}, position ${index + 1} of ${project.segments.length}`}
                      aria-pressed={selected}
                      onClick={() => void seekMontage(montageStartForSegment(project.segments, segment.id), false)}
                      onDragStart={(event: ReactDragEvent<HTMLButtonElement>) => {
                        draggedSegmentIdRef.current = segment.id;
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', segment.id);
                      }}
                      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const activeId = draggedSegmentIdRef.current ?? event.dataTransfer.getData('text/plain');
                        if (activeId) moveSegment(activeId, segment.id);
                        draggedSegmentIdRef.current = null;
                      }}
                    >
                      <GripVertical aria-hidden="true" />
                      <span><em>{index + 1}</em>{segment.source.name}</span>
                      <small>{formatTimelineTime(segmentDurationMs(segment))}</small>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem disabled={index === 0} onSelect={() => {
                      const previous = project.segments[index - 1];
                      if (previous) moveSegment(segment.id, previous.id);
                    }}>Move earlier</ContextMenuItem>
                    <ContextMenuItem disabled={index === project.segments.length - 1} onSelect={() => {
                      const next = project.segments[index + 1];
                      if (next) moveSegment(segment.id, next.id);
                    }}>Move later</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-destructive focus:text-destructive" disabled={project.segments.length <= 1} onSelect={() => removeSegment(segment.id)}>
                      <Trash2 className="size-3.5" /> Remove from montage
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                <div className="montage-segment-trim" data-selected={selected || undefined}>
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label={`${segment.source.name} trim start`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(0, segment.trimEndMs - 100)}
                    aria-valuenow={segment.trimStartMs}
                    className="montage-trim-handle is-start"
                    onKeyDown={(event) => keyboardTrim(event, segment, 'start')}
                    onPointerDown={(event) => beginTrim(event, segment, 'start')}
                    onPointerMove={continueTrim}
                    onPointerUp={finishTrim}
                    onPointerCancel={() => { trimDragRef.current = null; setInteraction('idle'); }}
                  />
                  <span aria-hidden="true" />
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label={`${segment.source.name} trim end`}
                    aria-valuemin={segment.trimStartMs + 100}
                    aria-valuemax={segment.source.durationMs}
                    aria-valuenow={segment.trimEndMs}
                    className="montage-trim-handle is-end"
                    onKeyDown={(event) => keyboardTrim(event, segment, 'end')}
                    onPointerDown={(event) => beginTrim(event, segment, 'end')}
                    onPointerMove={continueTrim}
                    onPointerUp={finishTrim}
                    onPointerCancel={() => { trimDragRef.current = null; setInteraction('idle'); }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Montage playhead"
          aria-valuemin={0}
          aria-valuemax={project.durationMs}
          aria-valuenow={Math.round(currentMs)}
          className="montage-scrub"
          onKeyDown={(event) => {
            const step = event.key === 'ArrowLeft' ? -33 : event.key === 'ArrowRight' ? 33 : 0;
            if (!step) return;
            event.preventDefault();
            void seekMontage(currentMsRef.current + step, false);
          }}
          onPointerDown={beginScrub}
          onPointerMove={(event) => { if (interaction === 'scrubbing') seekFromPointer(event); }}
          onPointerUp={finishScrub}
          onPointerCancel={() => setInteraction('idle')}
        ><span aria-hidden="true" /></div>
        <div ref={playheadRef} className="montage-playhead" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
}

function TransportButton({ label, icon: Icon, primary = false, disabled, onClick }: {
  label: string;
  icon: typeof Play;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={primary ? 'primary' : 'ghost'} size="icon" className={primary ? 'size-8' : 'size-7'} aria-label={label} disabled={disabled} onClick={onClick}>
          <Icon className={primary ? 'size-4' : 'size-3.5'} aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

async function prepareVideo(video: HTMLVideoElement, segment: ClipEditorSegment, sourceTimeMs: number, autoplay: boolean): Promise<void> {
  if (video.dataset.clipId !== segment.source.id) {
    video.dataset.clipId = segment.source.id;
    video.src = `switchboard-media://clip/${encodeURIComponent(segment.source.id)}`;
    video.preload = 'auto';
    video.load();
  }
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) await waitForVideoMetadata(video);
  video.currentTime = Math.min(segment.trimEndMs, Math.max(segment.trimStartMs, sourceTimeMs)) / 1_000;
  if (autoplay) await video.play();
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Preview source could not be decoded.')); };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', finish);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('loadedmetadata', finish, { once: true });
    video.addEventListener('error', fail, { once: true });
  });
}

function positionPlayhead(playhead: HTMLDivElement | null, timeline: HTMLDivElement | null, currentMs: number, durationMs: number): void {
  if (!playhead || !timeline) return;
  const width = timeline.getBoundingClientRect().width;
  const offset = durationMs > 0 ? Math.min(1, Math.max(0, currentMs / durationMs)) * width : 0;
  playhead.style.transform = `translate3d(${offset}px, 0, 0)`;
}

function formatTimelineTime(milliseconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor(totalMilliseconds / 60_000) % 60;
  const seconds = Math.floor(totalMilliseconds / 1_000) % 60;
  const millis = totalMilliseconds % 1_000;
  const base = `${hours > 0 ? `${hours}:` : ''}${hours > 0 ? String(minutes).padStart(2, '0') : minutes}:${String(seconds).padStart(2, '0')}`;
  return `${base}.${String(millis).padStart(3, '0')}`;
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  try { element.setPointerCapture(pointerId); } catch { }
}

function releasePointer(element: HTMLElement, pointerId: number): void {
  try { if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId); } catch { }
}
