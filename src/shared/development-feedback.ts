import { z } from 'zod';

// Filesystem control is dev-only: fixed operations, no script, path, or IPC input.
export const developmentProfileRequestSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  durationMs: z.number().int().min(1_000).max(10_000),
  target: z.enum(['main', 'renderer', 'both']),
}).strict();
export type DevelopmentProfileRequest = z.infer<typeof developmentProfileRequestSchema>;

export function developmentFeedbackEnabled(packaged: boolean, environment: NodeJS.ProcessEnv): boolean {
  return !packaged && Boolean(environment.ELECTRON_RENDERER_URL)
    && environment.SWITCHBOARD_DEV_FEEDBACK !== '0'
    && (environment.SWITCHBOARD_NATIVE_REVIEW !== '1' || environment.SWITCHBOARD_DEV_FEEDBACK === '1');
}
