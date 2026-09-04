import { expect, test } from 'bun:test';
import { appSettingsSchema, updateSettingsInputSchema } from '../src/shared/contracts';
import { createDefaultSnapshot } from '../src/shared/defaults';

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
