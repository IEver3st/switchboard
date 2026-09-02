import { readFileSync } from 'node:fs';
import { z } from 'zod';

const startupSettingsSchema = z.object({
  settings: z.object({
    softwareRendering: z.boolean().optional(),
  }).passthrough(),
}).passthrough();

export function readSoftwareRenderingPreference(filePath: string): boolean {
  try {
    const parsed = startupSettingsSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
    return parsed.success && parsed.data.settings.softwareRendering === true;
  } catch {
    return false;
  }
}
