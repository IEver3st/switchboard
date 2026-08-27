import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { FastForward, Film, Pause, Play, Rewind, Save, Scissors, SkipBack, SkipForward, Undo2, Volume2, VolumeX } from 'lucide-react';
import type { ClipAudioChannel, ClipAudioTrackTrim, ClipAudioWaveformTrack } from '../../../../shared/contracts';
import { channelColor } from '@/components/audio/channel-identity';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { switchboardApi } from '@/lib/demo-api';
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
  clipId,
  videoRef,
  durationMs,
  fps,
  audioChannels,
  audioTrackLevels,
  audioTrackTrims,
  startMs,
  endMs,
  dirty,
  savePending,
  onChange,
  onAudioTrackTrimChange,
  onResetTrims,
  onAudioTrackLevelChange,
  onSave,
}: {
  clipId: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  durationMs: number;
  fps: number;
  audioChannels?: ClipAudioChannel[];
  audioTrackLevels?: number[];
  audioTrackTrims?: Array<ClipAudioTrackTrim | null>;
  startMs: number;
  endMs: number;
  dirty: boolean;
  savePending: boolean;
  onChange: (startMs: number, endMs: number) => void;
  onAudioTrackTrimChange: (trackIndex: number, startMs: number, endMs: number) => void;
  onResetTrims: () => void;
  onAudioTrackLevelChange: (trackIndex: number, level: number) => Promise<void>;
  onSave: () => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const currentMsRef = useRef(startMs);
  const interactionRef = useRef<TimelineInteraction>('idle');
  const activeTrimTrackRef = useRef<'clip' | number | null>(null);
  const pendingSeekMsRef = useRef<number | null>(null);
  const resumeAfterScrubRef = useRef(false);
  const playbackModeRef = useRef<'selection' | 'free'>('selection');
  const [currentMs, setCurrentMs] = useState(startMs);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [interaction, setInteractionState] = useState<TimelineInteraction>('idle');
  const [timelineWidth, setTimelineWidth] = useState(720);
  const [waveformState, setWaveformState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [waveformTracks, setWaveformTracks] = useState<ClipAudioWaveformTrack[]>([]);
  const frameMs = Math.max(1, 1_000 / Math.max(1, fps));

  useEffect(() => {
    let active = true;
    setWaveformState('loading');
    setWaveformTracks([]);
    void switchboardApi.loadClipAudioWaveform(clipId).then((waveform) => {
      if (!active) return;
      setWaveformTracks(waveform.tracks);
      setWaveformState('ready');
    }).catch(() => {
      if (!active) return;
      setWaveformState('error');
    });
    return () => { active = false; };
  }, [clipId]);

  const setPlayhead = useCallback((nextMs: number) => {
    const boundedMs = Math.min(durationMs, Math.max(0, Math.round(nextMs)));
    currentMsRef.current = boundedMs;
    setCurrentMs(boundedMs);
    const video = videoRef.current;
    if (video) {
      pendingSeekMsRef.current = boundedMs;
      video.currentTime = boundedMs / 1_000;
    }
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

  const trimValues = (track: 'clip' | number): TimelineValues => {
    if (track === 'clip') return values();
    const trackTrim = audioTrackTrims?.[track];
    return {
      currentMs: currentMsRef.current,
      startMs: trackTrim?.startMs ?? 0,
      endMs: trackTrim?.endMs ?? durationMs,
      durationMs,
    };
  };

  const trimToPointer = (
    kind: 'dragging-trim-start' | 'dragging-trim-end',
    track: 'clip' | number,
    clientX: number,
  ) => {
    const next = applyTimelineInteraction(kind, timeAtPointer(clientX), trimValues(track));
    if (track === 'clip') onChange(next.startMs, next.endMs);
    else onAudioTrackTrimChange(track, next.startMs, next.endMs);
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

  const beginTrim = (
    event: ReactPointerEvent<HTMLDivElement>,
    kind: 'dragging-trim-start' | 'dragging-trim-end',
    track: 'clip' | number,
  ) => {
    if (event.button > 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    activeTrimTrackRef.current = track;
    setInteraction(kind);
    capturePointer(event.currentTarget, event.pointerId);
  };

  const continueTrim = (
    event: ReactPointerEvent<HTMLDivElement>,
    kind: 'dragging-trim-start' | 'dragging-trim-end',
    track: 'clip' | number,
  ) => {
    if (interactionRef.current !== kind || activeTrimTrackRef.current !== track) return;
    trimToPointer(kind, track, event.clientX);
  };

  const finishTrim = (
    event: ReactPointerEvent<HTMLDivElement>,
    kind: 'dragging-trim-start' | 'dragging-trim-end',
    track: 'clip' | number,
  ) => {
    if (interactionRef.current !== kind || activeTrimTrackRef.current !== track) return;
    trimToPointer(kind, track, event.clientX);
    releasePointer(event.currentTarget, event.pointerId);
    activeTrimTrackRef.current = null;
    setInteraction('idle');
  };

  const cancelPointerInteraction = () => {
    resumeAfterScrubRef.current = false;
    activeTrimTrackRef.current = null;
    setInteraction('idle');
  };

  const updateTrimFromKeyboard = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    kind: 'dragging-trim-start' | 'dragging-trim-end',
    track: 'clip' | number,
  ) => {
    const next = applyTrimKeyboard(kind, event.key, trimValues(track), 100);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    if (track === 'clip') onChange(next.startMs, next.endMs);
    else onAudioTrackTrimChange(track, next.startMs, next.endMs);
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
    if (!video) return;
    if (video.volume === 0) video.volume = 0.5;
    video.muted = !video.muted;
  };

  const updateVolume = (nextValue: number) => {
    const video = videoRef.current;
    const nextVolume = Math.min(1, Math.max(0, nextValue));
    if (!video) return;
    setVolume(nextVolume);
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
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
    const clearStalePointerState = () => {
      if (interactionRef.current === 'idle') return;
      interactionRef.current = 'idle';
      activeTrimTrackRef.current = null;
      resumeAfterScrubRef.current = false;
      setInteractionState('idle');
    };
    window.addEventListener('pointerup', clearStalePointerState);
    window.addEventListener('pointercancel', clearStalePointerState);
    window.addEventListener('blur', clearStalePointerState);
    return () => {
      window.removeEventListener('pointerup', clearStalePointerState);
      window.removeEventListener('pointercancel', clearStalePointerState);
      window.removeEventListener('blur', clearStalePointerState);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateTime = () => {
      const nextMs = Math.min(durationMs, Math.max(0, video.currentTime * 1_000));
      const pendingSeekMs = pendingSeekMsRef.current;
      if (pendingSeekMs !== null && Math.abs(nextMs - pendingSeekMs) > Math.max(80, frameMs * 2)) {
        currentMsRef.current = pendingSeekMs;
        setCurrentMs(pendingSeekMs);
        return;
      }
      pendingSeekMsRef.current = null;
      if (!video.paused && playbackModeRef.current === 'selection' && nextMs >= endMs) {
        video.pause();
        setPlayhead(endMs);
        return;
      }
      currentMsRef.current = nextMs;
      setCurrentMs(nextMs);
    };
    const updatePlayback = () => setPlaying(!video.paused);
    const updateVolumeState = () => {
      setMuted(video.muted || video.volume === 0);
      setVolume(video.volume);
    };
    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('seeked', updateTime);
    video.addEventListener('play', updatePlayback);
    video.addEventListener('pause', updatePlayback);
    video.addEventListener('ended', updatePlayback);
    video.addEventListener('volumechange', updateVolumeState);
    updatePlayback();
    updateVolumeState();
    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('seeked', updateTime);
      video.removeEventListener('play', updatePlayback);
      video.removeEventListener('pause', updatePlayback);
      video.removeEventListener('ended', updatePlayback);
      video.removeEventListener('volumechange', updateVolumeState);
    };
  }, [durationMs, endMs, frameMs, setPlayhead, videoRef]);

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

  const currentPercent = Math.min(100, Math.max(0, currentMs / durationMs * 100));
  const fallbackTracks: ClipAudioWaveformTrack[] = (audioChannels ?? []).map((channel, trackIndex) => ({
    trackIndex,
    channel,
    label: channelLabel(channel),
    samples: [],
  }));
  const displayTracks = waveformState === 'ready' ? waveformTracks : (waveformTracks.length > 0 ? waveformTracks : fallbackTracks);
  const timelineStyle = { '--audio-track-count': Math.max(1, displayTracks.length) } as CSSProperties;
  const hasAudioTrackTrims = audioTrackTrims?.some(Boolean) ?? false;

  return (
    <section className="clip-editor-timeline" aria-label="Clip timeline" data-interaction={interaction}>
      <div className="clip-editor-transport-bar">
        <output className="clip-editor-timeline__timecode" aria-label={`Current time ${formatTimelineTime(currentMs)}`}>
          {formatTimelineTime(currentMs)}
          <span aria-hidden="true"> / {formatTimelineTime(durationMs)}</span>
        </output>

        <div className="clip-editor-transport" role="group" aria-label="Playback controls">
          <TransportButton label="Previous frame" icon={SkipBack} onClick={() => seekBy(-frameMs)} />
          <TransportButton label="Back 5 seconds" icon={Rewind} onClick={() => seekBy(-5_000)} />
          <TransportButton label={playing ? 'Pause' : 'Play selection'} icon={playing ? Pause : Play} primary onClick={togglePlayback} />
          <TransportButton label="Forward 5 seconds" icon={FastForward} onClick={() => seekBy(5_000)} />
          <TransportButton label="Next frame" icon={SkipForward} onClick={() => seekBy(frameMs)} />
        </div>

        <div className="clip-editor-transport__utilities">
          <div className="clip-editor-volume" role="group" aria-label="Playback volume">
            <TransportButton label={muted ? 'Unmute' : 'Mute'} icon={muted ? VolumeX : Volume2} pressed={muted} onClick={toggleMute} />
            <input
              type="range"
              className="clip-editor-volume__slider"
              min={0}
              max={100}
              step={1}
              value={Math.round(volume * 100)}
              aria-label="Playback volume"
              aria-valuetext={`${Math.round(volume * 100)} percent`}
              onChange={(event) => updateVolume(Number(event.currentTarget.value) / 100)}
            />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <TransportButton label="Reset timeline edits" icon={Undo2} disabled={startMs === 0 && endMs === durationMs && !hasAudioTrackTrims} onClick={onResetTrims} />
          <Button type="button" variant="secondary" size="sm" className="h-7 px-2.5 text-[10px]" disabled={!dirty || savePending} onClick={onSave}>
            <Save className="size-3.5" aria-hidden="true" /> {savePending ? 'Saving…' : dirty ? 'Save edits' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className="clip-editor-timeline__desk" style={timelineStyle} data-waveform-state={waveformState}>
        <div className="clip-editor-track-controls" aria-label="Timeline track controls">
          <div className="clip-editor-track-controls__heading" title="Track levels auto-save. Timeline ranges are saved with the clip edits.">
            <span>Tracks</span><em>Levels auto-save</em>
          </div>
          <div className="clip-editor-track-controls__lanes">
            <div className="clip-editor-clip-control">
              <span><Film aria-hidden="true" /> Clip range</span>
              <output>{formatRulerTime(endMs - startMs)}</output>
            </div>
            {displayTracks.length > 0 ? displayTracks.map((track) => (
              <AudioTrackControl
                key={track.trackIndex}
                track={track}
                level={audioTrackLevels?.[track.trackIndex] ?? 100}
                onCommit={onAudioTrackLevelChange}
              />
            )) : (
              <div className="clip-editor-track-controls__empty">
                {waveformState === 'loading' ? 'Reading audio tracks…' : waveformState === 'error' ? 'Audio analysis unavailable' : 'No audio streams'}
              </div>
            )}
          </div>
        </div>

        <div ref={timelineRef} className="clip-editor-timeline__surface" data-testid="clip-timeline-surface">
          <div className="clip-editor-timeline__ruler" aria-hidden="true">
            {ruler.map((mark, index) => (
              <span key={`${mark.ms}-${index}`} className={mark.major ? 'is-major' : undefined} style={{ left: `${mark.ms / durationMs * 100}%` }}>
                {mark.major ? <em>{formatRulerTime(mark.ms)}</em> : null}
              </span>
            ))}
          </div>

          <div className="clip-editor-timeline__tracks">
            <div className="clip-editor-timeline__clip-track" role="group" aria-label="Clip range">
              <span className="clip-editor-timeline__clip-fill" aria-hidden="true" />
              <TimelineLaneTrim
                startMs={startMs}
                endMs={endMs}
                durationMs={durationMs}
                startLabel="Trim start"
                endLabel="Trim end"
                startTestId="clip-trim-start"
                endTestId="clip-trim-end"
                onKeyDown={(event, kind) => updateTrimFromKeyboard(event, kind, 'clip')}
                onPointerDown={(event, kind) => beginTrim(event, kind, 'clip')}
                onPointerMove={(event, kind) => continueTrim(event, kind, 'clip')}
                onPointerUp={(event, kind) => finishTrim(event, kind, 'clip')}
                onPointerCancel={cancelPointerInteraction}
              />
            </div>
            {displayTracks.length > 0 ? displayTracks.map((track) => (
              <div
                key={track.trackIndex}
                className="clip-editor-timeline__audio-track"
                data-muted={(audioTrackLevels?.[track.trackIndex] ?? 100) === 0 ? 'true' : undefined}
                style={{ '--track-color': track.channel ? channelColor(track.channel) : 'var(--text-description)' } as CSSProperties}
                role="group"
                aria-label={`${track.channel ? channelLabel(track.channel) : track.label} timeline`}
              >
                {track.samples.length > 0 ? (
                  <svg viewBox={`0 0 ${track.samples.length} 1`} preserveAspectRatio="none" focusable="false" aria-hidden="true">
                    <path d={waveformPath(track.samples)} vectorEffect="non-scaling-stroke" />
                  </svg>
                ) : <span>{waveformState === 'loading' ? 'Analyzing…' : waveformState === 'error' ? 'Waveform unavailable' : 'No audible activity'}</span>}
                <TimelineLaneTrim
                  startMs={audioTrackTrims?.[track.trackIndex]?.startMs ?? 0}
                  endMs={audioTrackTrims?.[track.trackIndex]?.endMs ?? durationMs}
                  durationMs={durationMs}
                  startLabel={`${track.channel ? channelLabel(track.channel) : track.label} trim start`}
                  endLabel={`${track.channel ? channelLabel(track.channel) : track.label} trim end`}
                  startTestId={`clip-track-${track.trackIndex}-trim-start`}
                  endTestId={`clip-track-${track.trackIndex}-trim-end`}
                  onKeyDown={(event, kind) => updateTrimFromKeyboard(event, kind, track.trackIndex)}
                  onPointerDown={(event, kind) => beginTrim(event, kind, track.trackIndex)}
                  onPointerMove={(event, kind) => continueTrim(event, kind, track.trackIndex)}
                  onPointerUp={(event, kind) => finishTrim(event, kind, track.trackIndex)}
                  onPointerCancel={cancelPointerInteraction}
                />
              </div>
            )) : (
              <div className="clip-editor-timeline__audio-track is-empty"><span>{waveformState === 'loading' ? 'Reading track data…' : waveformState === 'error' ? 'Waveform unavailable' : 'This clip has no audio streams'}</span></div>
            )}
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
            <span className="clip-editor-playhead__cap" />
            <span className="clip-editor-playhead__line" />
          </div>

        </div>
      </div>

    </section>
  );
}

function AudioTrackControl({ track, level, onCommit }: {
  track: ClipAudioWaveformTrack;
  level: number;
  onCommit: (trackIndex: number, level: number) => Promise<void>;
}) {
  const [draftLevel, setDraftLevel] = useState(level);
  const draftLevelRef = useRef(level);
  const committedLevelRef = useRef(level);
  const commitTimerRef = useRef<number | null>(null);
  useEffect(() => {
    setDraftLevel(level);
    draftLevelRef.current = level;
    committedLevelRef.current = level;
  }, [level]);

  useEffect(() => () => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
  }, []);

  const commit = () => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    const nextLevel = draftLevelRef.current;
    if (nextLevel === committedLevelRef.current) return;
    committedLevelRef.current = nextLevel;
    void onCommit(track.trackIndex, nextLevel).catch(() => {
      committedLevelRef.current = level;
      draftLevelRef.current = level;
      setDraftLevel(level);
    });
  };
  const updateDraft = (nextLevel: number) => {
    draftLevelRef.current = nextLevel;
    setDraftLevel(nextLevel);
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(commit, 160);
  };
  const label = track.channel ? channelLabel(track.channel) : track.label;
  const color = track.channel ? channelColor(track.channel) : 'var(--text-description)';

  return (
    <label className="clip-editor-track-control" data-muted={draftLevel === 0 ? 'true' : undefined} style={{ '--track-color': color } as CSSProperties}>
      <span className="clip-editor-track-control__name"><i aria-hidden="true" />{label}</span>
      <output>{draftLevel}%</output>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={draftLevel}
        aria-label={`${label} export level`}
        aria-valuetext={`${draftLevel} percent in exported mix`}
        onChange={(event) => updateDraft(Number(event.currentTarget.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

function channelLabel(channel: ClipAudioChannel): string {
  if (channel === 'microphone') return 'Microphone';
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function waveformPath(samples: readonly number[]): string {
  return samples.map((sample, index) => {
    const amplitude = Math.min(0.46, Math.max(0, sample) * 0.46);
    return `M${index + 0.5},${0.5 - amplitude}V${0.5 + amplitude}`;
  }).join('');
}

function TransportButton({ label, icon: Icon, primary = false, pressed, disabled, onClick }: {
  label: string;
  icon: typeof Play;
  primary?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={primary ? 'primary' : 'ghost'} size="icon" className={primary ? 'size-8' : 'size-7'} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
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
