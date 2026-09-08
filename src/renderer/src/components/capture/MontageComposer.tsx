import { ClipAudioInspector } from './ClipAudioInspector';
import { EditedAudioPreview } from './EditedAudioPreview';
import { Star, Pencil } from 'lucide-react';
import { speedAt, sourceToEditedMs, type VideoEdits } from '../../../../shared/video-edits';
import { AdvancedVideoControls, AudioAutomationControls, NumberControl, type EditTool } from './AdvancedVideoControls';
import { EditedVideoCanvas } from './EditedVideoCanvas';
import { PreciseTimeField, PreciseTrimControls, VideoEditControls } from './VideoEditControls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VideoEditPreview } from './VideoEditPreview';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  FolderOpen,
  Maximize,
  Minimize,
  Music2,
  Pause,
  Play,
  SkipBack,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Clip, ClipCanvasSize, ClipExportPreset, PreparedShareFile } from '../../../../shared/contracts';
import type {
  MontageAudioWaveform,
  MontageProjectV2,
  MontageV2Segment,
} from '../../../../shared/montage-v2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  montageStartForSegment,
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
import './clip-inspector.css';

type PreviewState = 'loading' | 'ready' | 'error';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
const draftSaveError = 'Your latest edits are still open. The draft could not be saved to disk.';

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
  sourceClipActions,
}: {
  sourceClipActions?: { clip: Clip; onRename: () => void; onFavorite: (favorite: boolean) => void; onDelete: () => void };
  initialProject: MontageProjectV2;
  clips: readonly Clip[];
  inspectorOpen: boolean;
  onClose: () => void;
  onInspectorOpenChange: (open: boolean) => void;
  onReveal: (clip: Clip) => void;
  onDraftsChanged: () => void;
}) {
  const [editTool, setEditTool] = useState<EditTool>('framing');
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const duckGainRef = useRef(1);
  const playbackClockRef = useRef({ wall: 0, time: 0 });
  const editorRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const musicSettingsRef = useRef<HTMLDivElement>(null);
  const [musicSettingsRequested, setMusicSettingsRequested] = useState(false);
  const [inspectorSection, setInspectorSection] = useState<'segment' | 'audio' | 'music'>('segment');
  const playbackFrameRef = useRef<number | null>(null);
  const currentMsRef = useRef(0);
  const lastRenderedMsRef = useRef(0);
  const activeSlotRef = useRef<0 | 1>(0);
  const playingRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const discardingRef = useRef(false);
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
  const [nameDraft, setNameDraft] = useState(project.name);
  useEffect(() => setNameDraft(project.name), [project.name]);
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
    projectRef.current = normalized;
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
    if (!playback.active) {
      audio.pause();
      return;
    }
    const targetSeconds = playback.sourceTimeMs / 1_000;
    if (Math.abs(audio.currentTime - targetSeconds) > 0.08) audio.currentTime = targetSeconds;
    audio.muted = previewMutedRef.current;
    audio.volume = clamp(playback.gain * masterVolumeRef.current * duckGainRef.current, 0, 1);
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
    const nextMs = clamp(requestedMs, 0, currentProject.durationMs);
    currentMsRef.current = nextMs;
    setCurrentMs(nextMs);
    setPreviewState('loading');
    try {
      await prepareVideo(targetVideo, clip.id, mapping.sourceTimeMs);
      if (generation !== seekGenerationRef.current) return;
      activeSlotRef.current = targetSlot;
      setActiveSlot(targetSlot);
      setSelectedSegmentId(mapping.segment.id);
      currentMsRef.current = nextMs;
      lastRenderedMsRef.current = nextMs;
      setCurrentMs(nextMs);
      applyVideoVolume(targetVideo, mapping.segment);
      setPreviewState('ready');
      await syncMusic(nextMs, resume);
      if (generation !== seekGenerationRef.current) return;
      if (resume) {
        playbackClockRef.current = { wall: performance.now(), time: nextMs };
        if (!mapping.frozen) await targetVideo.play();
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
    if (!mapping || !video) return;
    const nextMs = Math.min(currentProject.durationMs, playbackClockRef.current.time + performance.now() - playbackClockRef.current.wall);
    if (nextMs >= mapping.montageEndMs) { void advancePlayback(); return; }
    const desired = mapMontageTime(currentProject.segments, nextMs);
    if (!desired) return;
    video.playbackRate = speedAt(desired.sourceTimeMs, desired.segment.videoEdits);
    if (desired.frozen) {
      video.pause();
      if (Math.abs(video.currentTime * 1000 - desired.sourceTimeMs) > 25) video.currentTime = desired.sourceTimeMs / 1000;
    } else {
      if (Math.abs(video.currentTime * 1000 - desired.sourceTimeMs) > 160) video.currentTime = desired.sourceTimeMs / 1000;
      if (video.paused) void video.play().catch(() => { pausePlayback(); setError('Preview playback could not continue.'); });
    }
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
        audio.volume = clamp(musicPlayback.gain * masterVolumeRef.current * duckGainRef.current, 0, 1);
        if (audio.paused) void audio.play().catch(() => undefined);
      }
    }
    playbackFrameRef.current = window.requestAnimationFrame(tickPlayback);
  }, [advancePlayback, pausePlayback]);

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
      seekGenerationRef.current += 1;
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

  const persistDraft = useCallback(async (generation: MontageProjectV2) => {
    if (discardingRef.current) return;
    setSaveState('saving');
    try {
      await montageV2Api.saveMontageDraft(generation);
      if (discardingRef.current || projectRef.current !== generation) return;
      setSaveState('saved');
      setError(previous => previous === draftSaveError ? null : previous);
      onDraftsChanged();
    } catch (cause) {
      if (discardingRef.current || projectRef.current !== generation) return;
      console.warn('Draft save failed', cause);
      setSaveState('error');
      setError(draftSaveError);
    }
  }, [onDraftsChanged]);

  useEffect(() => {
    setSaveState('saving');
    const timer = window.setTimeout(() => { void persistDraft(project); }, 450);
    autosaveTimerRef.current = timer;
    return () => window.clearTimeout(timer);
  }, [persistDraft, project]);

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
      playbackClockRef.current = { wall: performance.now(), time: currentMsRef.current };
      if (!mapping.frozen) await video.play();
      setPlaying(true);
      playingRef.current = true;
    } catch {
      setPreviewState('error');
      setError('Montage playback could not start.');
    }
  };

  const importMusic = async () => {
    if (musicPending) return;
    pausePlayback();
    setMusicPending(true);
    setError(null);
    try {
      const asset = await montageV2Api.importMontageAudio();
      if (!asset) return;
      changeProject({ ...projectRef.current, music: createMontageMusicTrack(asset) });
      openMusicSettings();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setMusicPending(false);
    }
  };

  const openMusicSettings = () => {
    setInspectorSection('music');
    onInspectorOpenChange(true);
    setMusicSettingsRequested(true);
  };

  useEffect(() => {
    if (!inspectorOpen || !musicSettingsRequested) return;
    musicSettingsRef.current?.scrollIntoView({ block: 'start' });
    musicSettingsRef.current?.focus({ preventScroll: true });
    setMusicSettingsRequested(false);
  }, [inspectorOpen, musicSettingsRequested, project.music]);

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
      : (selectedSegment.trimStartMs + selectedSegment.trimEndMs) / 2;
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
    if (exportPending || discardingRef.current) return;
    discardingRef.current = true;
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
    pausePlayback();
    try {
      await montageV2Api.deleteMontageDraft(project.id);
      onDraftsChanged();
      onClose();
    } catch (cause) {
      discardingRef.current = false;
      setError(errorMessage(cause));
    }
  };

  const exportMontage = async (preset: ClipExportPreset, exportId: string, targetSizeMb?: number): Promise<PreparedShareFile | null> => {
    setExportPending(true);
    setError(null);
    try {
      await montageV2Api.saveMontageDraft(projectRef.current);
      const exported = await montageV2Api.exportMontageV2({ exportId, preset, targetSizeMb, project: projectRef.current });
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
    if (event.defaultPrevented || !editorRef.current?.contains(target)) return;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || Boolean(target.closest('[role="combobox"], [role="listbox"], [role="menu"]'));
    if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (!typing && event.code === 'Space' && !target.closest('button, [role="switch"], [role="radio"]')) {
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
      data-editor-kind={project.sourceClipId ? "clip" : "montage"}
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
            value={nameDraft}
            maxLength={120}
            aria-label={project.sourceClipId ? "Clip edit name" : "Montage name"}
            onChange={(event) => setNameDraft(event.currentTarget.value)}
            onBlur={() => { const name = nameDraft.trim() || (project.sourceClipId ? 'Untitled clip' : 'Untitled montage'); setNameDraft(name); if (name !== project.name) changeProject({ ...project, name }, 'project:name'); }}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.stopPropagation(); setNameDraft(project.name); } }}
          />
          <span data-state={saveState} role="status">
            <Save aria-hidden="true" />
            {saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Not saved' : 'Saved'}
          </span>
        </div>
        <div className="montage-v2-header__actions">
          {sourceClipActions ? <>
            <Button variant="ghost" size="icon" className="montage-v2-favorite" aria-label={sourceClipActions.clip.favorite ? 'Unfavorite clip' : 'Favorite clip'} aria-pressed={sourceClipActions.clip.favorite} onClick={() => sourceClipActions.onFavorite(!sourceClipActions.clip.favorite)}><Star className="size-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Rename source clip" onClick={sourceClipActions.onRename}><Pencil className="size-4" /></Button>
          </> : null}
          <label className="montage-v2-output">Canvas
            <Select value={project.canvasSize} onValueChange={(value) => changeProject({ ...project, canvasSize: value as ClipCanvasSize })}>
              <SelectTrigger aria-label={project.sourceClipId ? "Clip canvas" : "Montage canvas"} className="no-drag w-32"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="original">Original</SelectItem><SelectItem value="16:9">16:9 landscape</SelectItem><SelectItem value="9:16">9:16 vertical</SelectItem><SelectItem value="1:1">1:1 square</SelectItem><SelectItem value="4:5">4:5 portrait</SelectItem></SelectContent>
            </Select>
          </label>
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
              getPreviewCanvas={() => { pausePlayback(); return editorRef.current?.querySelector<HTMLCanvasElement>('.edited-video-frame canvas') ?? null; }}
              sourceBytes={proportionalBytes}
              projectType={project.sourceClipId ? "single" : "montage"}
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
          {error === draftSaveError ? <button type="button" disabled={saveState === 'saving'} onClick={() => void persistDraft(projectRef.current)}>{saveState === 'saving' ? 'Saving…' : 'Retry save'}</button> : <button type="button" onClick={() => { setError(null); setMusicPreviewWarning(null); }}>Dismiss</button>}
        </div>
      ) : null}

      <div className="montage-v2-layout" data-inspector={inspectorOpen ? 'open' : 'closed'}>
        <main className="montage-v2-workspace">
          <div className="montage-v2-preview" data-edited="true" data-state={previewState} data-fullscreen={viewerFullscreen || undefined} data-canvas={project.canvasSize}>
            <video ref={videoARef} muted data-slot="0" data-active={activeSlot === 0 || undefined} preload="metadata" aria-label="Montage preview" />
            <video ref={videoBRef} muted data-slot="1" data-active={activeSlot === 1 || undefined} preload="metadata" aria-hidden={activeSlot !== 1} />
            <EditedAudioPreview state={(() => { const mapping = mapMontageTime(project.segments, currentMs); return mapping ? { segment: mapping.segment, sourceMs: mapping.sourceTimeMs, frozen: mapping.frozen, playing, volume: masterVolume, muted: previewMuted, ducking: project.music?.ducking } : null; })()}
              onDuckGain={gain => { duckGainRef.current = gain; }} onError={setMusicPreviewWarning} />
            <EditedVideoCanvas videoRef={activeSlot === 0 ? videoARef : videoBRef} edits={mapMontageTime(project.segments, currentMs)?.segment.videoEdits} canvasSize={project.canvasSize}
              sourceMs={mapMontageTime(project.segments, currentMs)?.sourceTimeMs ?? 0} startMs={mapMontageTime(project.segments, currentMs)?.segment.trimStartMs ?? 0}
              tool={inspectorSection === 'segment' ? editTool : 'audio'} selectedOverlayId={selectedOverlayId} onPause={pausePlayback}
              onChange={(videoEdits, key) => {
                const segment = mapMontageTime(projectRef.current.segments, currentMsRef.current)?.segment;
                if (segment) changeProject(updateMontageSegment(projectRef.current, segment.id, item => ({ ...item, videoEdits })), key);
              }} />
            <audio ref={musicRef} preload="metadata" />
            {previewState !== 'ready' ? (
              <div className="montage-v2-preview__status" role={previewState === 'error' ? 'alert' : 'status'}>
                <strong>{previewState === 'error' ? 'Preview unavailable' : 'Preparing montage'}</strong>
                <span>{previewState === 'error' ? 'Check the selected source clip.' : 'Loading the current segment and audio…'}</span>
              </div>
            ) : null}
          </div>

          <MontageV2Timeline
            viewerFullscreen={viewerFullscreen}
            playbackControls={
              <div className="montage-v2-preview__playback" role="group" aria-label="Playback controls">
                <button type="button" aria-label="Back to start" onClick={() => void seekMontage(0, false)}><SkipBack /></button>
                <button type="button" className="montage-v2-play" disabled={previewState !== 'ready'} onClick={() => void togglePlayback()}>{playing ? <Pause /> : <Play />}{playing ? 'Pause' : 'Play'}</button>
                <output aria-label="Playback time">{formatEditorTime(currentMs)} <span>/ {formatEditorTime(project.durationMs)}</span></output>
              </div>
            }
            previewControls={
              <div className="montage-v2-preview__utilities">
                <button type="button" aria-label={previewMuted ? 'Unmute preview' : 'Mute preview'} onClick={() => {
                  const next = !previewMuted;
                  setPreviewMuted(next);
                  previewMutedRef.current = next;
                  if (musicRef.current) musicRef.current.muted = next;
                }}>{previewMuted ? <VolumeX /> : <Volume2 />}</button>
                <Slider
                  variant="fader"
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
            }
            project={project}
            clips={clips}
            selectedSegmentId={selectedSegmentId}
            currentMs={currentMs}
            zoom={zoom}
            waveform={waveform}
            canUndo={history.past.length > 0}
            canRedo={history.future.length > 0}
            onEditAudio={(trackIndex) => { if (trackIndex !== undefined) setSelectedAudioTrack(trackIndex); setInspectorSection('audio'); onInspectorOpenChange(true); }}
            musicPending={musicPending}
            onEditMusic={openMusicSettings}
            onZoomChange={setZoom}
            onProjectChange={changeProject}
            onSelectSegment={(id) => { setSelectedSegmentId(id); if (inspectorSection === 'music') setInspectorSection('segment'); }}
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

        <aside className="montage-v2-inspector clip-inspector no-drag" aria-label={project.sourceClipId ? 'Clip inspector' : 'Montage inspector'} aria-hidden={!inspectorOpen || undefined} inert={!inspectorOpen ? true : undefined}>
          <header className="clip-inspector__header">
            <div className="clip-inspector__eyebrow"><span>Inspector</span>{selectedSegment ? <span>{formatEditorTime(inspectorSection === 'music' ? project.durationMs : segmentDurationMs(selectedSegment))} {inspectorSection === 'music' ? 'total' : 'selected'}</span> : null}</div>
            <h2 title={inspectorSection === 'music' ? project.name : selectedClip?.name}>{inspectorSection === 'music' ? project.name : selectedClip?.name ?? 'Missing source'}</h2>
            <div className="clip-inspector__navigation" role="group" aria-label="Inspector section">
              <Button type="button" variant="ghost" size="sm" aria-pressed={inspectorSection === 'segment'} onClick={() => setInspectorSection('segment')}>Edit</Button>
              <Button type="button" variant="ghost" size="sm" aria-pressed={inspectorSection === 'audio'} onClick={() => setInspectorSection('audio')}><Volume2 aria-hidden="true" />Audio</Button>
              {!project.sourceClipId ? <Button type="button" variant="ghost" size="sm" aria-pressed={inspectorSection === 'music'} onClick={openMusicSettings}><Music2 aria-hidden="true" />Music</Button> : null}
            </div>
          </header>
          <ScrollArea className="clip-inspector__scroll" key={inspectorSection}>
            <div className="montage-v2-inspector__content">
              {inspectorSection === 'segment' && selectedSegment && selectedClip ? <>
                <section className="inspector-control-section inspector-video-trim" aria-labelledby="inspector-trim-heading">
                  <div className="inspector-section-title"><h3 id="inspector-trim-heading">Trim clip</h3><span>{selectedClip.fps} fps</span></div>
                  <PreciseTrimControls startMs={selectedSegment.trimStartMs} endMs={selectedSegment.trimEndMs} durationMs={selectedSegment.sourceDurationMs} fps={selectedClip.fps}
                    onChange={(trimStartMs, trimEndMs) => changeProject(updateMontageSegment(project, selectedSegment.id, segment => ({ ...segment, trimStartMs, trimEndMs })), `segment:${selectedSegment.id}:trim`)}
                    getCurrentMs={() => mapMontageTime(projectRef.current.segments, currentMsRef.current)?.sourceTimeMs ?? selectedSegment.trimStartMs}
                    onSeek={sourceMs => { void seekMontage(montageStartForSegment(project.segments, selectedSegment.id) + sourceToEditedMs(selectedSegment.trimStartMs, sourceMs, selectedSegment.videoEdits)); }} />
                </section>
                <section className="inspector-control-section" aria-label="Video adjustments">
                  <AdvancedVideoControls edits={selectedSegment.videoEdits} clip={selectedClip} startMs={selectedSegment.trimStartMs} endMs={selectedSegment.trimEndMs}
                    currentMs={mapMontageTime(project.segments, currentMs)?.sourceTimeMs ?? selectedSegment.trimStartMs}
                    tool={editTool} onToolChange={setEditTool} selectedOverlayId={selectedOverlayId} onSelectOverlay={setSelectedOverlayId}
                    onSeek={sourceMs => { void seekMontage(montageStartForSegment(project.segments, selectedSegment.id) + sourceToEditedMs(selectedSegment.trimStartMs, sourceMs, selectedSegment.videoEdits)); }}
                    onChange={(videoEdits, key) => changeProject(updateMontageSegment(project, selectedSegment.id, segment => ({ ...segment, videoEdits })), key)} />
                </section>
              </> : null}
              {inspectorSection === 'audio' && selectedSegment && selectedClip ? <ClipAudioInspector
                clip={selectedClip} segment={selectedSegment} selectedTrackIndex={selectedAudioTrack} onSelectTrack={setSelectedAudioTrack}
                currentMs={mapMontageTime(project.segments, currentMs)?.sourceTimeMs ?? selectedSegment.trimStartMs}
                onChange={(next, key) => changeProject(updateMontageSegment(project, selectedSegment.id, () => next), key)}
                onSeek={sourceMs => { void seekMontage(montageStartForSegment(project.segments, selectedSegment.id) + sourceToEditedMs(selectedSegment.trimStartMs, sourceMs, selectedSegment.videoEdits)); }} /> : null}
              {inspectorSection !== 'music' && !selectedClip ? <p className="inspector-empty" role="status">The source clip is unavailable. Restore it to continue editing.</p> : null}
              {!project.sourceClipId && inspectorSection === 'music' ?
              <div ref={musicSettingsRef} className="montage-v2-music-settings" tabIndex={-1}>
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
                    <div className="editor-music-trim">
                      <div className="editor-music-waveform" aria-label="Music source waveform">
                        {waveform?.samples.length ? <svg viewBox="0 0 240 48" preserveAspectRatio="none" aria-hidden="true">{waveform.samples.map((sample, index) => <line key={index} x1={index / waveform.samples.length * 240} x2={index / waveform.samples.length * 240} y1={24 - sample * 22} y2={24 + sample * 22} />)}</svg> : <span>{musicPreviewWarning ? 'Waveform unavailable' : 'Reading waveform…'}</span>}
                        <i style={{ left: 0, width: `${project.music.sourceStartMs / project.music.asset.durationMs * 100}%` }} /><i style={{ right: 0, width: `${(1 - project.music.sourceEndMs / project.music.asset.durationMs) * 100}%` }} />
                      </div>
                      <Slider min={0} max={project.music.asset.durationMs} step={1} minStepsBetweenThumbs={100} value={[project.music.sourceStartMs, project.music.sourceEndMs]} thumbLabels={['Music trim start', 'Music trim end']} thumbValueText={[formatEditorTime(project.music.sourceStartMs), formatEditorTime(project.music.sourceEndMs)]} onValueChange={([sourceStartMs, sourceEndMs]) => {
                        if (sourceStartMs === undefined || sourceEndMs === undefined) return;
                        changeProject(updateMontageMusic(project, (track) => ({ ...track, sourceStartMs, sourceEndMs })), 'music:trim');
                      }} />
                      <p>{formatEditorTime(project.music.sourceEndMs - project.music.sourceStartMs)} selected{project.music.loop ? ' · Loops to fill montage' : ''}</p>
                    </div>
                    <div className="montage-v2-inline-fields">
                      <PreciseTimeField label="Source in" valueMs={project.music.sourceStartMs} maximumMs={project.music.sourceEndMs - minimumMontageSegmentMs} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, sourceStartMs: value })), 'music:source-in')} />
                      <PreciseTimeField label="Source out" valueMs={project.music.sourceEndMs} minimumMs={project.music.sourceStartMs + minimumMontageSegmentMs} maximumMs={project.music.asset.durationMs} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, sourceEndMs: value })), 'music:source-out')} />
                    </div>
                    <LabeledSlider
                      label="Music volume"
                      value={project.music.muted ? 0 : Math.round(project.music.volume * 100)}
                      onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, muted: false, volume: value / 100 })), 'music:volume')}
                    />
                    <div className="montage-v2-inline-fields">
                      <PreciseTimeField label="Timeline start" valueMs={project.music.timelineStartMs} maximumMs={project.durationMs - 1} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, timelineStartMs: value })), 'music:start')} />
                      <PreciseTimeField label="Fade in" valueMs={project.music.fadeInMs} maximumMs={30_000} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, fadeInMs: value })), 'music:fade-in')} />
                    </div>
                    <div className="montage-v2-inline-fields">
                      <PreciseTimeField label="Fade out" valueMs={project.music.fadeOutMs} maximumMs={30_000} onChange={(value) => changeProject(updateMontageMusic(project, (track) => ({ ...track, fadeOutMs: value })), 'music:fade-out')} />
                    </div>
                    <div className="montage-v2-switch-field"><span><strong>Loop track</strong><small>Fill remaining montage</small></span><Switch checked={project.music.loop} onCheckedChange={(loop) => changeProject(updateMontageMusic(project, (track) => ({ ...track, loop })))} aria-label="Loop music track" /></div>
                    <details className="advanced-music-automation"><summary>Volume automation & voice ducking</summary>
                      <AudioAutomationControls automation={project.music.automation ?? { points: [], mutes: [] }} currentMs={currentMs} startMs={0} endMs={project.durationMs}
                        onSeek={time => { void seekMontage(time); }} onChange={(automation, key) => changeProject(updateMontageMusic(project, track => ({ ...track, automation })), key ? `music:automation:${key}` : undefined)} />
                      <div className="montage-v2-switch-field"><span><strong>Duck music under voice</strong><small>Uses activity on the separate microphone track</small></span><Switch aria-label="Duck music under voice" checked={project.music.ducking?.enabled ?? false}
                        disabled={!project.segments.some(segment => clipsById.get(segment.clipId)?.audioChannels?.includes('microphone'))}
                        onCheckedChange={enabled => changeProject(updateMontageMusic(project, track => ({ ...track, ducking: { amount: 0.75, attackMs: 80, releaseMs: 500, ...track.ducking, enabled } })))} /></div>
                      {!project.segments.some(segment => clipsById.get(segment.clipId)?.audioChannels?.includes('microphone')) ? <p>A separate microphone track is required.</p> : null}
                      {project.music.ducking?.enabled ? <NumberControl label="Ducking reduction %" value={project.music.ducking.amount * 100} onChange={amount => changeProject(updateMontageMusic(project, track => ({ ...track, ducking: { ...track.ducking!, amount: amount / 100 } })), 'music:ducking')} /> : null}
                    </details>
                    <div className="montage-v2-music-actions">
                      <Button type="button" variant="secondary" size="sm" disabled={musicPending} onClick={() => void importMusic()}>{musicPending ? 'Importing…' : 'Replace music'}</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => changeProject(updateMontageMusic(project, (track) => ({ ...track, muted: !track.muted })))}>{project.music.muted ? 'Unmute' : 'Mute'}</Button>
                    </div>
                  </>
                )}
              </InspectorSection>
              </div> : null}
              {selectedClip && inspectorSection !== 'music' ? <details className="inspector-disclosure inspector-source-info">
                <summary><span>Source details</span><small>{formatVideoQuality(selectedClip.width, selectedClip.height, selectedClip.fps)}</small></summary>
                <p className="inspector-source-name">{selectedClip.name}</p>
                <dl><div><dt>Duration</dt><dd>{formatEditorTime(selectedClip.durationMs)}</dd></div><div><dt>Size</dt><dd>{formatBytes(selectedClip.fileSize)}</dd></div>{!project.sourceClipId ? <div><dt>Segment</dt><dd>{project.segments.findIndex(segment => segment.id === selectedSegmentId) + 1} of {project.segments.length}</dd></div> : null}</dl>
                <Button type="button" variant="ghost" size="sm" onClick={() => onReveal(selectedClip)}><FolderOpen />Show source</Button>
              </details> : null}
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
    video.playbackRate = speedAt(video.currentTime * 1000, segment.videoEdits);
    video.preservesPitch = true;
    video.muted = true;
    video.volume = clamp((segment.muted ? 0 : segment.volume) * masterVolumeRef.current, 0, 1);
  }
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="montage-v2-inspector__section"><h3>{title}</h3>{children}</section>;
}

function LabeledSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="montage-v2-slider-field">
      <span><strong>{label}</strong><output>{value}%</output></span>
      <Slider variant="fader" min={0} max={100} step={1} value={[value]} onValueChange={([next]) => { if (typeof next === 'number') onChange(next); }} aria-label={label} />
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
  if (video.dataset.clipId !== clipId) throw new Error('Preview source changed during seek.');
  video.currentTime = Math.max(0, sourceTimeMs) / 1_000;
}

function waitForMetadata(media: HTMLMediaElement): Promise<void> {
  if (media.error) return Promise.reject(new Error('Media metadata could not be read.'));
  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Media metadata could not be read.')); };
    const cleanup = () => {
      window.clearTimeout(timeout);
      media.removeEventListener('loadedmetadata', finish);
      media.removeEventListener('error', fail);
      media.removeEventListener('abort', fail);
    };
    const timeout = window.setTimeout(fail, 10_000);
    media.addEventListener('loadedmetadata', finish, { once: true });
    media.addEventListener('error', fail, { once: true });
    media.addEventListener('abort', fail, { once: true });
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
  return [...root.querySelectorAll<HTMLElement>('a[href], summary, button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
