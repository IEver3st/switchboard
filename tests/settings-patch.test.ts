import { expect, test } from 'bun:test';
import { appSettingsSchema, updateSettingsInputSchema } from '../src/shared/contracts';
import { createDefaultSnapshot } from '../src/shared/defaults';

test('game launch tray policy is opt-in and accepts only boolean patches', () => {
  const { trayOnGameLaunch: _, ...legacy } = createDefaultSnapshot().settings;
  expect(appSettingsSchema.parse(legacy).trayOnGameLaunch).toBe(false);
  expect(updateSettingsInputSchema.parse({ trayOnGameLaunch: true })).toEqual({ trayOnGameLaunch: true });
  expect(updateSettingsInputSchema.safeParse({ trayOnGameLaunch: 'yes' }).success).toBe(false);
});

test('legacy settings default to minimized startup while patches preserve an explicit opt-out', () => {
  const { startMinimized: _, ...legacy } = createDefaultSnapshot().settings;
  expect(appSettingsSchema.parse(legacy).startMinimized).toBe(true);
  expect(appSettingsSchema.parse({ ...legacy, startMinimized: false }).startMinimized).toBe(false);
  expect({ ...legacy, startMinimized: false, ...updateSettingsInputSchema.parse({ closeToTray: true }) }.startMinimized).toBe(false);
  expect(updateSettingsInputSchema.safeParse({ startMinimized: 'yes' }).success).toBe(false);
});

test('a one-setting IPC patch never materializes defaults for omitted settings', () => {
  const settings = createDefaultSnapshot().settings;
  for (const key of Object.keys(appSettingsSchema.shape) as Array<keyof typeof settings>) {
    const patch = { [key]: settings[key] };
    expect(updateSettingsInputSchema.parse(patch)).toEqual(patch);
  }
  expect(updateSettingsInputSchema.parse({})).toEqual({});
});

test('guard changes preserve low-resource rendering, onboarding, and workspace policy', () => {
  const settings = { ...createDefaultSnapshot().settings, softwareRendering: true, onboardingCompleted: true, visibleWorkspaces: ['capture'] };
  const updated = { ...settings, ...updateSettingsInputSchema.parse({ performanceGuard: false }) };
  expect(updated).toEqual({ ...settings, performanceGuard: false });
  expect(updateSettingsInputSchema.safeParse({ softwareRendering: 'yes' }).success).toBe(false);
  expect(updateSettingsInputSchema.safeParse({ diagnosticsRetentionDays: 1000 }).success).toBe(false);
});

test('seen "new setting" markers default empty, patch alone, and reject malformed IDs', () => {
  const { seenNewSettings: _, ...legacy } = createDefaultSnapshot().settings;
  expect(appSettingsSchema.parse(legacy).seenNewSettings).toEqual([]);
  expect(updateSettingsInputSchema.parse({ seenNewSettings: ['capture.audioSync'] })).toEqual({ seenNewSettings: ['capture.audioSync'] });
  expect(updateSettingsInputSchema.safeParse({ seenNewSettings: [''] }).success).toBe(false);
  expect(updateSettingsInputSchema.safeParse({ seenNewSettings: 'capture.audioSync' }).success).toBe(false);
});
