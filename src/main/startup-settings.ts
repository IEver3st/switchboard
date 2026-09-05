import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

export function markBackgroundUpdate(filePath: string, requested: boolean): void {
  if (requested) writeFileSync(filePath, JSON.stringify({ requestedAt: Date.now() }), 'utf8');
  else rmSync(filePath, { force: true });
}

export function consumeBackgroundUpdate(filePath: string, isUpdateLaunch: boolean, now = Date.now()): boolean {
  try {
    const marker = z.object({ requestedAt: z.number().finite().nonnegative() })
      .parse(JSON.parse(readFileSync(filePath, 'utf8')));
    return isUpdateLaunch && now >= marker.requestedAt && now - marker.requestedAt < 24 * 60 * 60_000;
  } catch {
    return false;
  } finally {
    // Consume even on a manual launch so an abandoned install cannot hide a later launch.
    try { rmSync(filePath, { force: true }); } catch { /* Full startup remains available. */ }
  }
}

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
