import { z } from 'zod';

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


export function normalizeMusicTrack(track: MontageMusicTrack, projectDurationMs: number): MontageMusicTrack {
  const sourceStartMs = Math.max(
    0,
    Math.min(track.asset.durationMs - 100, Math.round(track.sourceStartMs)),
  );
  const sourceEndMs = Math.max(
    sourceStartMs + 100,
    Math.min(track.asset.durationMs, Math.round(track.sourceEndMs)),
  );
  const timelineStartMs = Math.max(0, Math.min(projectDurationMs - 1, Math.round(track.timelineStartMs)));
  const activeDurationMs = track.loop
    ? Math.max(0, projectDurationMs - timelineStartMs)
    : Math.min(sourceEndMs - sourceStartMs, Math.max(0, projectDurationMs - timelineStartMs));
  const maxFadeMs = Math.max(0, Math.floor(activeDurationMs / 2));
  return {
    ...track,
    timelineStartMs,
    sourceStartMs,
    sourceEndMs,
    volume: Math.max(0, Math.min(1, track.volume)),
    fadeInMs: Math.max(0, Math.min(maxFadeMs, Math.round(track.fadeInMs))),
    fadeOutMs: Math.max(0, Math.min(maxFadeMs, Math.round(track.fadeOutMs))),
  };
}
