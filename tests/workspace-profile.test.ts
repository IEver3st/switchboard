import { describe, expect, it } from 'bun:test';
import { createDefaultSnapshot } from '../src/shared/defaults';
import {
  applyProfileToDraft,
  createOnboardingDraft,
  defaultPageForProfile,
  isClippingOnlyProfile,
  isPageVisibleForProfile,
  needsOnboarding,
  visiblePagesForProfile,
} from '../src/shared/workspace-profile';

describe('workspace profile', () => {
  it('defaults fresh installs to full setup with onboarding pending', () => {
    const settings = createDefaultSnapshot().settings;

    expect(settings.workspaceProfile).toBeNull();
    expect(settings.onboardingCompleted).toBeFalse();
    expect(needsOnboarding(settings)).toBeTrue();
    expect(isClippingOnlyProfile(settings)).toBeFalse();
    expect(visiblePagesForProfile(settings)).toEqual(['devices', 'audio', 'capture']);
    expect(defaultPageForProfile(settings)).toBe('devices');
  });

  it('hides devices and audio for clipping-only', () => {
    const settings = { ...createDefaultSnapshot().settings, workspaceProfile: 'clipping' as const };

    expect(isClippingOnlyProfile(settings)).toBeTrue();
    expect(visiblePagesForProfile(settings)).toEqual(['capture']);
    expect(defaultPageForProfile(settings)).toBe('capture');
    expect(isPageVisibleForProfile('capture', settings)).toBeTrue();
    expect(isPageVisibleForProfile('devices', settings)).toBeFalse();
    expect(isPageVisibleForProfile('audio', settings)).toBeFalse();
    expect(isPageVisibleForProfile('settings', settings)).toBeTrue();
  });

  it('keeps settings reachable and marks onboarding complete after choice', () => {
    const settings = {
      ...createDefaultSnapshot().settings,
      workspaceProfile: 'clipping' as const,
      onboardingCompleted: true,
    };

    expect(needsOnboarding(settings)).toBeFalse();
    expect(isPageVisibleForProfile('settings', settings)).toBeTrue();
    expect(isPageVisibleForProfile('modules', settings)).toBeTrue();
  });
});

describe('onboarding draft', () => {
  it('starts from the current capture and workspace state', () => {
    const snapshot = createDefaultSnapshot();

    expect(createOnboardingDraft(snapshot)).toEqual({
      profile: null,
      source: 'automatic-game',
      hotkey: 'Ctrl+Shift+F10',
      replayEnabled: false,
    });
  });

  it('preselects replay when choosing clipping and leaves it alone for full setup', () => {
    const snapshot = createDefaultSnapshot();
    const draft = createOnboardingDraft(snapshot);

    expect(applyProfileToDraft(draft, 'clipping')).toEqual({ ...draft, profile: 'clipping', replayEnabled: true });
    expect(applyProfileToDraft({ ...draft, replayEnabled: true }, 'full')).toEqual({
      ...draft,
      profile: 'full',
      replayEnabled: true,
    });
  });
});
