import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Copy,
  Music2,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Clip } from '../../../../shared/contracts';
import type { MontageAudioWaveform, MontageProjectV2, MontageV2Segment } from '../../../../shared/montage-v2';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  montageStartForSegment,
  musicTimelineDurationMs,
  reorderMontageSegment,
  segmentDurationMs,
  updateMontageMusic,
  updateMontageSegment,
} from './montage-v2-model';

export function MontageV2Timeline({
  project,
  clips,
  selectedSegmentId,
  currentMs,
  zoom,
  waveform,
  canUndo,
  canRedo,
  musicPending,
  onEditMusic,
  onZoomChange,
  onProjectChange,
  onSelectSegment,
  onSeek,
  onAddClips,
  onAddMusic,
  onDuplicate,
  onSplit,
  onRemove,
  onUndo,
  onRedo,
}: {
  project: MontageProjectV2;
  clips: readonly Clip[];
  selectedSegmentId: string;
  currentMs: number;
  zoom: number;
  waveform: MontageAudioWaveform | null;
  canUndo: boolean;
  canRedo: boolean;
  musicPending: boolean;
  onEditMusic: () => void;
  onZoomChange: (zoom: number) => void;
  onProjectChange: (project: MontageProjectV2, mergeKey?: string) => void;
  onSelectSegment: (segmentId: string) => void;
  onSeek: (timeMs: number) => void;
  onAddClips: () => void;
  onAddMusic: () => void;
  onDuplicate: () => void;
  onSplit: () => void;
  onRemove: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1);
  const scrubPointerRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setViewportWidth(Math.max(1, viewport.clientWidth - 2));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const draggedSegmentIdRef = useRef<string | null>(null);
  const trimRef = useRef<{
    pointerId: number;
    startX: number;
    segment: MontageV2Segment;
    edge: 'start' | 'end';
    pixelsPerMs: number;
  } | null>(null);
  const musicDragRef = useRef<{ pointerId: number; startX: number; startMs: number } | null>(null);
  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);
  // 1x always means the entire sequence, including after resizing or editing.
  const width = viewportWidth * zoom;
  const pixelsPerMs = width / Math.max(1, project.durationMs);
  const selected = project.segments.find((segment) => segment.id === selectedSegmentId);
  const rulerTicks = useMemo(() => createRulerTicks(project.durationMs, pixelsPerMs), [pixelsPerMs, project.durationMs]);

  const fitTimeline = () => {
    onZoomChange(1);
    if (viewportRef.current) viewportRef.current.scrollLeft = 0;
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (zoom === 1) { viewport.scrollLeft = 0; return; }
    const x = currentMs * pixelsPerMs;
    if (x < viewport.scrollLeft || x > viewport.scrollLeft + viewport.clientWidth - 12) {
      viewport.scrollLeft = Math.max(0, x - viewport.clientWidth * 0.2);
    }
  }, [currentMs, pixelsPerMs, zoom]);

  const continueTrim = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = trimRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaMs = Math.round((event.clientX - drag.startX) / drag.pixelsPerMs);
    const requested = (drag.edge === 'start' ? drag.segment.trimStartMs : drag.segment.trimEndMs) + deltaMs;
    const next = updateMontageSegment(project, drag.segment.id, (segment) => drag.edge === 'start'
      ? { ...segment, trimStartMs: requested }
      : { ...segment, trimEndMs: requested });
    onProjectChange(next, `trim:${drag.segment.id}:${drag.edge}`);
  };

  const finishTrim = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!trimRef.current || trimRef.current.pointerId !== event.pointerId) return;
    continueTrim(event);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { }
    trimRef.current = null;
  };

  const continueMusicDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = musicDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !project.music) return;
    const deltaMs = Math.round((event.clientX - drag.startX) / pixelsPerMs);
    onProjectChange(
      updateMontageMusic(project, (track) => ({ ...track, timelineStartMs: drag.startMs + deltaMs })),
      'music:position',
    );
  };

  const seekFromSurface = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(clamp((event.clientX - rect.left) / pixelsPerMs, 0, project.durationMs));
  };

  return (
    <section className="montage-v2-timeline" aria-label="Montage timeline">
      <div className="montage-v2-timeline__toolbar">
        <div className="montage-v2-timeline__tools">
          <ToolbarButton label="Undo" icon={Undo2} disabled={!canUndo} onClick={onUndo} />
          <ToolbarButton label="Redo" icon={Redo2} disabled={!canRedo} onClick={onRedo} />
          <span className="montage-v2-toolbar-divider" aria-hidden="true" />
          <Button type="button" variant="secondary" size="sm" onClick={onAddClips}>
            <Plus className="size-3.5" /> Add clips
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={musicPending} onClick={project.music ? onEditMusic : onAddMusic}>
            <Music2 className="size-3.5" /> {musicPending ? 'Importing…' : project.music ? 'Music settings' : 'Add music'}
          </Button>
          <ToolbarButton label="Split at playhead" icon={Scissors} disabled={!selected || segmentDurationMs(selected) < 200} onClick={onSplit} />
          <ToolbarButton label="Duplicate segment" icon={Copy} disabled={!selected} onClick={onDuplicate} />
          <ToolbarButton label="Remove segment" icon={Trash2} disabled={!selected || project.segments.length <= 1} onClick={onRemove} />
        </div>
        <div className="montage-v2-timeline__zoom">
          <ToolbarButton label="Zoom out" icon={ZoomOut} disabled={zoom <= 1} onClick={() => onZoomChange(clamp(zoom / 1.5, 1, 32))} />
          <button type="button" className="montage-v2-fit" aria-pressed={zoom === 1} onClick={fitTimeline}>Fit</button>
          <output aria-label={`Timeline zoom ${zoom.toFixed(1)} times fit`}>{zoom === 1 ? 'Full' : `${zoom.toFixed(1)}×`}</output>
          <ToolbarButton label="Zoom in" icon={ZoomIn} disabled={zoom >= 32} onClick={() => onZoomChange(clamp(zoom * 1.5, 1, 32))} />
        </div>
      </div>

      <div className="montage-v2-timeline__desk">
        <div className="montage-v2-lane-labels" aria-hidden="true">
          <div className="montage-v2-ruler-label">Timeline</div>
          <div><strong>Video</strong><span>{project.segments.length} segments</span></div>
          <div><strong>Music</strong><span>{project.music ? 'Imported audio' : 'Empty lane'}</span></div>
        </div>
        <div ref={viewportRef} className="montage-v2-timeline__viewport">
          <div className="montage-v2-timeline__content" style={{ width: `${width}px` }}>
            <div className="montage-v2-ruler" role="slider" tabIndex={0} aria-label="Montage playhead"
              aria-valuemin={0} aria-valuemax={project.durationMs} aria-valuenow={Math.round(currentMs)} aria-valuetext={formatTimecode(currentMs, true)}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                scrubPointerRef.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                seekFromSurface(event);
              }}
              onPointerMove={(event) => { if (scrubPointerRef.current === event.pointerId) seekFromSurface(event); }}
              onPointerUp={(event) => { scrubPointerRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
              onPointerCancel={() => { scrubPointerRef.current = null; }}
              onKeyDown={(event) => {
                const delta = event.shiftKey ? 1000 : 100;
                const time = event.key === 'Home' ? 0 : event.key === 'End' ? project.durationMs : event.key === 'ArrowLeft' ? currentMs - delta : event.key === 'ArrowRight' ? currentMs + delta : null;
                if (time === null) return;
                event.preventDefault();
                event.stopPropagation();
                onSeek(clamp(time, 0, project.durationMs));
              }}>
              {rulerTicks.map((tick) => (
                <span key={tick.timeMs} style={{ left: `${tick.timeMs * pixelsPerMs}px` }} data-end={tick.timeMs === project.durationMs || undefined} data-major={tick.major || undefined}>
                  {tick.major ? <em>{formatTimecode(tick.timeMs, false)}</em> : null}
                </span>
              ))}
            </div>

            <div className="montage-v2-video-lane" role="list" aria-label="Video segments">
              {project.segments.map((segment, index) => {
                const clip = clipsById.get(segment.clipId);
                const segmentWidth = segmentDurationMs(segment) * pixelsPerMs;
                const isSelected = segment.id === selectedSegmentId;
                return (
                  <div
                    key={segment.id}
                    className="montage-v2-segment-slot"
                    style={{ width: `${segmentWidth}px` }} data-compact={segmentWidth < 70 || undefined}
                    role="listitem"
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const activeId = draggedSegmentIdRef.current ?? event.dataTransfer.getData('text/plain');
                      draggedSegmentIdRef.current = null;
                      if (!activeId) return;
                      const next = reorderMontageSegment(project, activeId, segment.id);
                      onProjectChange(next);
                      onSelectSegment(activeId);
                    }}
                  >
                    <button
                      type="button"
                      draggable
                      className="montage-v2-segment"
                      data-selected={isSelected || undefined}
                      data-missing={!clip || undefined}
                      aria-label={`${clip?.name ?? 'Missing clip'}, segment ${index + 1} of ${project.segments.length}`}
                      aria-pressed={isSelected}
                      title={`${index + 1}. ${clip?.name ?? 'Missing clip'} · ${formatTimecode(segmentDurationMs(segment), true)}`}
                      onClick={() => {
                        onSelectSegment(segment.id);
                        onSeek(montageStartForSegment(project.segments, segment.id));
                      }}
                      onKeyDown={(event) => {
                        if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                        const target = project.segments[index + (event.key === 'ArrowLeft' ? -1 : 1)];
                        if (!target) return;
                        event.preventDefault();
                        onProjectChange(reorderMontageSegment(project, segment.id, target.id));
                        onSelectSegment(segment.id);
                      }}
                      onDragStart={(event) => {
                        draggedSegmentIdRef.current = segment.id;
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', segment.id);
                      }}
                      style={clip ? { backgroundImage: `url("switchboard-media://thumbnail/${encodeURIComponent(clip.id)}")` } : undefined}
                    >
                      <span className="montage-v2-segment__shade" aria-hidden="true" />
                      <span className="montage-v2-segment__index">{index + 1}</span>
                      <strong>{clip?.name ?? 'Missing clip'}</strong>
                      <small>{formatTimecode(segmentDurationMs(segment), true)}</small>
                    </button>
                    <div
                      className="montage-v2-trim-handle is-start"
                      role="slider"
                      tabIndex={0}
                      aria-label={`${clip?.name ?? 'Clip'} trim start`}
                      aria-valuemin={0}
                      aria-valuemax={Math.max(0, segment.trimEndMs - 100)}
                      aria-valuenow={segment.trimStartMs}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        trimRef.current = { pointerId: event.pointerId, startX: event.clientX, segment, edge: 'start', pixelsPerMs };
                        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { }
                      }}
                      onPointerMove={continueTrim}
                      onPointerUp={finishTrim}
                      onPointerCancel={() => { trimRef.current = null; }}
                      onKeyDown={(event) => {
                        const delta = event.key === 'ArrowLeft' ? -33 : event.key === 'ArrowRight' ? 33 : 0;
                        if (!delta) return;
                        event.preventDefault();
                        onProjectChange(updateMontageSegment(project, segment.id, (current) => ({ ...current, trimStartMs: current.trimStartMs + delta })), `trim:${segment.id}:start`);
                      }}
                    />
                    <div
                      className="montage-v2-trim-handle is-end"
                      role="slider"
                      tabIndex={0}
                      aria-label={`${clip?.name ?? 'Clip'} trim end`}
                      aria-valuemin={segment.trimStartMs + 100}
                      aria-valuemax={segment.sourceDurationMs}
                      aria-valuenow={segment.trimEndMs}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        trimRef.current = { pointerId: event.pointerId, startX: event.clientX, segment, edge: 'end', pixelsPerMs };
                        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { }
                      }}
                      onPointerMove={continueTrim}
                      onPointerUp={finishTrim}
                      onPointerCancel={() => { trimRef.current = null; }}
                      onKeyDown={(event) => {
                        const delta = event.key === 'ArrowLeft' ? -33 : event.key === 'ArrowRight' ? 33 : 0;
                        if (!delta) return;
                        event.preventDefault();
                        onProjectChange(updateMontageSegment(project, segment.id, (current) => ({ ...current, trimEndMs: current.trimEndMs + delta })), `trim:${segment.id}:end`);
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="montage-v2-music-lane">
              {project.music ? (
                <button
                  type="button"
                  className="montage-v2-music-clip"
                  style={{
                    left: `${project.music.timelineStartMs * pixelsPerMs}px`,
                    width: `${Math.max(12, musicTimelineDurationMs(project.music, project.durationMs) * pixelsPerMs)}px`,
                  }}
                  data-muted={project.music.muted || project.music.volume <= 0 || undefined}
                  aria-label={`${project.music.asset.name} music track. Drag to change its timeline position.`}
                  onDoubleClick={onEditMusic}
                  onKeyDown={(event) => {
                    const delta = event.key === 'ArrowLeft' ? -100 : event.key === 'ArrowRight' ? 100 : 0;
                    if (!delta) return;
                    event.preventDefault();
                    onProjectChange(updateMontageMusic(project, (track) => ({ ...track, timelineStartMs: track.timelineStartMs + delta * (event.shiftKey ? 10 : 1) })), 'music:position');
                  }}
                  onClick={() => onSeek(project.music?.timelineStartMs ?? 0)}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || !project.music) return;
                    event.stopPropagation();
                    musicDragRef.current = {
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startMs: project.music.timelineStartMs,
                    };
                    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { }
                  }}
                  onPointerMove={continueMusicDrag}
                  onPointerUp={(event) => {
                    continueMusicDrag(event);
                    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { }
                    musicDragRef.current = null;
                  }}
                  onPointerCancel={() => { musicDragRef.current = null; }}
                >
                  <span className="montage-v2-waveform" aria-hidden="true">
                    {(waveform?.samples ?? []).map((sample, index) => (
                      <i key={index} style={{ height: `${Math.max(4, sample * 90)}%` }} />
                    ))}
                  </span>
                  <strong>{project.music.asset.name}</strong>
                  <small>{project.music.loop ? 'Looping' : formatTimecode(project.music.sourceEndMs - project.music.sourceStartMs, true)}</small>
                </button>
              ) : (
                <button type="button" className="montage-v2-music-empty" disabled={musicPending} onClick={onAddMusic}>
                  <Music2 aria-hidden="true" /> {musicPending ? 'Importing audio…' : 'Add music from your computer'}
                </button>
              )}
            </div>

            <div className="montage-v2-playhead" style={{ left: `${currentMs * pixelsPerMs}px` }} aria-hidden="true"><span /></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ToolbarButton({ label, icon: Icon, disabled, onClick }: {
  label: string;
  icon: typeof Undo2;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={label} disabled={disabled} onClick={onClick}>
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function createRulerTicks(durationMs: number, pixelsPerMs: number): Array<{ timeMs: number; major: boolean }> {
  const targetMinorPixels = 18;
  const candidates = [100, 250, 500, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000];
  const interval = candidates.find((candidate) => candidate * pixelsPerMs >= targetMinorPixels) ?? 120_000;
  const majorEvery = interval < 1_000 ? 5 : interval < 10_000 ? 5 : interval < 60_000 ? 3 : 2;
  const ticks: Array<{ timeMs: number; major: boolean }> = [];
  for (let timeMs = 0, index = 0; timeMs <= durationMs; timeMs += interval, index += 1) {
    ticks.push({ timeMs, major: index % majorEvery === 0 && (timeMs === 0 || timeMs === durationMs || (durationMs - timeMs) * pixelsPerMs >= 72) });
    if (ticks.length >= 300) break;
  }
  if (ticks.at(-1)?.timeMs !== durationMs) ticks.push({ timeMs: durationMs, major: true });
  return ticks;
}

function formatTimecode(milliseconds: number, compact: boolean): string {
  const totalMs = Math.max(0, Math.round(milliseconds));
  const totalSeconds = Math.floor(totalMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = totalMs % 1_000;
  if (compact) return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
