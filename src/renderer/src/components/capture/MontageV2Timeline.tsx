import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Copy,
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

const basePixelsPerSecond = 72;

export function MontageV2Timeline({
  project,
  clips,
  selectedSegmentId,
  currentMs,
  zoom,
  waveform,
  canUndo,
  canRedo,
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
  const draggedSegmentIdRef = useRef<string | null>(null);
  const trimRef = useRef<{
    pointerId: number;
    startX: number;
    segment: MontageV2Segment;
    edge: 'start' | 'end';
  } | null>(null);
  const musicDragRef = useRef<{ pointerId: number; startX: number; startMs: number } | null>(null);
  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);
  const pixelsPerMs = basePixelsPerSecond * zoom / 1_000;
  const width = Math.max(720, project.durationMs * pixelsPerMs);
  const selected = project.segments.find((segment) => segment.id === selectedSegmentId);
  const rulerTicks = useMemo(() => createRulerTicks(project.durationMs, pixelsPerMs), [pixelsPerMs, project.durationMs]);

  const fitTimeline = () => {
    const viewportWidth = viewportRef.current?.clientWidth ?? 720;
    const next = viewportWidth / Math.max(1, project.durationMs) * 1_000 / basePixelsPerSecond;
    onZoomChange(clamp(next, 0.25, 4));
  };

  const continueTrim = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = trimRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaMs = Math.round((event.clientX - drag.startX) / pixelsPerMs);
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
    if (event.button !== 0) return;
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
          <ToolbarButton label="Split at playhead" icon={Scissors} disabled={!selected || segmentDurationMs(selected) < 200} onClick={onSplit} />
          <ToolbarButton label="Duplicate segment" icon={Copy} disabled={!selected} onClick={onDuplicate} />
          <ToolbarButton label="Remove segment" icon={Trash2} disabled={!selected || project.segments.length <= 1} onClick={onRemove} />
        </div>
        <div className="montage-v2-timeline__zoom">
          <ToolbarButton label="Zoom out" icon={ZoomOut} disabled={zoom <= 0.25} onClick={() => onZoomChange(clamp(zoom / 1.25, 0.25, 4))} />
          <button type="button" className="montage-v2-fit" onClick={fitTimeline}>Fit</button>
          <output aria-label={`Timeline zoom ${Math.round(zoom * 100)} percent`}>{Math.round(zoom * 100)}%</output>
          <ToolbarButton label="Zoom in" icon={ZoomIn} disabled={zoom >= 4} onClick={() => onZoomChange(clamp(zoom * 1.25, 0.25, 4))} />
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
            <div className="montage-v2-ruler" onPointerDown={seekFromSurface}>
              {rulerTicks.map((tick) => (
                <span key={tick.timeMs} style={{ left: `${tick.timeMs * pixelsPerMs}px` }} data-major={tick.major || undefined}>
                  {tick.major ? <em>{formatTimecode(tick.timeMs, false)}</em> : null}
                </span>
              ))}
            </div>

            <div className="montage-v2-video-lane" role="list" aria-label="Video segments">
              {project.segments.map((segment, index) => {
                const clip = clipsById.get(segment.clipId);
                const segmentWidth = Math.max(8, segmentDurationMs(segment) * pixelsPerMs);
                const isSelected = segment.id === selectedSegmentId;
                return (
                  <div
                    key={segment.id}
                    className="montage-v2-segment-slot"
                    style={{ width: `${segmentWidth}px` }}
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
                      onClick={() => {
                        onSelectSegment(segment.id);
                        onSeek(montageStartForSegment(project.segments, segment.id));
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
                        trimRef.current = { pointerId: event.pointerId, startX: event.clientX, segment, edge: 'start' };
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
                        trimRef.current = { pointerId: event.pointerId, startX: event.clientX, segment, edge: 'end' };
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

            <div className="montage-v2-music-lane" onPointerDown={project.music ? undefined : seekFromSurface}>
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
                <button type="button" className="montage-v2-music-empty" onClick={onAddMusic}>
                  Import music from your computer
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
    ticks.push({ timeMs, major: index % majorEvery === 0 });
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
