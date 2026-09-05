import { z } from 'zod';

// Times stay in source coordinates so trims, splits and speed edits preserve titles.
export const videoTextSchema = z.object({
  content: z.string().max(160).refine((text) => !/[\x00-\x08\x0b-\x1f]/.test(text), 'Use printable text.'),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  position: z.enum(['top', 'center', 'bottom']),
  size: z.enum(['small', 'medium', 'large']),
}).refine((text) => text.endMs > text.startMs, 'Text must end after it starts.');

export const videoEditsSchema = z.object({
  speed: z.number().min(0.25).max(4).optional(),
  brightness: z.number().min(-0.3).max(0.3).optional(),
  contrast: z.number().min(0.5).max(1.5).optional(),
  saturation: z.number().min(0).max(2).optional(),
  flipHorizontal: z.boolean().optional(),
  text: videoTextSchema.optional(),
});
export type VideoEdits = z.infer<typeof videoEditsSchema>;
export const videoTextSize = { small: 0.035, medium: 0.055, large: 0.08 } as const;
export function editedDurationMs(startMs: number, endMs: number, edits?: VideoEdits): number {
  return Math.round(Math.max(0, endMs - startMs) / (edits?.speed ?? 1));
}

export function montageSizeChoices(durationMs: number): number[] {
  // Approximate 2, 5 and 10 Mbps budgets, with room for AAC and container overhead.
  return [2, 5, 10].map((mbps) => Math.max(10, Math.ceil(durationMs / 1000 * (mbps + 0.192) / 8 * 1_000_000 / 1_048_576 / 5) * 5));
}

export function hasVideoEdits(edits?: VideoEdits): boolean {
  return !!edits && ((edits.speed ?? 1) !== 1 || (edits.brightness ?? 0) !== 0
    || (edits.contrast ?? 1) !== 1 || (edits.saturation ?? 1) !== 1
    || !!edits.flipHorizontal || !!edits.text?.content);
}
