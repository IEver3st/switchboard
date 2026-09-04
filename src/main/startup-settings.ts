import { readFileSync } from 'node:fs';
import { z } from 'zod';

const startupSettingsSchema = z.object({
  settings: z.object({
    softwareRendering: z.boolean().optional(),
  }).passthrough(),
}).passthrough();

export function readSoftwareRenderingPreference(filePath: string): boolean {
  for (const candidate of [filePath, `${filePath}.bak`]) {
    try {
      const raw = readFileSync(candidate, 'utf8').replace(/^\uFEFF/, '');
      const parsed = startupSettingsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data.settings.softwareRendering === true;
    } catch {
      // The full StateStore owns validation, preservation, and recovery after startup.
    }
  }
  return false;
}
