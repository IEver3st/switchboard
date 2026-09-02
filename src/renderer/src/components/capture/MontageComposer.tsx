import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  FolderOpen,
  Maximize,
  Minimize,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Clip, ClipAudioChannel, ClipCanvasSize, ClipExportPreset } from '../../../../shared/contracts';
import type {
  MontageAudioWaveform,
  MontageProjectV2,
  MontageV2Segment,
} from '../../../../shared/montage-v2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { channelColor } from '@/components/audio/channel-identity';
import { formatBytes, formatDuration, formatVideoQuality } from '@/lib/format';
import { montageV2Api } from '@/lib/montage-v2-api';
import { AddMontageClipsDialog } from './AddMontageClipsDialog';
import { MontageV2Timeline } from './MontageV2Timeline';
import { ShareClipDialog } from './ShareClipDialog';
import {
  addClipsToMontage,
  createMontageMusicTrack,
  duplicateMontageSegment,
  mapMontageTime,
  minimumMontageSegmentMs,
  musicPlaybackAt,
  normalizeMontageProject,
  reconcileMontageProject,
  removeMontageSegment,
  segmentDurationMs,
  splitMontageSegment,
  updateMontageMusic,
  updateMontageSegment,
} from './montage-v2-model';
import './montage-v2.css';

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

type PreviewState = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type HistoryState = {
  past: MontageProjectV2[];
  present: MontageProjectV2;
  future: MontageProjectV2[];
  mergeKey: string | null;
  mergedAt: number;
};

export function MontageComposer({
  initialProject,
  clips,
  inspectorOpen,
  onClose,
  onInspectorOpenChange,
  onReveal,
  onDraftsChanged,
}: {
  initialProject: MontageProjectV2;
  clips: readonly Clip[];
  inspectorOpen: boolean;
  onClose: () => void;
  onInspectorOpenChange: (open: boolean) => void;
  onReveal: (clip: Clip) => void;
  onDraftsChanged: () => void;
}) {
  const editorRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const playbackFrameRef = useRef<number | null>(null);
  const currentMsRef = useRef(0);
  const lastRenderedMsRef = useRef(0);
  const activeSlotRef = useRef<0 | 1>(0);
  const playingRef = useRef(false);
  const projectRef = useRef(initialProject);
  const clipsRef = useRef(clips);
  const masterVolumeRef = useRef(1);
  const previewMutedRef = useRef(false);
  const seekGenerationRef = useRef(0);

  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: normalizeMontageProject(initialProject),
    future: [],
    mergeKey: null,
    mergedAt: 0,
  }));
  const project = history.present;
  const [selectedSegmentId, setSelectedSegmentId] = useState(project.segments[0]?.id ?? '');
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [previewState, setPreviewState] = useState<PreviewState>('loading');
  const [previewMuted, setPreviewMuted] = useState(false);
  const [masterVolume, setMasterVolume] = useState(1);
  const [viewerFullscreen, setViewerFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [addClipsOpen, setAddClipsOpen] = useState(false);
  const [waveform, setWaveform] = useState<MontageAudioWaveform | null>(null);
  const [musicPending, setMusicPending] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [musicPreviewWarning, setMusicPreviewWarning] = useState<string | null>(null);

  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);
  const selectedSegment = project.segments.find((segment) => segment.id === selectedSegmentId) ?? project.segments[0];
  const selectedClip = selectedSegment ? clipsById.get(selectedSegment.clipId) : undefined;
  const representativeClip = project.segments
    .map((segment) => clipsById.get(segment.clipId))
    .find((clip): clip is Clip => Boolean(clip));
  const missingSegmentCount = project.segments.filter((segment) => !clipsById.has(segment.clipId)).length;
  const proportionalBytes = project.segments.reduce((total, segment) => {
    const clip = clipsById.get(segment.clipId);
    if (!clip) return total;
    return total + clip.fileSize * segmentDurationMs(segment) / Math.max(1, clip.durationMs);
  }, 0) + (project.music?.asset.fileSize ?? 0);

  projectRef.current = project;
  clipsRef.current = clips;
  masterVolumeRef.current = masterVolume;
  previewMutedRef.current = previewMuted;
  playingRef.current = playing;
  activeSlotRef.current = activeSlot;

  const changeProject = useCallback((next: MontageProjectV2, mergeKey?: string) => {
    const normalized = normalizeMontageProject(next);
    const now = Date.now();
    setHistory((current) => {
      if (current.present === normalized) return current;
      if (mergeKey && current.mergeKey === mergeKey && now - current.mergedAt < 900) {
        return { ...current, present: normalized, future: [], mergedAt: now };
      }
      return {
        past: [...current.past, current.present].slice(-80),
        present: normalized,
        future: [],
        mergeKey: mergeKey ?? null,
        mergedAt: now,
      };
    });
    setError(null);
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, 80),
        mergeKey: null,
        mergedAt: 0,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: [...current.past, current.present].slice(-80),
        present: next,
        future: current.future.slice(1),
        mergeKey: null,
        mergedAt: 0,
      };
    });
  }, []);

  const stopPlaybackFrame = useCallback(() => {
    if (playbackFrameRef.current === null) return;
    window.cancelAnimationFrame(playbackFrameRef.current);
    playbackFrameRef.current = null;
  }, []);

  const pausePlayback = useCallback(() => {
    videoARef.current?.pause();
    videoBRef.current?.pause();
    musicRef.current?.pause();
    setPlaying(false);
    playingRef.current = false;
    stopPlaybackFrame();
  }, [stopPlaybackFrame]);

  const syncMusic = useCallback(async (timeMs: number, resume: boolean) => {
    const audio = musicRef.current;
    const currentProject = projectRef.current;
    if (!audio || !currentProject.music) return;
    const playback = musicPlaybackAt(currentProject.music, timeMs, currentProject.durationMs);
    if (!playback.active) {
      audio.pause();
      return;
    }
    const assetId = currentProject.music.asset.id;
    if (audio.dataset.assetId !== assetId) {
      audio.dataset.assetId = assetId;
      audio.src = `switchboard-media://montage-audio/${encodeURIComponent(assetId)}`;
      audio.preload = 'auto';
      audio.load();
      try {
        await waitForMetadata(audio);
        setMusicPreviewWarning(null);
      } catch {
        setMusicPreviewWarning('Music preview is unavailable in Chromium. FFmpeg export can still use this file.');
        return;
      }
    }
    const targetSeconds = playback.sourceTimeMs / 1_000;
    if (Math.abs(audio.currentTime - targetSeconds) > 0.08) audio.currentTime = targetSeconds;
    audio.muted = previewMutedRef.current;
    audio.volume = clamp(playback.gain * masterVolumeRef.current, 0, 1);
    if (resume) {
      try { await audio.play(); } catch { setMusicPreviewWarning('Music preview could not start. Export remains available.'); }
    }
  }, []);

  const seekMontage = useCallback(async (requestedMs: number, resume = false) => {
    const currentProject = projectRef.current;
    const mapping = mapMontageTime(currentProject.segments, requestedMs);
    if (!mapping) return;
    const clip = clipsRef.current.find((candidate) => candidate.id === mapping.segment.clipId);
    if (!clip) {
      pausePlayback();
      setPreviewState('error');
      setError('The selected source clip is missing from the library.');
      return;
    }

    const generation = ++seekGenerationRef.current;
    const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    const inactiveSlot: 0 | 1 = activeSlotRef.current === 0 ? 1 : 0;
    const inactiveVideo = inactiveSlot === 0 ? videoARef.current : videoBRef.current;
    const matchingActive = activeVideo?.dataset.clipId === clip.id;
    const matchingInactive = inactiveVideo?.dataset.clipId === clip.id;
    const targetSlot: 0 | 1 = matchingActive ? activeSlotRef.current : matchingInactive ? inactiveSlot : inactiveSlot;
    const targetVideo = targetSlot === 0 ? videoARef.current : videoBRef.current;
    if (!targetVideo) return;

    pausePlayback();
    setPreviewState('loading');
    try {
      await prepareVideo(targetVideo, clip.id, mapping.sourceTimeMs);
      if (generation !== seekGenerationRef.current) return;
      activeSlotRef.current = targetSlot;
      setActiveSlot(targetSlot);
      setSelectedSegmentId(mapping.segment.id);
      const nextMs = clamp(requestedMs, 0, currentProject.durationMs);
      currentMsRef.current = nextMs;
      lastRenderedMsRef.current = nextMs;
      setCurrentMs(nextMs);
      applyVideoVolume(targetVideo, mapping.segment);
      setPreviewState('ready');
      await syncMusic(nextMs, resume);
      if (resume) {
        await targetVideo.play();
        setPlaying(true);
        playingRef.current = true;
      }
    } catch {
      if (generation !== seekGenerationRef.current) return;
      setPreviewState('error');
      setError(`Preview could not decode ${clip.name}.`);
    }
  }, [pausePlayback, syncMusic]);

  const advancePlayback = useCallback(async () => {
    const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
    if (!mapping) return;
    const next = projectRef.current.segments[mapping.segmentIndex + 1];
    if (!next) {
      pausePlayback();
      currentMsRef.current = projectRef.current.durationMs;
      lastRenderedMsRef.current = currentMsRef.current;
      setCurrentMs(currentMsRef.current);
      return;
    }
    await seekMontage(mapping.montageEndMs, true);
  }, [pausePlayback, seekMontage]);

  const tickPlayback = useCallback(() => {
    playbackFrameRef.current = null;
    if (!playingRef.current) return;
    const currentProject = projectRef.current;
    const mapping = mapMontageTime(currentProject.segments, currentMsRef.current);
    const video = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    if (!mapping || !video || video.paused) return;
    const sourceTimeMs = video.currentTime * 1_000;
    const thresholdMs = Math.max(8, 500 / Math.max(1, clipsRef.current.find((clip) => clip.id === mapping.segment.clipId)?.fps || 30));
    if (sourceTimeMs >= mapping.segment.trimEndMs - thresholdMs) {
      void advancePlayback();
      return;
    }
    const nextMs = clamp(
      mapping.montageStartMs + sourceTimeMs - mapping.segment.trimStartMs,
      mapping.montageStartMs,
      mapping.montageEndMs,
    );
    currentMsRef.current = nextMs;
    if (Math.abs(nextMs - lastRenderedMsRef.current) >= 50) {
      lastRenderedMsRef.current = nextMs;
      setCurrentMs(nextMs);
    }

    const audio = musicRef.current;
    const musicPlayback = musicPlaybackAt(currentProject.music, nextMs, currentProject.durationMs);
    if (audio && currentProject.music) {
      if (!musicPlayback.active) {
        audio.pause();
      } else if (audio.dataset.assetId === currentProject.music.asset.id) {
        const desired = musicPlayback.sourceTimeMs / 1_000;
        if (Math.abs(audio.currentTime - desired) > 0.16) audio.currentTime = desired;
        audio.muted = previewMutedRef.current;
        audio.volume = clamp(musicPlayback.gain * masterVolumeRef.current, 0, 1);
        if (audio.paused) void audio.play().catch(() => undefined);
      }
    }
    playbackFrameRef.current = window.requestAnimationFrame(tickPlayback);
  }, [advancePlayback]);

  useEffect(() => {
    if (!playing) {
      stopPlaybackFrame();
      return;
    }
    playbackFrameRef.current ??= window.requestAnimationFrame(tickPlayback);
    return stopPlaybackFrame;
  }, [playing, stopPlaybackFrame, tickPlayback]);

  useEffect(() => {
    backRef.current?.focus();
    void seekMontage(0, false);
    return () => {
      stopPlaybackFrame();
      for (const media of [videoARef.current, videoBRef.current, musicRef.current]) {
        if (!media) continue;
        media.pause();
        media.removeAttribute('src');
        media.load();
      }
    };
  }, []);

  useEffect(() => {
    const videos = [videoARef.current, videoBRef.current].filter((video): video is HTMLVideoElement => Boolean(video));
    const handleEnded = () => { if (playingRef.current) void advancePlayback(); };
    for (const video of videos) video.addEventListener('ended', handleEnded);
    return () => { for (const video of videos) video.removeEventListener('ended', handleEnded); };
  }, [advancePlayback]);

  useEffect(() => {
    if (project.segments.some((segment) => segment.id === selectedSegmentId)) return;
    setSelectedSegmentId(project.segments[0]?.id ?? '');
  }, [project.segments, selectedSegmentId]);

  useEffect(() => {
    const durationsChanged = projectRef.current.segments.some((segment) => {
      const clip = clips.find((candidate) => candidate.id === segment.clipId);
      return Boolean(clip && clip.durationMs >= minimumMontageSegmentMs && clip.durationMs !== segment.sourceDurationMs);
    });
    if (!durationsChanged) return;
    const reconciled = reconcileMontageProject(projectRef.current, clips);
    setHistory((current) => ({ ...current, present: reconciled, future: [], mergeKey: null, mergedAt: 0 }));
  }, [clips]);

  useEffect(() => {
    const requestedMs = Math.min(currentMsRef.current, Math.max(0, project.durationMs - 1));
    const mapping = mapMontageTime(project.segments, requestedMs);
    const video = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    if (!mapping || !video) return;
    const sourceTimeMs = video.currentTime * 1_000;
    const sourceChanged = video.dataset.clipId !== mapping.segment.clipId;
    const outsideTrim = sourceTimeMs < mapping.segment.trimStartMs - 40
      || sourceTimeMs > mapping.segment.trimEndMs + 40;
    if (currentMsRef.current >= project.durationMs || sourceChanged || outsideTrim) {
      void seekMontage(requestedMs, playingRef.current);
      return;
    }
    applyVideoVolume(video, mapping.segment);
    void syncMusic(currentMsRef.current, playingRef.current);
  }, [project, seekMontage, syncMusic]);

  useEffect(() => {
    if (!project.music) {
      setWaveform(null);
      setMusicPreviewWarning(null);
      musicRef.current?.pause();
      return;
    }
    let active = true;
    setWaveform(null);
    void montageV2Api.loadMontageAudioWaveform(project.music.asset.id)
      .then((next) => { if (active) setWaveform(next); })
      .catch((cause) => { if (active) setMusicPreviewWarning(errorMessage(cause)); });
    return () => { active = false; };
  }, [project.music?.asset.id]);

  useEffect(() => {
    const generation = project.updatedAt;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      void montageV2Api.saveMontageDraft(project)
        .then(() => {
          if (projectRef.current.updatedAt !== generation) return;
          setSaveState('saved');
          onDraftsChanged();
        })
        .catch((cause) => {
          if (projectRef.current.updatedAt !== generation) return;
          setSaveState('error');
          setError(`Autosave failed: ${errorMessage(cause)}`);
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [onDraftsChanged, project]);

  useEffect(() => {
    if (!viewerFullscreen) return;
    const closeFullscreen = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setViewerFullscreen(false);
    };
    window.addEventListener('keydown', closeFullscreen, { capture: true });
    return () => window.removeEventListener('keydown', closeFullscreen, { capture: true });
  }, [viewerFullscreen]);

  const togglePlayback = async () => {
    if (playingRef.current) {
      pausePlayback();
      return;
    }
    if (currentMsRef.current >= projectRef.current.durationMs) await seekMontage(0, false);
    const video = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
    const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
    if (!video || !mapping) return;
    applyVideoVolume(video, mapping.segment);
    await syncMusic(currentMsRef.current, true);
    try {
      await video.play();
      setPlaying(true);
      playingRef.current = true;
    } catch {
      setPreviewState('error');
      setError('Montage playback could not start.');
    }
  };

  const importMusic = async () => {
    setMusicPending(true);
    setError(null);
    try {
      const asset = await montageV2Api.importMontageAudio();
      if (!asset) return;
      changeProject({ ...projectRef.current, music: createMontageMusicTrack(asset) });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setMusicPending(false);
    }
  };

  const duplicateSelected = () => {
    if (!selectedSegment) return;
    const currentIndex = project.segments.findIndex((segment) => segment.id === selectedSegment.id);
    const next = duplicateMontageSegment(project, selectedSegment.id);
    changeProject(next);
    const duplicate = next.segments[currentIndex + 1];
    if (duplicate) setSelectedSegmentId(duplicate.id);
  };

  const splitSelected = () => {
    if (!selectedSegment) return;
    const mapping = mapMontageTime(project.segments, currentMsRef.current);
    const sourceTimeMs = mapping?.segment.id === selectedSegment.id
      ? mapping.sourceTimeMs
      : selectedSegment.trimStartMs + segmentDurationMs(selectedSegment) / 2;
    const currentIndex = project.segments.findIndex((segment) => segment.id === selectedSegment.id);
    const next = splitMontageSegment(project, selectedSegment.id, sourceTimeMs);
    if (next === project) return;
    changeProject(next);
    const second = next.segments[currentIndex + 1];
    if (second) setSelectedSegmentId(second.id);
  };

  const removeSelected = () => {
    if (!selectedSegment || project.segments.length <= 1) return;
    const index = project.segments.findIndex((segment) => segment.id === selectedSegment.id);
    const next = removeMontageSegment(project, selectedSegment.id);
    changeProject(next);
    const fallback = next.segments[Math.min(index, next.segments.length - 1)];
    if (fallback) setSelectedSegmentId(fallback.id);
  };

  const discardDraft = async () => {
    pausePlayback();
    try {
      await montageV2Api.deleteMontageDraft(project.id);
      onDraftsChanged();
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const exportMontage = async (preset: ClipExportPreset, exportId: string): Promise<boolean> => {
    setExportPending(true);
    setError(null);
    try {
      await montageV2Api.saveMontageDraft(projectRef.current);
      const exported = await montageV2Api.exportMontageV2({ exportId, preset, project: projectRef.current });
      if (exported) onDraftsChanged();
      return exported;
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setExportPending(false);
    }
  };

  const cancelExport = async (exportId: string) => {
    await montageV2Api.cancelMontageV2Export(exportId);
    setExportPending(false);
  };

  const closeComposer = useCallback(async () => {
    if (exportPending) {
      setError('Cancel the active export before closing this montage.');
      return;
    }
    pausePlayback();
    setSaveState('saving');
    try {
      await montageV2Api.saveMontageDraft(projectRef.current);
      setSaveState('saved');
      onDraftsChanged();
      onClose();
    } catch (cause) {
      setSaveState('error');
      setError(`Could not save the montage before closing: ${errorMessage(cause)}`);
    }
  }, [exportPending, onClose, onDraftsChanged, pausePlayback]);

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (!typing && event.code === 'Space') {
      event.preventDefault();
      void togglePlayback();
      return;
    }
    if (!typing && event.key === 'Delete') {
      event.preventDefault();
      removeSelected();
      return;
    }
    if (!typing && event.key.toLocaleLowerCase() === 's') {
      event.preventDefault();
      splitSelected();
      return;
    }
    if (event.key === 'Escape' && !viewerFullscreen && !event.defaultPrevented && !document.querySelector('[role="dialog"][data-state="open"]')) {
      event.preventDefault();
      void closeComposer();
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

  return (
    <section
      ref={editorRef}
      className="montage-v2-shell"
      role="dialog"
      aria-modal="true"
      aria-labelledby="montage-v2-title"
      onKeyDown={keepFocusInside}
    >
      <header className="montage-v2-header no-drag">
        <Button ref={backRef} type="button" variant="ghost" size="sm" className="px-2" onClick={() => void closeComposer()}>
          <ArrowLeft className="size-4" /> Back to clips
        </Button>
        <div className="montage-v2-header__identity">
          <Input
            id="montage-v2-title"
            value={project.name}
            maxLength={120}
            aria-label="Montage name"
            onChange={(event) => changeProject({ ...project, name: event.currentTarget.value || 'Untitled montage' }, 'project:name')}
          />
          <span data-state={saveState}>
            <Save aria-hidden="true" />
            {saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Not saved' : 'Saved'}
          </span>
        </div>
        <dl className="montage-v2-header__metadata">
          <Metadata label="Duration" value={formatDuration(project.durationMs / 1_000)} />
          <Metadata label="Sequence" value={`${project.segments.length} ${project.segments.length === 1 ? 'clip' : 'clips'}`} />
          <Metadata label="Audio" value={project.music ? project.music.asset.name : 'Clip audio only'} />
          <Metadata label="Output" value={project.canvasSize === '9:16' ? '9:16 vertical' : 'Original canvas'} />
        </dl>
        <div className="montage-v2-header__actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={inspectorOpen ? 'Collapse inspector' : 'Open inspector'} onClick={() => onInspectorOpenChange(!inspectorOpen)}>
                {inspectorOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{inspectorOpen ? 'Collapse inspector' : 'Open inspector'}</TooltipContent>
          </Tooltip>
          {representativeClip ? (
            <ShareClipDialog
              clip={representativeClip}
              startMs={0}
              endMs={project.durationMs}
              selectedDurationMs={project.durationMs}
              sourceBytes={proportionalBytes}
              projectType="montage"
              segmentCount={project.segments.length}
              exportPending={exportPending}
              disabled={missingSegmentCount > 0 || project.durationMs < 100}
              onExport={exportMontage}
              onCancelExport={cancelExport}
            />
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Discard montage draft" onClick={() => void discardDraft()}>
                <Trash2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Discard draft</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {error || musicPreviewWarning || missingSegmentCount > 0 ? (
        <div className="montage-v2-notice" data-error={Boolean(error || missingSegmentCount) || undefined} role={error ? 'alert' : 'status'}>
          {error ?? (missingSegmentCount > 0
            ? `${missingSegmentCount} montage ${missingSegmentCount === 1 ? 'segment references' : 'segments reference'} missing media. Remove or restore the source before export.`
            : musicPreviewWarning)}
          <button type="button" onClick={() => { setError(null); setMusicPreviewWarning(null); }}>Dismiss</button>
        </div>
      ) : null}

      <div className="montage-v2-layout" data-inspector={inspectorOpen ? 'open' : 'closed'}>
        <main className="montage-v2-workspace">
          <div className="montage-v2-preview" data-state={previewState} data-fullscreen={viewerFullscreen || undefined} data-canvas={project.canvasSize}>
            <video ref={videoARef} data-slot="0" data-active={activeSlot === 0 || undefined} preload="metadata" aria-label="Montage preview" />
            <video ref={videoBRef} data-slot="1" data-active={activeSlot === 1 || undefined} preload="metadata" aria-hidden={activeSlot !== 1} />
            <audio ref={musicRef} preload="metadata" />
            <div className="montage-v2-preview__transport no-drag">
              <button type="button" onClick={() => void togglePlayback()}>{playing ? 'Pause' : 'Play'}</button>
              <output>{formatEditorTime(currentMs)} / {formatEditorTime(project.durationMs)}</output>
              <button type="button" aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'} onClick={() => {
                const next = !previewMuted;
                setPreviewMuted(next);
                previewMutedRef.current = next;
                for (const media of [videoARef.current, videoBRef.current, musicRef.current]) if (media) media.muted = next;
              }}>{previewMuted ? <VolumeX /> : <Volume2 />}</button>
              <Slider
                className="montage-v2-preview__volume"
                min={0}
                max={100}
                step={1}
                value={[Math.round(masterVolume * 100)]}
                aria-label="Preview volume"
                onValueChange={([value]) => {
                  if (typeof value !== 'number') return;
                  const next = value / 100;
                  setMasterVolume(next);
                  masterVolumeRef.current = next;
                  const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
                  const video = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
                  if (mapping && video) applyVideoVolume(video, mapping.segment);
                  void syncMusic(currentMsRef.current, false);
                }}
              />
              <button type="button" aria-label={viewerFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => setViewerFullscreen((current) => !current)}>
                {viewerFullscreen ? <Minimize /> : <Maximize />}
              </button>
            </div>
            {previewState !== 'ready' ? (
              <div className="montage-v2-preview__status" role={previewState === 'error' ? 'alert' : 'status'}>
                <strong>{previewState === 'error' ? 'Preview unavailable' : 'Preparing montage'}</strong>
                <span>{previewState === 'error' ? 'Check the selected source clip.' : 'Loading the current segment and audio…'}</span>
              </div>
            ) : null}
          </div>

          <MontageV2Timeline
            project={project}
            clips={clips}
            selectedSegmentId={selectedSegmentId}
            currentMs={currentMs}
            zoom={zoom}
            waveform={waveform}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            onZoomChange={setZoom}
            onProjectChange={changeProject}
            onSelectSegment={setSelectedSegmentId}
            onSeek={(timeMs) => void seekMontage(timeMs, false)}
            onAddClips={() => setAddClipsOpen(true)}
            onAddMusic={() => void importMusic()}
            onDuplicate={duplicateSelected}
            onSplit={splitSelected}
            onRemove={removeSelected}
            onUndo={undo}
            onRedo={redo}
          />
        </main>

        <aside className="montage-v2-inspector" aria-label="Montage inspector" aria-hidden={!inspectorOpen || undefined} inert={!inspectorOpen ? true : undefined}>
          <ScrollArea className="h-full">
            <div className="montage-v2-inspector__content">
              <div className="montage-v2-inspector__heading">
                <span>Montage inspector</span>
                <h2>{selectedClip?.name ?? 'Missing source'}</h2>
                {selectedClip ? (
                  <button type="button" onClick={() => onReveal(selectedClip)}><FolderOpen /> Show source</button>
                ) : null}
              </div>

              <InspectorSection title="Canvas">
                <RadioGroup className="montage-v2-canvas" value={project.canvasSize} onValueChange={(value) => changeProject({ ...project, canvasSize: value as ClipCanvasSize })}>
                  {canvasSizes.map((option) => (
                    <label key={option.id} data-active={project.canvasSize === option.id || undefined}>
                      <RadioGroupItem value={option.id} className="sr-only" />
                      <i data-shape={option.id} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </RadioGroup>
              </InspectorSection>

              <Separator />
              <InspectorSection title="Selected segment">
                {selectedSegment ? (
                  <>
                    <div className="montage-v2-readout-grid">
                      <Readout label="Position" value={`${project.segments.findIndex((segment) => segment.id === selectedSegment.id) + 1} of ${project.segments.length}`} />
                      <Readout label="Source" value={selectedClip ? formatVideoQuality(selectedClip.width, selectedClip.height, selectedClip.fps) : 'Unavailable'} />
                      <Readout label="Duration" value={formatDuration(segmentDurationMs(selectedSegment) / 1_000)} />
                      <Readout label="Size" value={selectedClip ? formatBytes(selectedClip.fileSize) : 'Unavailable'} />
                    </div>
                    <LabeledSlider
                      label="Clip audio"
                      value={selectedSegment.muted ? 0 : Math.round(selectedSegment.volume * 100)}
                      onChange={(value) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({ ...segment, muted: false, volume: value / 100 })), `segment:${selectedSegment.id}:volume`)}
                    />
                    {selectedClip?.audioChannels && selectedClip.audioChannels.length > 0 ? (
                      <div className="montage-v2-channel-mix">
                        <p>Source-channel levels are applied during export.</p>
                        {selectedClip.audioChannels.map((channel, trackIndex) => {
                          const level = selectedSegment.audioTrackLevels?.[trackIndex] ?? 100;
                          return (
                            <label key={`${channel}-${trackIndex}`} style={{ '--track-color': channelColor(channel) } as CSSProperties}>
                              <span><i aria-hidden="true" />{channelLabels[channel]}<output>{level}%</output></span>
                              <Slider min={0} max={100} step={1} value={[level]} aria-label={`${channelLabels[channel]} export level`} onValueChange={([next]) => {
                                if (typeof next !== 'number') return;
                                changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => {
                                  const levels = [...(segment.audioTrackLevels ?? [])];
                                  while (levels.length <= trackIndex) levels.push(100);
                                  levels[trackIndex] = next;
                                  while (levels.at(-1) === 100) levels.pop();
                                  return { ...segment, audioTrackLevels: levels.length > 0 ? levels : undefined };
                                }), `segment:${selectedSegment.id}:track:${trackIndex}`);
                              }} />
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="montage-v2-inline-fields">
                      <TimeField
                        label="Trim start"
                        valueMs={selectedSegment.trimStartMs}
                        maximumMs={selectedSegment.trimEndMs - minimumMontageSegmentMs}
                        onChange={(value) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({ ...segment, trimStartMs: value })), `segment:${selectedSegment.id}:trim-start`)}
                      />
                      <TimeField
                        label="Trim end"
                        valueMs={selectedSegment.trimEndMs}
                        minimumMs={selectedSegment.trimStartMs + minimumMontageSegmentMs}
                        maximumMs={selectedSegment.sourceDurationMs}
                        onChange={(value) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({ ...segment, trimEndMs: value })), `segment:${selectedSegment.id}:trim-end`)}
                      />
                    </div>
                    <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({ ...segment, muted: !segment.muted })))}>
                      {selectedSegment.muted ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                      {selectedSegment.muted ? 'Restore clip audio' : 'Mute clip audio'}
                    </Button>
                  </>
                ) : null}
              </InspectorSection>

              <Separator />
              <InspectorSection title="Music">
                {!project.music ? (
                  <div className="montage-v2-music-empty-state">
                    <Music2 aria-hidden="true" />
                    <p>Add a local audio file beneath the clip sequence.</p>
                    <Button type="button" variant="primary" size="sm" disabled={musicPending} onClick={() => void importMusic()}>
                      {musicPending ? 'Importing…' : 'Choose audio file'}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="montage-v2-music-identity">
                      <div><Music2 /><span><strong>{project.music.asset.name}</strong><small>{formatDuration(project.music.asset.durationMs / 1_000)} · {formatBytes(project.music.asset.fileSize)}</small></span></div>
                      <button type="button" onClick={() => changeProject({ ...project, music: undefined })}>Remove</button>
                    </div>
                    <LabeledSlider
                      label="Music volume"
                      value={project.music.muted ? 0 : Math.round(project.music.volume * 100)}
                      onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, muted: false, volume: value / 100 })), 'music:volume')}
                    />
                    <div className="montage-v2-inline-fields">
                      <TimeField label="Timeline start" valueMs={project.music.timelineStartMs} maximumMs={project.durationMs - 1} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, timelineStartMs: value })), 'music:start')} />
                      <TimeField label="Fade in" valueMs={project.music.fadeInMs} maximumMs={30_000} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, fadeInMs: value })), 'music:fade-in')} />
                    </div>
                    <div className="montage-v2-inline-fields">
                      <TimeField label="Source in" valueMs={project.music.sourceStartMs} maximumMs={project.music.sourceEndMs - minimumMontageSegmentMs} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, sourceStartMs: value })), 'music:source-in')} />
                      <TimeField label="Source out" valueMs={project.music.sourceEndMs} minimumMs={project.music.sourceStartMs + minimumMontageSegmentMs} maximumMs={project.music.asset.durationMs} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, sourceEndMs: value })), 'music:source-out')} />
                    </div>
                    <div className="montage-v2-inline-fields">
                      <TimeField label="Fade out" valueMs={project.music.fadeOutMs} maximumMs={30_000} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, fadeOutMs: value })), 'music:fade-out')} />
                      <div className="montage-v2-switch-field"><span><strong>Loop track</strong><small>Fill remaining montage</small></span><Switch checked={project.music.loop} onCheckedChange={(loop) => changeProject(updateMontageMusic(project, (track) => ({ ...track, loop })))} aria-label="Loop music track" /></div>
                    </div>
                    <div className="montage-v2-music-actions">
                      <Button type="button" variant="secondary" size="sm" disabled={musicPending} onClick={() => void importMusic()}>{musicPending ? 'Importing…' : 'Replace music'}</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => changeProject(updateMontageMusic(project, (track) => ({ ...track, muted: !track.muted })))}>{project.music.muted ? 'Unmute' : 'Mute'}</Button>
                    </div>
                  </>
                )}
              </InspectorSection>
            </div>
          </ScrollArea>
        </aside>
      </div>

      <AddMontageClipsDialog
        open={addClipsOpen}
        clips={clips}
        onOpenChange={setAddClipsOpen}
        onAdd={(nextClips) => {
          const next = addClipsToMontage(projectRef.current, nextClips, selectedSegmentId);
          changeProject(next);
          const selectedIndex = next.segments.findIndex((segment) => segment.id === selectedSegmentId);
          const added = next.segments[selectedIndex + 1];
          if (added) setSelectedSegmentId(added.id);
        }}
      />
    </section>
  );

  function applyVideoVolume(video: HTMLVideoElement, segment: MontageV2Segment): void {
    video.muted = previewMutedRef.current;
    video.volume = clamp((segment.muted ? 0 : segment.volume) * masterVolumeRef.current, 0, 1);
  }
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="montage-v2-inspector__section"><h3>{title}</h3>{children}</section>;
}

function Metadata({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>;
}

function Readout({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function LabeledSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="montage-v2-slider-field">
      <span><strong>{label}</strong><output>{value}%</output></span>
      <Slider min={0} max={100} step={1} value={[value]} onValueChange={([next]) => { if (typeof next === 'number') onChange(next); }} aria-label={label} />
    </label>
  );
}

function TimeField({
  label,
  valueMs,
  minimumMs = 0,
  maximumMs,
  onChange,
}: {
  label: string;
  valueMs: number;
  minimumMs?: number;
  maximumMs: number;
  onChange: (valueMs: number) => void;
}) {
  return (
    <label className="montage-v2-time-field">
      <span>{label}</span>
      <div><Input type="number" min={minimumMs / 1_000} max={maximumMs / 1_000} step={0.01} value={(valueMs / 1_000).toFixed(2)} onChange={(event) => {
        const value = Number(event.currentTarget.value) * 1_000;
        if (Number.isFinite(value)) onChange(clamp(Math.round(value), minimumMs, maximumMs));
      }} /><em>s</em></div>
    </label>
  );
}

async function prepareVideo(video: HTMLVideoElement, clipId: string, sourceTimeMs: number): Promise<void> {
  if (video.dataset.clipId !== clipId) {
    video.dataset.clipId = clipId;
    video.src = `switchboard-media://clip/${encodeURIComponent(clipId)}`;
    video.preload = 'auto';
    video.load();
  }
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) await waitForMetadata(video);
  video.currentTime = Math.max(0, sourceTimeMs) / 1_000;
}

function waitForMetadata(media: HTMLMediaElement): Promise<void> {
  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Media metadata could not be read.')); };
    const cleanup = () => {
      media.removeEventListener('loadedmetadata', finish);
      media.removeEventListener('error', fail);
    };
    media.addEventListener('loadedmetadata', finish, { once: true });
    media.addEventListener('error', fail, { once: true });
  });
}

function formatEditorTime(milliseconds: number): string {
  const value = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.floor(value / 1_000) % 60;
  const millis = value % 1_000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
