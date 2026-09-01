import { z } from 'zod';
import {
  clipAudioTrackTrimsSchema,
  clipCanvasSizeSchema,
  clipExportPresetSchema,
  type ClipAudioTrackTrim,
  type ClipCanvasSize,
  type ClipExportPreset,
} from './contracts';

export const montageV2SchemaVersion = 2 as const;

export const montageAudioAssetSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  originalName: z.string().trim().min(1).max(260),
  durationMs: z.number().int().positive(),
  fileSize: z.number().int().nonnegative(),
  codec: z.string().trim().min(1).max(80).optional(),
  createdAt: z.number().int().nonnegative(),
});
export type MontageAudioAsset = z.infer<typeof montageAudioAssetSchema>;

export const montageAudioWaveformSchema = z.object({
  assetId: z.string().uuid(),
  samples: z.array(z.number().min(0).max(1)).max(512),
});
export type MontageAudioWaveform = z.infer<typeof montageAudioWaveformSchema>;

export const montageV2SegmentSchema = z.object({
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

export const montageMusicTrackSchema = z.object({
  id: z.string().uuid(),
  asset: montageAudioAssetSchema,
  timelineStartMs: z.number().int().nonnegative(),
  sourceStartMs: z.number().int().nonnegative(),
  sourceEndMs: z.number().int().positive(),
  volume: z.number().min(0).max(1).default(0.18),
  muted: z.boolean().default(false),
  fadeInMs: z.number().int().min(0).max(30_000).default(1_000),
  fadeOutMs: z.number().int().min(0).max(30_000).default(1_500),
  loop: z.boolean().default(true),
}).superRefine((track, context) => {
  if (track.sourceEndMs <= track.sourceStartMs) {
    context.addIssue({ code: 'custom', message: 'The music trim end must be after its start.', path: ['sourceEndMs'] });
  }
  if (track.sourceEndMs > track.asset.durationMs) {
    context.addIssue({ code: 'custom', message: 'The music trim exceeds the imported file duration.', path: ['sourceEndMs'] });
  }
  if (track.sourceEndMs - track.sourceStartMs < 100) {
    context.addIssue({ code: 'custom', message: 'Keep at least 0.1 seconds of the music track.', path: ['sourceEndMs'] });
  }
});
export type MontageMusicTrack = z.infer<typeof montageMusicTrackSchema>;

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
    (total, segment) => total + segment.trimEndMs - segment.trimStartMs,
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
  exportMontageV2(input: ExportMontageV2Input): Promise<boolean>;
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
