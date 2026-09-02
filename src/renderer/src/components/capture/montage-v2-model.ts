import type { Clip } from '../../../../shared/contracts';
import {
  montageProjectV2Schema,
  montageV2SchemaVersion,
  type MontageAudioAsset,
  type MontageMusicTrack,
  type MontageProjectV2,
  type MontageV2Segment,
} from '../../../../shared/montage-v2';

export const minimumMontageSegmentMs = 100;

export interface MontageTimeMapping {
  segment: MontageV2Segment;
  segmentIndex: number;
  montageStartMs: number;
  montageEndMs: number;
  sourceTimeMs: number;
}

export interface MontageMusicPlayback {
  active: boolean;
  sourceTimeMs: number;
  gain: number;
  activeDurationMs: number;
}

export function createMontageProjectV2(clips: readonly Clip[]): MontageProjectV2 {
  const usableClips = clips.filter((clip) => clip.durationMs >= minimumMontageSegmentMs);
  if (usableClips.length === 0) throw new Error('Add at least one clip with a readable duration to create a montage.');
  const now = Date.now();
  return normalizeMontageProject({
    schemaVersion: montageV2SchemaVersion,
    type: 'montage',
    id: crypto.randomUUID(),
    name: 'Untitled montage',
    createdAt: now,
    updatedAt: now,
    durationMs: 1,
    canvasSize: usableClips[0]?.canvasSize ?? 'original',
    segments: usableClips.map(createMontageSegment),
  });
}

export function createMontageSegment(clip: Clip): MontageV2Segment {
  if (clip.durationMs < minimumMontageSegmentMs) {
    throw new Error(`${clip.name} does not have enough readable media to add to a montage.`);
  }
  const requestedStartMs = Math.max(0, Math.round(clip.trimStartMs ?? 0));
  const trimStartMs = Math.min(clip.durationMs - minimumMontageSegmentMs, requestedStartMs);
  const requestedEndMs = Math.min(clip.durationMs, Math.round(clip.trimEndMs ?? clip.durationMs));
  const trimEndMs = Math.max(trimStartMs + minimumMontageSegmentMs, requestedEndMs);
  return {
    id: crypto.randomUUID(),
    clipId: clip.id,
    sourceDurationMs: clip.durationMs,
    trimStartMs,
    trimEndMs,
    volume: 1,
    muted: false,
    ...(clip.audioTrackLevels && clip.audioTrackLevels.length > 0
      ? { audioTrackLevels: [...clip.audioTrackLevels] }
      : {}),
    ...(clip.audioTrackTrims && clip.audioTrackTrims.length > 0
      ? { audioTrackTrims: clip.audioTrackTrims.map((trim) => trim ? { ...trim } : null) }
      : {}),
  };
}

export function createMontageMusicTrack(asset: MontageAudioAsset): MontageMusicTrack {
  return {
    id: crypto.randomUUID(),
    asset,
    timelineStartMs: 0,
    sourceStartMs: 0,
    sourceEndMs: asset.durationMs,
    volume: 0.18,
    muted: false,
    fadeInMs: Math.min(1_000, Math.floor(asset.durationMs / 4)),
    fadeOutMs: Math.min(1_500, Math.floor(asset.durationMs / 4)),
    loop: true,
  };
}

export function normalizeMontageProject(project: MontageProjectV2): MontageProjectV2 {
  const durationMs = project.segments.reduce((total, segment) => total + segmentDurationMs(segment), 0);
  const safeDurationMs = Math.max(1, durationMs);
  const music = project.music
    ? normalizeMusicTrack(project.music, safeDurationMs)
    : undefined;
  return montageProjectV2Schema.parse({
    ...project,
    durationMs: safeDurationMs,
    updatedAt: Date.now(),
    ...(music ? { music } : { music: undefined }),
  });
}

export function reconcileMontageProject(project: MontageProjectV2, clips: readonly Clip[]): MontageProjectV2 {
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const segments = project.segments.map((segment) => {
    const clip = clipsById.get(segment.clipId);
    if (!clip || clip.durationMs === segment.sourceDurationMs) return segment;
    const trimStartMs = Math.min(segment.trimStartMs, Math.max(0, clip.durationMs - minimumMontageSegmentMs));
    const trimEndMs = Math.max(
      trimStartMs + minimumMontageSegmentMs,
      Math.min(segment.trimEndMs, clip.durationMs),
    );
    return { ...segment, sourceDurationMs: clip.durationMs, trimStartMs, trimEndMs };
  });
  return normalizeMontageProject({ ...project, segments });
}

export function segmentDurationMs(segment: Pick<MontageV2Segment, 'trimStartMs' | 'trimEndMs'>): number {
  return Math.max(0, segment.trimEndMs - segment.trimStartMs);
}

export function mapMontageTime(
  segments: readonly MontageV2Segment[],
  requestedMontageTimeMs: number,
): MontageTimeMapping | null {
  if (segments.length === 0) return null;
  const durationMs = segments.reduce((total, segment) => total + segmentDurationMs(segment), 0);
  const montageTimeMs = Math.min(durationMs, Math.max(0, requestedMontageTimeMs));
  let montageStartMs = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const montageEndMs = montageStartMs + segmentDurationMs(segment);
    if (montageTimeMs < montageEndMs || index === segments.length - 1) {
      const localOffsetMs = Math.min(
        segmentDurationMs(segment),
        Math.max(0, montageTimeMs - montageStartMs),
      );
      return {
        segment,
        segmentIndex: index,
        montageStartMs,
        montageEndMs,
        sourceTimeMs: segment.trimStartMs + localOffsetMs,
      };
    }
    montageStartMs = montageEndMs;
  }
  return null;
}

export function montageStartForSegment(segments: readonly MontageV2Segment[], segmentId: string): number {
  let startMs = 0;
  for (const segment of segments) {
    if (segment.id === segmentId) return startMs;
    startMs += segmentDurationMs(segment);
  }
  return 0;
}

export function addClipsToMontage(
  project: MontageProjectV2,
  clips: readonly Clip[],
  afterSegmentId?: string,
): MontageProjectV2 {
  if (clips.length === 0) return project;
  const segments = [...project.segments];
  const selectedIndex = afterSegmentId
    ? segments.findIndex((segment) => segment.id === afterSegmentId)
    : segments.length - 1;
  const insertionIndex = selectedIndex < 0 ? segments.length : selectedIndex + 1;
  segments.splice(insertionIndex, 0, ...clips.map(createMontageSegment));
  return normalizeMontageProject({ ...project, segments });
}

export function duplicateMontageSegment(project: MontageProjectV2, segmentId: string): MontageProjectV2 {
  const index = project.segments.findIndex((segment) => segment.id === segmentId);
  const source = project.segments[index];
  if (!source) return project;
  const duplicate: MontageV2Segment = {
    ...source,
    id: crypto.randomUUID(),
    ...(source.audioTrackLevels ? { audioTrackLevels: [...source.audioTrackLevels] } : {}),
    ...(source.audioTrackTrims
      ? { audioTrackTrims: source.audioTrackTrims.map((trim) => trim ? { ...trim } : null) }
      : {}),
  };
  const segments = [...project.segments];
  segments.splice(index + 1, 0, duplicate);
  return normalizeMontageProject({ ...project, segments });
}

export function splitMontageSegment(
  project: MontageProjectV2,
  segmentId: string,
  requestedSourceTimeMs: number,
): MontageProjectV2 {
  const index = project.segments.findIndex((segment) => segment.id === segmentId);
  const source = project.segments[index];
  if (!source || segmentDurationMs(source) < minimumMontageSegmentMs * 2) return project;
  const splitMs = Math.min(
    source.trimEndMs - minimumMontageSegmentMs,
    Math.max(source.trimStartMs + minimumMontageSegmentMs, Math.round(requestedSourceTimeMs)),
  );
  const first: MontageV2Segment = { ...source, trimEndMs: splitMs };
  const second: MontageV2Segment = {
    ...source,
    id: crypto.randomUUID(),
    trimStartMs: splitMs,
    ...(source.audioTrackLevels ? { audioTrackLevels: [...source.audioTrackLevels] } : {}),
    ...(source.audioTrackTrims
      ? { audioTrackTrims: source.audioTrackTrims.map((trim) => trim ? { ...trim } : null) }
      : {}),
  };
  const segments = [...project.segments];
  segments.splice(index, 1, first, second);
  return normalizeMontageProject({ ...project, segments });
}

export function removeMontageSegment(project: MontageProjectV2, segmentId: string): MontageProjectV2 {
  if (project.segments.length <= 1) return project;
  const segments = project.segments.filter((segment) => segment.id !== segmentId);
  return segments.length === project.segments.length
    ? project
    : normalizeMontageProject({ ...project, segments });
}

export function reorderMontageSegment(
  project: MontageProjectV2,
  activeId: string,
  overId: string,
): MontageProjectV2 {
  const from = project.segments.findIndex((segment) => segment.id === activeId);
  const to = project.segments.findIndex((segment) => segment.id === overId);
  if (from < 0 || to < 0 || from === to) return project;
  const segments = [...project.segments];
  const moved = segments.splice(from, 1)[0];
  if (!moved) return project;
  segments.splice(to, 0, moved);
  return normalizeMontageProject({ ...project, segments });
}

export function updateMontageSegment(
  project: MontageProjectV2,
  segmentId: string,
  update: (segment: MontageV2Segment) => MontageV2Segment,
): MontageProjectV2 {
  let changed = false;
  const segments = project.segments.map((segment) => {
    if (segment.id !== segmentId) return segment;
    changed = true;
    return normalizeSegment(update(segment));
  });
  return changed ? normalizeMontageProject({ ...project, segments }) : project;
}

export function updateMontageMusic(
  project: MontageProjectV2,
  update: (track: MontageMusicTrack) => MontageMusicTrack,
): MontageProjectV2 {
  if (!project.music) return project;
  return normalizeMontageProject({
    ...project,
    music: normalizeMusicTrack(update(project.music), project.durationMs),
  });
}

export function musicPlaybackAt(
  track: MontageMusicTrack | undefined,
  montageTimeMs: number,
  projectDurationMs: number,
): MontageMusicPlayback {
  if (!track || track.muted || track.volume <= 0 || montageTimeMs < track.timelineStartMs) {
    return { active: false, sourceTimeMs: track?.sourceStartMs ?? 0, gain: 0, activeDurationMs: 0 };
  }
  const sourceDurationMs = Math.max(1, track.sourceEndMs - track.sourceStartMs);
  const availableProjectMs = Math.max(0, projectDurationMs - track.timelineStartMs);
  const activeDurationMs = track.loop ? availableProjectMs : Math.min(sourceDurationMs, availableProjectMs);
  const localTimelineMs = montageTimeMs - track.timelineStartMs;
  if (localTimelineMs < 0 || localTimelineMs >= activeDurationMs) {
    return { active: false, sourceTimeMs: track.sourceStartMs, gain: 0, activeDurationMs };
  }
  const sourceOffsetMs = track.loop ? localTimelineMs % sourceDurationMs : localTimelineMs;
  const fadeIn = track.fadeInMs > 0 ? Math.min(1, localTimelineMs / track.fadeInMs) : 1;
  const remainingMs = activeDurationMs - localTimelineMs;
  const fadeOut = track.fadeOutMs > 0 ? Math.min(1, remainingMs / track.fadeOutMs) : 1;
  return {
    active: true,
    sourceTimeMs: track.sourceStartMs + sourceOffsetMs,
    gain: track.volume * Math.max(0, Math.min(fadeIn, fadeOut)),
    activeDurationMs,
  };
}

export function musicTimelineDurationMs(track: MontageMusicTrack, projectDurationMs: number): number {
  const available = Math.max(0, projectDurationMs - track.timelineStartMs);
  return track.loop ? available : Math.min(available, track.sourceEndMs - track.sourceStartMs);
}

function normalizeSegment(segment: MontageV2Segment): MontageV2Segment {
  const trimStartMs = Math.max(
    0,
    Math.min(segment.sourceDurationMs - minimumMontageSegmentMs, Math.round(segment.trimStartMs)),
  );
  const trimEndMs = Math.max(
    trimStartMs + minimumMontageSegmentMs,
    Math.min(segment.sourceDurationMs, Math.round(segment.trimEndMs)),
  );
  return {
    ...segment,
    trimStartMs,
    trimEndMs,
    volume: Math.max(0, Math.min(1, segment.volume)),
  };
}

function normalizeMusicTrack(track: MontageMusicTrack, projectDurationMs: number): MontageMusicTrack {
  const sourceStartMs = Math.max(
    0,
    Math.min(track.asset.durationMs - minimumMontageSegmentMs, Math.round(track.sourceStartMs)),
  );
  const sourceEndMs = Math.max(
    sourceStartMs + minimumMontageSegmentMs,
    Math.min(track.asset.durationMs, Math.round(track.sourceEndMs)),
  );
  const activeDurationMs = track.loop
    ? Math.max(0, projectDurationMs - track.timelineStartMs)
    : Math.min(sourceEndMs - sourceStartMs, Math.max(0, projectDurationMs - track.timelineStartMs));
  const maxFadeMs = Math.max(0, Math.floor(activeDurationMs / 2));
  return {
    ...track,
    timelineStartMs: Math.max(0, Math.min(projectDurationMs - 1, Math.round(track.timelineStartMs))),
    sourceStartMs,
    sourceEndMs,
    volume: Math.max(0, Math.min(1, track.volume)),
    fadeInMs: Math.max(0, Math.min(maxFadeMs, Math.round(track.fadeInMs))),
    fadeOutMs: Math.max(0, Math.min(maxFadeMs, Math.round(track.fadeOutMs))),
  };
}
