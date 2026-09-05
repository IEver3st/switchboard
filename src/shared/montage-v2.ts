import { montageMusicTrackSchema, type MontageMusicTrack, type MontageAudioAsset, type MontageAudioWaveform } from './montage-audio';
export { montageAudioAssetSchema, montageAudioWaveformSchema, montageMusicTrackSchema } from './montage-audio';
export type { MontageMusicTrack, MontageAudioAsset, MontageAudioWaveform } from './montage-audio';
import { z } from 'zod';
import { editedDurationMs, videoEditsSchema } from './video-edits';
import {
  clipAudioTrackTrimsSchema,
  clipCanvasSizeSchema,
  clipExportPresetSchema,
  type ClipAudioTrackTrim,
  type ClipCanvasSize,
  type ClipExportPreset,
  type PreparedShareFile,
} from './contracts';

export const montageV2SchemaVersion = 2 as const;

export const montageV2SegmentSchema = z.object({
  videoEdits: videoEditsSchema.optional(),
  id: z.string().uuid(),
  clipId: z.string().min(1).max(256),
  sourceDurationMs: z.number().int().positive(),
  trimStartMs: z.number().int().nonnegative(),
  trimEndMs: z.number().int().positive(),
  volume: z.number().min(0).max(1).default(1),
  muted: z.boolean().default(false),
  audioTrackLevels: z.array(z.number().int().min(0).max(100)).max(8).optional(),
  audioTrackTrims: clipAudioTrackTrimsSchema.optional(),
}).superRefine((segment, context) => {
  if (segment.trimEndMs <= segment.trimStartMs) {
    context.addIssue({ code: 'custom', message: 'The segment trim end must be after its start.', path: ['trimEndMs'] });
  }
  if (segment.trimEndMs > segment.sourceDurationMs) {
    context.addIssue({ code: 'custom', message: 'The segment trim exceeds its source duration.', path: ['trimEndMs'] });
  }
  if (segment.trimEndMs - segment.trimStartMs < 100) {
    context.addIssue({ code: 'custom', message: 'Keep at least 0.1 seconds in each montage segment.', path: ['trimEndMs'] });
  }
});
export type MontageV2Segment = z.infer<typeof montageV2SegmentSchema>;

export const montageProjectV2Schema = z.object({
  schemaVersion: z.literal(montageV2SchemaVersion),
  type: z.literal('montage'),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  canvasSize: clipCanvasSizeSchema,
  segments: z.array(montageV2SegmentSchema).min(1).max(500),
  music: montageMusicTrackSchema.optional(),
}).superRefine((project, context) => {
  const expectedDurationMs = project.segments.reduce(
    (total, segment) => total + editedDurationMs(segment.trimStartMs, segment.trimEndMs, segment.videoEdits),
    0,
  );
  if (project.durationMs !== expectedDurationMs) {
    context.addIssue({ code: 'custom', message: 'The montage duration does not match its segments.', path: ['durationMs'] });
  }
  if (project.music && project.music.timelineStartMs >= project.durationMs) {
    context.addIssue({ code: 'custom', message: 'The music track must begin before the montage ends.', path: ['music', 'timelineStartMs'] });
  }
});
export type MontageProjectV2 = z.infer<typeof montageProjectV2Schema>;

export const exportMontageV2InputSchema = z.object({
  exportId: z.string().uuid(),
  project: montageProjectV2Schema,
  preset: clipExportPresetSchema,
  targetSizeMb: z.number().int().min(5).max(100_000).optional(),
});
export type ExportMontageV2Input = z.infer<typeof exportMontageV2InputSchema>;

export const montageDraftIdSchema = z.string().uuid();
export const montageAudioAssetIdSchema = z.string().uuid();

export const montageV2IpcChannels = {
  importAudio: 'montage-v2:import-audio',
  loadAudioWaveform: 'montage-v2:load-audio-waveform',
  listDrafts: 'montage-v2:list-drafts',
  saveDraft: 'montage-v2:save-draft',
  deleteDraft: 'montage-v2:delete-draft',
  export: 'montage-v2:export',
  cancelExport: 'montage-v2:cancel-export',
} as const;

export interface MontageV2Api {
  importMontageAudio(): Promise<MontageAudioAsset | null>;
  loadMontageAudioWaveform(assetId: string): Promise<MontageAudioWaveform>;
  listMontageDrafts(): Promise<MontageProjectV2[]>;
  saveMontageDraft(project: MontageProjectV2): Promise<MontageProjectV2>;
  deleteMontageDraft(projectId: string): Promise<void>;
  exportMontageV2(input: ExportMontageV2Input): Promise<PreparedShareFile | null>;
  cancelMontageV2Export(exportId: string): Promise<void>;
}

export type MontageV2ProjectInput = {
  schemaVersion: typeof montageV2SchemaVersion;
  type: 'montage';
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  canvasSize: ClipCanvasSize;
  segments: Array<{
    id: string;
    clipId: string;
    sourceDurationMs: number;
    trimStartMs: number;
    trimEndMs: number;
    volume: number;
    muted: boolean;
    audioTrackLevels?: number[];
    audioTrackTrims?: Array<ClipAudioTrackTrim | null>;
  }>;
  music?: MontageMusicTrack;
};

export type MontageV2ExportPreset = ClipExportPreset;
