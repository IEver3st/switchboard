import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { FastForward, Film, Pause, Play, Rewind, Save, Scissors, SkipBack, SkipForward, Undo2, Volume2, VolumeX } from 'lucide-react';
import type { ClipAudioChannel, ClipAudioTrackTrim, ClipAudioWaveformTrack, ClipEventMarker } from '../../../../shared/contracts';
import { singularEventLabel } from '../../../../shared/auto-capture';
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
import { clipPreviewNeedsSync, clipPreviewTrackVolume } from './clip-preview-audio';
import './clip-editor.css';

export function ClipTimeline({
  clipId,
  videoRef,
  durationMs,
  fps,
  audioChannels,
  audioTrackLevels,
  audioTrackTrims,
  eventMarkers,
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
  eventMarkers?: ClipEventMarker[];
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
  const playheadRef = useRef<HTMLDivElement>(null);
  const timecodeCurrentRef = useRef<HTMLSpanElement>(null);
  const scrubTargetRef = useRef<HTMLDivElement>(null);
  const timelineWidthRef = useRef(720);
  const timelineRectRef = useRef<{ left: number; width: number } | null>(null);
  const currentMsRef = useRef(startMs);
  const interactionRef = useRef<TimelineInteraction>('idle');
  const activeTrimTrackRef = useRef<'clip' | number | null>(null);
  const pendingSeekMsRef = useRef<number | null>(null);
  const seekFrameRef = useRef<number | null>(null);
  const resumeAfterScrubRef = useRef(false);
  const playbackModeRef = useRef<'selection' | 'free'>('selection');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [interaction, setInteractionState] = useState<TimelineInteraction>('idle');
  const [rulerIntervalMs, setRulerIntervalMs] = useState(() => chooseTimelineTickInterval(durationMs, 720));
  const [waveformState, setWaveformState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [waveformTracks, setWaveformTracks] = useState<ClipAudioWaveformTrack[]>([]);
  const [previewTrackLevels, setPreviewTrackLevels] = useState<number[]>(() => [...(audioTrackLevels ?? [])]);
  const [readyPreviewTrackIndexes, setReadyPreviewTrackIndexes] = useState<ReadonlySet<number>>(() => new Set());
  const previewAudioRefs = useRef(new Map<number, HTMLAudioElement>());
  const previewTrackLevelsRef = useRef(previewTrackLevels);
  const audioTrackTrimsRef = useRef(audioTrackTrims);
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const frameMs = Math.max(1, 1_000 / Math.max(1, fps));
  const isolatedPreviewReady = waveformState === 'ready'
    && waveformTracks.length > 0
    && waveformTracks.every((track) => readyPreviewTrackIndexes.has(track.trackIndex));
  previewTrackLevelsRef.current = previewTrackLevels;
  audioTrackTrimsRef.current = audioTrackTrims;
  mutedRef.current = muted;
  volumeRef.current = volume;

  const positionPlayhead = useCallback((nextMs: number) => {
    const playhead = playheadRef.current;
    if (!playhead) return;
    const boundedMs = Math.min(durationMs, Math.max(0, nextMs));
    const offset = durationMs > 0 ? boundedMs / durationMs * timelineWidthRef.current : 0;
    playhead.style.transform = `translate3d(${offset}px, 0, 0)`;
  }, [durationMs]);

  const updatePlayheadReadout = useCallback((nextMs: number) => {
    const boundedMs = Math.min(durationMs, Math.max(0, nextMs));
    const formatted = formatTimelineTime(boundedMs);
    if (timecodeCurrentRef.current) timecodeCurrentRef.current.textContent = formatted;
    if (scrubTargetRef.current) {
      scrubTargetRef.current.setAttribute('aria-valuenow', String(Math.round(boundedMs)));
      scrubTargetRef.current.setAttribute('aria-valuetext', formatted);
    }
  }, [durationMs]);

  const seekVideo = useCallback((nextMs: number, immediate: boolean) => {
    pendingSeekMsRef.current = nextMs;
    const video = videoRef.current;
    if (!video) return;
    const commitSeek = () => {
      seekFrameRef.current = null;
      const targetMs = pendingSeekMsRef.current;
      if (targetMs !== null) video.currentTime = targetMs / 1_000;
    };
    if (immediate) {
      if (seekFrameRef.current !== null) window.cancelAnimationFrame(seekFrameRef.current);
      commitSeek();
    } else if (seekFrameRef.current === null) {
      seekFrameRef.current = window.requestAnimationFrame(commitSeek);
    }
  }, [videoRef]);

  useEffect(() => {
    let active = true;
    setWaveformState('loading');
    setWaveformTracks([]);
    setReadyPreviewTrackIndexes(new Set());
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

  useEffect(() => {
    setPreviewTrackLevels([...(audioTrackLevels ?? [])]);
  }, [audioTrackLevels]);

  useEffect(() => {
    const currentMs = (videoRef.current?.currentTime ?? 0) * 1_000;
    for (const track of waveformTracks) {
      const preview = previewAudioRefs.current.get(track.trackIndex);
      if (!preview) continue;
      preview.volume = clipPreviewTrackVolume(
        previewTrackLevels[track.trackIndex] ?? 100,
        volume,
        muted,
        currentMs,
        audioTrackTrims?.[track.trackIndex],
      );
    }
  }, [audioTrackTrims, muted, previewTrackLevels, videoRef, volume, waveformTracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isolatedPreviewReady) return;
    const previews = waveformTracks.flatMap((track) => {
      const preview = previewAudioRefs.current.get(track.trackIndex);
      return preview ? [{ preview, trackIndex: track.trackIndex }] : [];
    });
    if (previews.length !== waveformTracks.length) return;

    let playbackFrame: number | null = null;
    const updatePreviews = (forcePosition: boolean) => {
      const videoSeconds = video.currentTime;
      const currentMs = videoSeconds * 1_000;
      for (const { preview, trackIndex } of previews) {
        preview.volume = clipPreviewTrackVolume(
          previewTrackLevelsRef.current[trackIndex] ?? 100,
          volumeRef.current,
          mutedRef.current,
          currentMs,
          audioTrackTrimsRef.current?.[trackIndex],
        );
        preview.playbackRate = video.playbackRate;
        if (preview.readyState >= HTMLMediaElement.HAVE_METADATA
          && (forcePosition || clipPreviewNeedsSync(preview.currentTime, videoSeconds))) {
          preview.currentTime = videoSeconds;
        }
      }
    };
    const stopPlaybackFrames = () => {
      if (playbackFrame === null) return;
      window.cancelAnimationFrame(playbackFrame);
      playbackFrame = null;
    };
    const syncPlaybackFrame = () => {
      playbackFrame = null;
      if (video.paused || video.ended) return;
      updatePreviews(false);
      playbackFrame = window.requestAnimationFrame(syncPlaybackFrame);
    };
    const startPreviewPlayback = () => {
      video.muted = true;
      updatePreviews(true);
      for (const { preview } of previews) void preview.play().catch(() => undefined);
      if (playbackFrame === null) playbackFrame = window.requestAnimationFrame(syncPlaybackFrame);
    };
    const pausePreviewPlayback = () => {
      stopPlaybackFrames();
      updatePreviews(true);
      for (const { preview } of previews) preview.pause();
    };
    const synchronizePosition = () => updatePreviews(true);

    video.muted = true;
    if (video.paused || video.ended) pausePreviewPlayback();
    else startPreviewPlayback();
    video.addEventListener('play', startPreviewPlayback);
    video.addEventListener('pause', pausePreviewPlayback);
    video.addEventListener('ended', pausePreviewPlayback);
    video.addEventListener('seeking', synchronizePosition);
    video.addEventListener('seeked', synchronizePosition);
    video.addEventListener('ratechange', synchronizePosition);
    return () => {
      video.removeEventListener('play', startPreviewPlayback);
      video.removeEventListener('pause', pausePreviewPlayback);
      video.removeEventListener('ended', pausePreviewPlayback);
      video.removeEventListener('seeking', synchronizePosition);
      video.removeEventListener('seeked', synchronizePosition);
      video.removeEventListener('ratechange', synchronizePosition);
      stopPlaybackFrames();
      for (const { preview } of previews) preview.pause();
      video.muted = mutedRef.current;
    };
  }, [isolatedPreviewReady, videoRef, waveformTracks]);

  const setPlayhead = useCallback((nextMs: number, immediateSeek = true) => {
    const boundedMs = Math.min(durationMs, Math.max(0, Math.round(nextMs)));
    currentMsRef.current = boundedMs;
    positionPlayhead(boundedMs);
    updatePlayheadReadout(boundedMs);
    seekVideo(boundedMs, immediateSeek);
  }, [durationMs, positionPlayhead, seekVideo, updatePlayheadReadout]);

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

  const timeAtPointer = (clientX: number, refreshBounds = false) => {
    if (refreshBounds || !timelineRectRef.current) {
      const measured = timelineRef.current?.getBoundingClientRect();
      timelineRectRef.current = measured ? { left: measured.left, width: measured.width } : null;
    }
    const rect = timelineRectRef.current;
    return rect ? timeFromTimelinePoint(clientX, rect.left, rect.width, durationMs) : currentMsRef.current;
  };

  const scrubToPointer = (clientX: number, refreshBounds = false, immediateSeek = false) => {
    const next = applyTimelineInteraction('scrubbing', timeAtPointer(clientX, refreshBounds), values());
    setPlayhead(next.currentMs, immediateSeek);
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
    scrubToPointer(event.clientX, true);
  };

  const continueScrubbing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current !== 'scrubbing') return;
    scrubToPointer(event.clientX);
  };

  const finishScrubbing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current !== 'scrubbing') return;
    scrubToPointer(event.clientX, false, true);
    releasePointer(event.currentTarget, event.pointerId);
    timelineRectRef.current = null;
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
    timeAtPointer(event.clientX, true);
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
    timelineRectRef.current = null;
    setInteraction('idle');
  };

  const cancelPointerInteraction = () => {
    resumeAfterScrubRef.current = false;
    activeTrimTrackRef.current = null;
    timelineRectRef.current = null;
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
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!isolatedPreviewReady) video.muted = nextMuted;
  };

  const updateVolume = (nextValue: number) => {
    const video = videoRef.current;
    const nextVolume = Math.min(1, Math.max(0, nextValue));
    if (!video) return;
    setVolume(nextVolume);
    video.volume = nextVolume;
    setMuted(nextVolume === 0);
    if (!isolatedPreviewReady) video.muted = nextVolume === 0;
  };

  useLayoutEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const updateWidth = (width: number) => {
      timelineWidthRef.current = width;
      setRulerIntervalMs((current) => {
        const next = chooseTimelineTickInterval(durationMs, width);
        return next === current ? current : next;
      });
      positionPlayhead(currentMsRef.current);
    };
    updateWidth(timeline.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) updateWidth(entry.contentRect.width);
    });
    observer.observe(timeline);
    return () => observer.disconnect();
  }, [durationMs, positionPlayhead]);

  useEffect(() => () => {
    if (seekFrameRef.current !== null) window.cancelAnimationFrame(seekFrameRef.current);
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
    let playbackFrame: number | null = null;
    let positionedMs = -1;
    let lastReadoutAt = -Infinity;
    const positionPlaybackFrame = (nextMs: number, forceReadout = false) => {
      if (Math.abs(nextMs - positionedMs) < 0.1) return;
      positionedMs = nextMs;
      currentMsRef.current = nextMs;
      positionPlayhead(nextMs);
      const now = performance.now();
      if (forceReadout || now - lastReadoutAt >= 50) {
        lastReadoutAt = now;
        updatePlayheadReadout(nextMs);
      }
    };
    const stopPlaybackFrames = () => {
      if (playbackFrame === null) return;
      window.cancelAnimationFrame(playbackFrame);
      playbackFrame = null;
    };
    const syncPlaybackFrame = () => {
      playbackFrame = null;
      if (video.paused || video.ended) return;
      const nextMs = Math.min(durationMs, Math.max(0, video.currentTime * 1_000));
      const pendingSeekMs = pendingSeekMsRef.current;
      if (pendingSeekMs !== null && Math.abs(nextMs - pendingSeekMs) > Math.max(80, frameMs * 2)) {
        positionPlaybackFrame(pendingSeekMs);
      } else {
        pendingSeekMsRef.current = null;
        if (playbackModeRef.current === 'selection' && nextMs >= endMs) {
          video.pause();
          setPlayhead(endMs);
          return;
        }
        positionPlaybackFrame(nextMs);
      }
      playbackFrame = window.requestAnimationFrame(syncPlaybackFrame);
    };
    const startPlaybackFrames = () => {
      if (playbackFrame === null) playbackFrame = window.requestAnimationFrame(syncPlaybackFrame);
    };
    const updateTime = () => {
      const nextMs = Math.min(durationMs, Math.max(0, video.currentTime * 1_000));
      const pendingSeekMs = pendingSeekMsRef.current;
      if (pendingSeekMs !== null && Math.abs(nextMs - pendingSeekMs) > Math.max(80, frameMs * 2)) {
        currentMsRef.current = pendingSeekMs;
        positionPlaybackFrame(pendingSeekMs, true);
        return;
      }
      pendingSeekMsRef.current = null;
      if (!video.paused && playbackModeRef.current === 'selection' && nextMs >= endMs) {
        video.pause();
        setPlayhead(endMs);
        return;
      }
      positionPlaybackFrame(nextMs, true);
    };
    const updatePlayback = () => {
      const isPlaying = !video.paused && !video.ended;
      setPlaying(isPlaying);
      if (isPlaying) startPlaybackFrames();
      else {
        stopPlaybackFrames();
        const nextMs = Math.min(durationMs, Math.max(0, video.currentTime * 1_000));
        positionPlaybackFrame(nextMs, true);
      }
    };
    const updateVolumeState = () => {
      if (isolatedPreviewReady) return;
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
      stopPlaybackFrames();
    };
  }, [durationMs, endMs, frameMs, isolatedPreviewReady, positionPlayhead, setPlayhead, updatePlayheadReadout, videoRef]);

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
    const minorInterval = rulerIntervalMs / 4;
    const marks: Array<{ ms: number; major: boolean }> = [];
    for (let ms = 0; ms < durationMs; ms += minorInterval) marks.push({ ms, major: Math.abs(ms % rulerIntervalMs) < 0.01 });
    const finalMark = marks.at(-1);
    if (finalMark && durationMs - finalMark.ms < minorInterval / 2) marks[marks.length - 1] = { ms: durationMs, major: true };
    else {
      const previousMajorIndex = marks.findLastIndex((mark) => mark.major);
      const previousMajor = marks[previousMajorIndex];
      if (previousMajor && durationMs - previousMajor.ms < rulerIntervalMs * 0.55) {
        marks[previousMajorIndex] = { ...previousMajor, major: false };
      }
      marks.push({ ms: durationMs, major: true });
    }
    return marks;
  }, [durationMs, rulerIntervalMs]);

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

  const currentMs = currentMsRef.current;
  const fallbackTracks: ClipAudioWaveformTrack[] = (audioChannels ?? []).map((channel, trackIndex) => ({
    trackIndex,
    channel,
    label: channelLabel(channel),
    samples: [],
  }));
  const displayTracks = waveformState === 'ready' ? waveformTracks : (waveformTracks.length > 0 ? waveformTracks : fallbackTracks);
  const timelineStyle = { '--audio-track-count': Math.max(1, displayTracks.length) } as CSSProperties;
  const hasAudioTrackTrims = audioTrackTrims?.some(Boolean) ?? false;
  const showSubsecondRuler = rulerIntervalMs < 1_000;

  return (
    <section className="clip-editor-timeline" aria-label="Clip timeline" data-interaction={interaction} data-playing={playing ? 'true' : undefined}>
      {waveformState === 'ready' ? waveformTracks.map((track) => (
        <audio
          key={`preview-${track.trackIndex}`}
          ref={(preview) => {
            if (preview) previewAudioRefs.current.set(track.trackIndex, preview);
            else previewAudioRefs.current.delete(track.trackIndex);
          }}
          src={`switchboard-media://clip-audio/${encodeURIComponent(clipId)}?track=${track.trackIndex}`}
          preload="auto"
          hidden
          data-clip-preview-track={track.channel ?? `track-${track.trackIndex}`}
          data-track-index={track.trackIndex}
          onCanPlay={(event) => {
            event.currentTarget.volume = clipPreviewTrackVolume(
              previewTrackLevelsRef.current[track.trackIndex] ?? 100,
              volumeRef.current,
              mutedRef.current,
              (videoRef.current?.currentTime ?? 0) * 1_000,
              audioTrackTrimsRef.current?.[track.trackIndex],
            );
            setReadyPreviewTrackIndexes((current) => current.has(track.trackIndex)
              ? current
              : new Set(current).add(track.trackIndex));
          }}
          onError={() => setReadyPreviewTrackIndexes((current) => {
            if (!current.has(track.trackIndex)) return current;
            const next = new Set(current);
            next.delete(track.trackIndex);
            return next;
          })}
        />
      )) : null}
      <div className="clip-editor-transport-bar">
        <output className="clip-editor-timeline__timecode" aria-label="Current playback time">
          <span ref={timecodeCurrentRef}>{formatTimelineTime(currentMs)}</span>
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
                onPreview={(trackIndex, level) => setPreviewTrackLevels((current) => {
                  const next = [...current];
                  while (next.length <= trackIndex) next.push(100);
                  next[trackIndex] = level;
                  return next;
                })}
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
              <span key={`${mark.ms}-${index}`} className={[mark.major ? 'is-major' : '', index === ruler.length - 1 ? 'is-terminal' : ''].filter(Boolean).join(' ') || undefined} style={{ left: `${mark.ms / durationMs * 100}%` }}>
                {mark.major ? <em>{formatRulerTime(mark.ms, showSubsecondRuler)}</em> : null}
              </span>
            ))}
          </div>

          {eventMarkers && eventMarkers.length > 0 ? (
            <div className="clip-editor-event-markers" role="group" aria-label={`${eventMarkers.length} Auto Capture ${eventMarkers.length === 1 ? 'event' : 'events'}`}>
              {eventMarkers.map((marker) => {
                const label = marker.label ?? singularEventLabel(marker.type);
                return (
                  <Tooltip key={marker.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="clip-editor-event-marker"
                        data-event-type={marker.type}
                        style={{ left: `clamp(14px, ${marker.timestampMs / durationMs * 100}%, calc(100% - 14px))` }}
                        aria-label={`${label} at ${formatRulerTime(marker.timestampMs, showSubsecondRuler)}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => setPlayhead(marker.timestampMs)}
                      >
                        <span aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{label} · {formatRulerTime(marker.timestampMs, showSubsecondRuler)}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ) : null}

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
                data-channel={track.channel}
                data-muted={(audioTrackLevels?.[track.trackIndex] ?? 100) === 0 ? 'true' : undefined}
                style={{ '--track-color': track.channel ? channelColor(track.channel) : 'var(--text-description)' } as CSSProperties}
                role="group"
                aria-label={`${track.channel ? channelLabel(track.channel) : track.label} timeline`}
              >
                {track.samples.length > 0
                  ? <AudioWaveform samples={track.samples} />
                  : <span className="clip-editor-timeline__empty-label">{waveformState === 'loading' ? 'Analyzing…' : waveformState === 'error' ? 'Waveform unavailable' : 'No audible activity'}</span>}
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
              <div className="clip-editor-timeline__audio-track is-empty"><span className="clip-editor-timeline__empty-label">{waveformState === 'loading' ? 'Reading track data…' : waveformState === 'error' ? 'Waveform unavailable' : 'This clip has no audio streams'}</span></div>
            )}
          </div>

          <div
            ref={scrubTargetRef}
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

          <div ref={playheadRef} className="clip-editor-playhead" aria-hidden="true">
            <span className="clip-editor-playhead__cap" />
            <span className="clip-editor-playhead__line" />
          </div>

        </div>
      </div>

    </section>
  );
}

function TimelineLaneTrim({
  startMs,
  endMs,
  durationMs,
  startLabel,
  endLabel,
  startTestId,
  endTestId,
  onKeyDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  startMs: number;
  endMs: number;
  durationMs: number;
  startLabel: string;
  endLabel: string;
  startTestId: string;
  endTestId: string;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>, kind: 'dragging-trim-start' | 'dragging-trim-end') => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, kind: 'dragging-trim-start' | 'dragging-trim-end') => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, kind: 'dragging-trim-start' | 'dragging-trim-end') => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>, kind: 'dragging-trim-start' | 'dragging-trim-end') => void;
  onPointerCancel: () => void;
}) {
  const startPercent = startMs / durationMs * 100;
  const endPercent = endMs / durationMs * 100;
  const selectedPercent = Math.max(0, endPercent - startPercent);
  return (
    <>
      <span className="clip-editor-timeline__selection" style={{ left: `${startPercent}%`, width: `${selectedPercent}%` }} aria-hidden="true" />
      <span className="clip-editor-timeline__inactive is-before" style={{ width: `${startPercent}%` }} aria-hidden="true" />
      <span className="clip-editor-timeline__inactive is-after" style={{ left: `${endPercent}%`, width: `${100 - endPercent}%` }} aria-hidden="true" />
      <div
        role="slider"
        tabIndex={0}
        aria-label={startLabel}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, endMs - minimumClipDurationMs)}
        aria-valuenow={Math.round(startMs)}
        aria-valuetext={formatTimelineTime(startMs)}
        aria-orientation="horizontal"
        className="clip-editor-trim-handle is-start"
        style={{ left: `${startPercent}%` }}
        data-testid={startTestId}
        onKeyDown={(event) => onKeyDown(event, 'dragging-trim-start')}
        onPointerDown={(event) => onPointerDown(event, 'dragging-trim-start')}
        onPointerMove={(event) => onPointerMove(event, 'dragging-trim-start')}
        onPointerUp={(event) => onPointerUp(event, 'dragging-trim-start')}
        onPointerCancel={onPointerCancel}
      >
        <span aria-hidden="true"><i /><i /><i /></span>
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={endLabel}
        aria-valuemin={Math.min(durationMs, startMs + minimumClipDurationMs)}
        aria-valuemax={durationMs}
        aria-valuenow={Math.round(endMs)}
        aria-valuetext={formatTimelineTime(endMs)}
        aria-orientation="horizontal"
        className="clip-editor-trim-handle is-end"
        style={{ left: `${endPercent}%` }}
        data-testid={endTestId}
        onKeyDown={(event) => onKeyDown(event, 'dragging-trim-end')}
        onPointerDown={(event) => onPointerDown(event, 'dragging-trim-end')}
        onPointerMove={(event) => onPointerMove(event, 'dragging-trim-end')}
        onPointerUp={(event) => onPointerUp(event, 'dragging-trim-end')}
        onPointerCancel={onPointerCancel}
      >
        <span aria-hidden="true"><i /><i /><i /></span>
      </div>
    </>
  );
}

const AudioWaveform = memo(function AudioWaveform({ samples }: { samples: readonly number[] }) {
  const path = useMemo(() => waveformPath(samples), [samples]);
  return (
    <svg viewBox={`0 0 ${samples.length} 1`} preserveAspectRatio="none" focusable="false" aria-hidden="true">
      <path d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
});

function AudioTrackControl({ track, level, onPreview, onCommit }: {
  track: ClipAudioWaveformTrack;
  level: number;
  onPreview: (trackIndex: number, level: number) => void;
  onCommit: (trackIndex: number, level: number) => Promise<void>;
}) {
  const [draftLevel, setDraftLevel] = useState(level);
  const draftLevelRef = useRef(level);
  const committedLevelRef = useRef(level);
  const lastAudibleLevelRef = useRef(level > 0 ? level : 100);
  const commitTimerRef = useRef<number | null>(null);
  useEffect(() => {
    setDraftLevel(level);
    draftLevelRef.current = level;
    committedLevelRef.current = level;
    if (level > 0) lastAudibleLevelRef.current = level;
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
      onPreview(track.trackIndex, level);
    });
  };
  const updateDraft = (nextLevel: number) => {
    draftLevelRef.current = nextLevel;
    setDraftLevel(nextLevel);
    onPreview(track.trackIndex, nextLevel);
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(commit, 160);
  };
  const label = track.channel ? channelLabel(track.channel) : track.label;
  const color = track.channel ? channelColor(track.channel) : 'var(--text-description)';
  const toggleMute = () => {
    const nextLevel = draftLevelRef.current === 0 ? lastAudibleLevelRef.current : 0;
    if (draftLevelRef.current > 0) lastAudibleLevelRef.current = draftLevelRef.current;
    updateDraft(nextLevel);
    commit();
  };

  return (
    <div className="clip-editor-track-control" data-muted={draftLevel === 0 ? 'true' : undefined} style={{ '--track-color': color, '--control-accent': color } as CSSProperties}>
      <span className="clip-editor-track-control__name"><i aria-hidden="true" />{label}</span>
      <output>{draftLevel}%</output>
      <button type="button" className="clip-editor-track-control__mute" aria-label={draftLevel === 0 ? `Unmute ${label} track` : `Mute ${label} track`} aria-pressed={draftLevel === 0} onClick={toggleMute}>
        {draftLevel === 0 ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
      <Slider
        variant="fader"
        min={0}
        max={100}
        step={1}
        value={[draftLevel]}
        aria-label={`${label} level`}
        aria-valuetext={`${draftLevel} percent in preview and exported mix`}
        onValueChange={([next]) => { if (typeof next === 'number') updateDraft(next); }}
        onValueCommit={([next]) => { if (typeof next === 'number') { updateDraft(next); commit(); } }}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}

function channelLabel(channel: ClipAudioChannel): string {
  if (channel === 'microphone') return 'Microphone';
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function waveformPath(samples: readonly number[]): string {
  if (samples.length === 0) return '';
  const points = samples.map((sample, index) => ({
    x: index + 0.5,
    amplitude: Math.min(0.11, Math.max(0, sample * 0.11)),
  }));
  const top = points.map(({ x, amplitude }) => `L${x},${0.5 - amplitude}`).join('');
  const bottom = points.toReversed().map(({ x, amplitude }) => `L${x},${0.5 + amplitude}`).join('');
  return `M0,0.5${top}L${samples.length},0.5${bottom}Z`;
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

function formatRulerTime(milliseconds: number, showTenths = false): string {
  const totalTenths = Math.max(0, Math.round(milliseconds / 100));
  const totalSeconds = Math.floor(totalTenths / 10);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const base = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
  return showTenths ? `${base}.${totalTenths % 10}` : base;
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
