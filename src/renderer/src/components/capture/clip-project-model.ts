import type { Clip, ClipAudioTrackTrim, ClipCanvasSize } from '../../../../shared/contracts';

export interface ClipEditorSegment {
  id: string;
  source: Clip;
  trimStartMs: number;
  trimEndMs: number;
  audioTrackLevels: number[];
  audioTrackTrims: Array<ClipAudioTrackTrim | null>;
  unavailableReason?: string;
}

interface ClipEditorProjectBase {
  id: string;
  name: string;
  segments: ClipEditorSegment[];
  durationMs: number;
  canvasSize: ClipCanvasSize;
}

export interface SingleClipEditorProject extends ClipEditorProjectBase {
  type: 'single';
  segments: [ClipEditorSegment];
}

export interface MontageClipEditorProject extends ClipEditorProjectBase {
  type: 'montage';
}

export type ClipEditorProject = SingleClipEditorProject | MontageClipEditorProject;

export interface MontageTimeMapping {
  segment: ClipEditorSegment;
  segmentIndex: number;
  montageStartMs: number;
  montageEndMs: number;
  sourceTimeMs: number;
}

export function createSingleClipProject(clip: Clip): SingleClipEditorProject {
  const segment = createClipProjectSegment(clip);
  return {
    type: 'single',
    id: `single:${clip.id}`,
    name: clip.name,
    segments: [segment],
    durationMs: segmentDurationMs(segment),
    canvasSize: clip.canvasSize,
  };
}

export function createMontageProject(clips: readonly Clip[]): MontageClipEditorProject {
  const segments = clips.map(createClipProjectSegment);
  return normalizeClipProject({
    type: 'montage',
    id: `montage:${crypto.randomUUID()}`,
    name: 'Untitled montage',
    segments,
    durationMs: 0,
    canvasSize: clips[0]?.canvasSize ?? 'original',
  });
}

export function createClipProjectSegment(clip: Clip): ClipEditorSegment {
  return {
    id: crypto.randomUUID(),
    source: clip,
    trimStartMs: clip.trimStartMs ?? 0,
    trimEndMs: clip.trimEndMs ?? clip.durationMs,
    audioTrackLevels: [...(clip.audioTrackLevels ?? [])],
    audioTrackTrims: [...(clip.audioTrackTrims ?? [])],
  };
}

export function normalizeClipProject<T extends ClipEditorProject>(project: T): T {
  return {
    ...project,
    durationMs: project.segments.reduce((total, segment) => total + segmentDurationMs(segment), 0),
  };
}

export function segmentDurationMs(segment: Pick<ClipEditorSegment, 'trimStartMs' | 'trimEndMs'>): number {
  return Math.max(0, segment.trimEndMs - segment.trimStartMs);
}

export function mapMontageTime(
  segments: readonly ClipEditorSegment[],
  requestedMontageTimeMs: number,
): MontageTimeMapping | null {
  if (segments.length === 0) return null;
  const durationMs = segments.reduce((total, segment) => total + segmentDurationMs(segment), 0);
  const montageTimeMs = Math.min(durationMs, Math.max(0, requestedMontageTimeMs));
  let montageStartMs = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const montageEndMs = montageStartMs + segmentDurationMs(segment);
    if (montageTimeMs < montageEndMs || index === segments.length - 1) {
      const localOffsetMs = Math.min(segmentDurationMs(segment), Math.max(0, montageTimeMs - montageStartMs));
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

export function montageStartForSegment(segments: readonly ClipEditorSegment[], segmentId: string): number {
  let montageStartMs = 0;
  for (const segment of segments) {
    if (segment.id === segmentId) return montageStartMs;
    montageStartMs += segmentDurationMs(segment);
  }
  return 0;
}

export function reorderProjectSegment<T extends ClipEditorProject>(project: T, activeId: string, overId: string): T {
  const from = project.segments.findIndex((segment) => segment.id === activeId);
  const to = project.segments.findIndex((segment) => segment.id === overId);
  if (from < 0 || to < 0 || from === to) return project;
  const segments = [...project.segments];
  const [moved] = segments.splice(from, 1);
  segments.splice(to, 0, moved!);
  return normalizeClipProject({ ...project, segments } as T);
}

export function updateProjectSegment<T extends ClipEditorProject>(
  project: T,
  segmentId: string,
  update: (segment: ClipEditorSegment) => ClipEditorSegment,
): T {
  const segments = project.segments.map((segment) => segment.id === segmentId ? update(segment) : segment);
  return normalizeClipProject({ ...project, segments } as T);
}

export function removeProjectSegment<T extends ClipEditorProject>(project: T, segmentId: string): T {
  return normalizeClipProject({
    ...project,
    segments: project.segments.filter((segment) => segment.id !== segmentId),
  } as T);
}
