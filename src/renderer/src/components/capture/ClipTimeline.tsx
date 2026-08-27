import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { FastForward, Pause, Play, Rewind, Save, Scissors, SkipBack, SkipForward, Undo2, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/format';
import {
  applyPlayheadKeyboard,
  applyTimelineInteraction,
  applyTrimKeyboard,
  chooseTimelineTickInterval,
  minimumClipDurationMs,
  timeFromTimelinePoint,
  type TimelineInteraction,
  type TimelineValues,
} from './clip-timeline-model';
import './clip-editor.css';

export function ClipTimeline({
  videoRef,
  durationMs,
  fps,
  startMs,
  endMs,
  dirty,
  savePending,
  onChange,
  onSave,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  durationMs: number;
  fps: number;
  startMs: number;
  endMs: number;
  dirty: boolean;
  savePending: boolean;
  onChange: (startMs: number, endMs: number) => void;
  onSave: () => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const currentMsRef = useRef(startMs);
  const interactionRef = useRef<TimelineInteraction>('idle');
  const resumeAfterScrubRef = useRef(false);
  const playbackModeRef = useRef<'selection' | 'free'>('selection');
  const [currentMs, setCurrentMs] = useState(startMs);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [interaction, setInteractionState] = useState<TimelineInteraction>('idle');
  const [timelineWidth, setTimelineWidth] = useState(720);
  const frameMs = Math.max(1, 1_000 / Math.max(1, fps));

  const setPlayhead = useCallback((nextMs: number) => {
    const boundedMs = Math.min(durationMs, Math.max(0, Math.round(nextMs)));
    currentMsRef.current = boundedMs;
    setCurrentMs(boundedMs);
    const video = videoRef.current;
    if (video) video.currentTime = boundedMs / 1_000;
  }, [durationMs, videoRef]);

  const setInteraction = (next: TimelineInteraction) => {
    interactionRef.current = next;
    setInteractionState(next);
  };

  const values = useCallback((): TimelineValues => ({
    currentMs: currentMsRef.current,
    startMs,
    endMs,
    durationMs,
  }), [durationMs, endMs, startMs]);

  const timeAtPointer = (clientX: number) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    return rect ? timeFromTimelinePoint(clientX, rect.left, rect.width, durationMs) : currentMsRef.current;
  };

  const scrubToPointer = (clientX: number) => {
    const next = applyTimelineInteraction('scrubbing', timeAtPointer(clientX), values());
    setPlayhead(next.currentMs);
  };

  const trimStartToPointer = (clientX: number) => {
    const next = applyTimelineInteraction('dragging-trim-start', timeAtPointer(clientX), values());
    onChange(next.startMs, next.endMs);
  };

  const trimEndToPointer = (clientX: number) => {
    const next = applyTimelineInteraction('dragging-trim-end', timeAtPointer(clientX), values());
    onChange(next.startMs, next.endMs);
  };

  const beginScrubbing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button > 0 || event.isPrimary === false) return;
    event.preventDefault();
    const video = videoRef.current;
    resumeAfterScrubRef.current = Boolean(video && !video.paused);
    if (video && !video.paused) video.pause();
    playbackModeRef.current = 'free';
    setInteraction('scrubbing');
    capturePointer(event.currentTarget, event.pointerId);
    scrubToPointer(event.clientX);
  };

  const continueScrubbing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current !== 'scrubbing') return;
    scrubToPointer(event.clientX);
  };

  const finishScrubbing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current !== 'scrubbing') return;
    scrubToPointer(event.clientX);
    releasePointer(event.currentTarget, event.pointerId);
    setInteraction('idle');
    if (resumeAfterScrubRef.current) void videoRef.current?.play().catch(() => undefined);
    resumeAfterScrubRef.current = false;
  };

  const beginTrimStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button > 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    setInteraction('dragging-trim-start');
    capturePointer(event.currentTarget, event.pointerId);
  };

  const continueTrimStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current !== 'dragging-trim-start') return;
    trimStartToPointer(event.clientX);
  };

  const finishTrimStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current !== 'dragging-trim-start') return;
    trimStartToPointer(event.clientX);
    releasePointer(event.currentTarget, event.pointerId);
    setInteraction('idle');
  };

  const beginTrimEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button > 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    setInteraction('dragging-trim-end');
    capturePointer(event.currentTarget, event.pointerId);
  };

  const continueTrimEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current !== 'dragging-trim-end') return;
    trimEndToPointer(event.clientX);
  };

  const finishTrimEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current !== 'dragging-trim-end') return;
    trimEndToPointer(event.clientX);
    releasePointer(event.currentTarget, event.pointerId);
    setInteraction('idle');
  };

  const cancelPointerInteraction = () => {
    resumeAfterScrubRef.current = false;
    setInteraction('idle');
  };

  const updateTrimFromKeyboard = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    kind: 'dragging-trim-start' | 'dragging-trim-end',
  ) => {
    const next = applyTrimKeyboard(kind, event.key, values(), 100);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(next.startMs, next.endMs);
  };

  const updatePlayheadFromKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = applyPlayheadKeyboard(event.key, values(), frameMs);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    playbackModeRef.current = 'free';
    setPlayhead(next.currentMs);
  };

  const seekBy = (deltaMs: number) => {
    playbackModeRef.current = 'free';
    setPlayhead(currentMsRef.current + deltaMs);
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    playbackModeRef.current = 'selection';
    const activeMs = currentMsRef.current;
    if (activeMs < startMs || activeMs >= endMs) setPlayhead(startMs);
    void video.play().catch(() => undefined);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (video) video.muted = !video.muted;
  };

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const updateWidth = () => setTimelineWidth(timeline.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(timeline);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateTime = () => {
      const nextMs = Math.min(durationMs, Math.max(0, video.currentTime * 1_000));
      if (!video.paused && playbackModeRef.current === 'selection' && nextMs >= endMs) {
        video.pause();
        setPlayhead(endMs);
        return;
      }
      currentMsRef.current = nextMs;
      setCurrentMs(nextMs);
    };
    const updatePlayback = () => setPlaying(!video.paused);
    const updateVolume = () => setMuted(video.muted || video.volume === 0);
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('play', updatePlayback);
    video.addEventListener('pause', updatePlayback);
    video.addEventListener('ended', updatePlayback);
    video.addEventListener('volumechange', updateVolume);
    updatePlayback();
    updateVolume();
    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('play', updatePlayback);
      video.removeEventListener('pause', updatePlayback);
      video.removeEventListener('ended', updatePlayback);
      video.removeEventListener('volumechange', updateVolume);
    };
  }, [durationMs, endMs, setPlayhead, videoRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('button, input, textarea, select, [role="slider"]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seekBy(-5_000);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seekBy(5_000);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const ruler = useMemo(() => {
    if (durationMs <= 0) return [];
    const majorInterval = chooseTimelineTickInterval(durationMs, timelineWidth);
    const minorInterval = majorInterval / 4;
    const marks: Array<{ ms: number; major: boolean }> = [];
    for (let ms = 0; ms < durationMs; ms += minorInterval) marks.push({ ms, major: Math.abs(ms % majorInterval) < 0.01 });
    marks.push({ ms: durationMs, major: true });
    return marks;
  }, [durationMs, timelineWidth]);

  if (durationMs < minimumClipDurationMs) {
    return (
      <section className="clip-editor-timeline clip-editor-timeline--unavailable" aria-labelledby="trim-heading">
        <Scissors className="size-4" aria-hidden="true" />
        <div>
          <h3 id="trim-heading">Trim unavailable</h3>
          <p>Switchboard could not read enough clip duration to set a trim range.</p>
        </div>
      </section>
    );
  }

  const startPercent = startMs / durationMs * 100;
  const endPercent = endMs / durationMs * 100;
  const currentPercent = Math.min(100, Math.max(0, currentMs / durationMs * 100));
  const selectedPercent = Math.max(0, endPercent - startPercent);
  const playheadEdge = currentPercent < 8 ? 'start' : currentPercent > 92 ? 'end' : 'middle';
  const frameCount = Math.max(10, Math.min(30, Math.round(timelineWidth / 44)));

  return (
    <section className="clip-editor-timeline" aria-labelledby="trim-heading" data-interaction={interaction}>
      <div className="clip-editor-timeline__heading">
        <div className="min-w-0">
          <h3 id="trim-heading">Timeline</h3>
          <p>Drag the cyan playhead to scrub. Drag only the edge handles to trim.</p>
        </div>
        <output className="clip-editor-timeline__timecode" aria-label={`Current time ${formatTimelineTime(currentMs)}`}>
          {formatTimelineTime(currentMs)}
          <span aria-hidden="true"> / {formatTimelineTime(durationMs)}</span>
        </output>
      </div>

      <div ref={timelineRef} className="clip-editor-timeline__surface" data-testid="clip-timeline-surface">
        <div className="clip-editor-timeline__ruler" aria-hidden="true">
          {ruler.map((mark, index) => (
            <span key={`${mark.ms}-${index}`} className={mark.major ? 'is-major' : undefined} style={{ left: `${mark.ms / durationMs * 100}%` }}>
              {mark.major ? <em>{formatRulerTime(mark.ms)}</em> : null}
            </span>
          ))}
        </div>

        <div className="clip-editor-timeline__track" aria-hidden="true">
          {Array.from({ length: frameCount + 1 }, (_, index) => (
            <span key={index} className="clip-editor-timeline__frame" style={{ left: `${index / frameCount * 100}%` }} />
          ))}
          <span className="clip-editor-timeline__selection" style={{ left: `${startPercent}%`, width: `${selectedPercent}%` }} />
          <span className="clip-editor-timeline__inactive is-before" style={{ width: `${startPercent}%` }} />
          <span className="clip-editor-timeline__inactive is-after" style={{ left: `${endPercent}%`, width: `${100 - endPercent}%` }} />
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-valuemin={0}
          aria-valuemax={durationMs}
          aria-valuenow={Math.round(currentMs)}
          aria-valuetext={formatTimelineTime(currentMs)}
          aria-orientation="horizontal"
          className="clip-editor-timeline__scrub-target"
          data-testid="clip-timeline-scrub-target"
          onKeyDown={updatePlayheadFromKeyboard}
          onPointerDown={beginScrubbing}
          onPointerMove={continueScrubbing}
          onPointerUp={finishScrubbing}
          onPointerCancel={cancelPointerInteraction}
        />

        <div className="clip-editor-playhead" style={{ left: `${currentPercent}%` }} aria-hidden="true">
          <span className="clip-editor-playhead__time" data-edge={playheadEdge}>{formatTimelineTime(currentMs)}</span>
          <span className="clip-editor-playhead__cap" />
          <span className="clip-editor-playhead__line" />
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, endMs - minimumClipDurationMs)}
          aria-valuenow={Math.round(startMs)}
          aria-valuetext={formatTimelineTime(startMs)}
          aria-orientation="horizontal"
          className="clip-editor-trim-handle is-start"
          style={{ left: `${startPercent}%` }}
          data-testid="clip-trim-start"
          onKeyDown={(event) => updateTrimFromKeyboard(event, 'dragging-trim-start')}
          onPointerDown={beginTrimStart}
          onPointerMove={continueTrimStart}
          onPointerUp={finishTrimStart}
          onPointerCancel={cancelPointerInteraction}
        >
          <span aria-hidden="true"><i /><i /><i /></span>
        </div>

        <div
          role="slider"
          tabIndex={0}
          aria-label="Trim end"
          aria-valuemin={Math.min(durationMs, startMs + minimumClipDurationMs)}
          aria-valuemax={durationMs}
          aria-valuenow={Math.round(endMs)}
          aria-valuetext={formatTimelineTime(endMs)}
          aria-orientation="horizontal"
          className="clip-editor-trim-handle is-end"
          style={{ left: `${endPercent}%` }}
          data-testid="clip-trim-end"
          onKeyDown={(event) => updateTrimFromKeyboard(event, 'dragging-trim-end')}
          onPointerDown={beginTrimEnd}
          onPointerMove={continueTrimEnd}
          onPointerUp={finishTrimEnd}
          onPointerCancel={cancelPointerInteraction}
        >
          <span aria-hidden="true"><i /><i /><i /></span>
        </div>
      </div>

      <div className="clip-editor-timeline__toolbar">
        <div className="clip-editor-timeline__selection-copy">
          <strong>{formatDuration((endMs - startMs) / 1_000)} selected</strong>
          <span>{formatTimelineTime(startMs)} – {formatTimelineTime(endMs)}</span>
        </div>

        <div className="clip-editor-transport" role="group" aria-label="Playback controls">
          <TransportButton label="Previous frame" icon={SkipBack} onClick={() => seekBy(-frameMs)} />
          <TransportButton label="Back 5 seconds" icon={Rewind} onClick={() => seekBy(-5_000)} />
          <TransportButton label={playing ? 'Pause' : 'Play selection'} icon={playing ? Pause : Play} primary onClick={togglePlayback} />
          <TransportButton label="Forward 5 seconds" icon={FastForward} onClick={() => seekBy(5_000)} />
          <TransportButton label="Next frame" icon={SkipForward} onClick={() => seekBy(frameMs)} />
          <span className="clip-editor-transport__separator" aria-hidden="true" />
          <TransportButton label={muted ? 'Unmute' : 'Mute'} icon={muted ? VolumeX : Volume2} pressed={muted} onClick={toggleMute} />
        </div>

        <div className="clip-editor-timeline__actions">
          <Button type="button" variant="ghost" size="sm" disabled={startMs === 0 && endMs === durationMs} onClick={() => onChange(0, durationMs)}>
            <Undo2 className="size-3.5" aria-hidden="true" /> Reset
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!dirty || savePending} onClick={onSave}>
            <Save className="size-3.5" aria-hidden="true" /> {savePending ? 'Saving…' : dirty ? 'Save trim' : 'Saved'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function TransportButton({ label, icon: Icon, primary = false, pressed, onClick }: {
  label: string;
  icon: typeof Play;
  primary?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={primary ? 'primary' : 'ghost'} size="icon" className={primary ? 'size-8' : 'size-7'} aria-label={label} aria-pressed={pressed} onClick={onClick}>
          <Icon className={primary ? 'size-4' : 'size-3.5'} aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
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

function formatRulerTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Electron's synthetic native-input path can omit an active pointer record.
  }
}

function releasePointer(element: HTMLElement, pointerId: number): void {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // The pointer may already have been released by the host window.
  }
}
