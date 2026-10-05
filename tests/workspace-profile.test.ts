import { describe, expect, it } from 'bun:test';
import { createDefaultSnapshot } from '../src/shared/defaults';
import {
  applyWorkspacePreset,
  createOnboardingDraft,
  defaultPageForProfile,
  fullWorkspacesForDeveloperMode,
  isCaptureOnlyWorkspaces,
  isDeveloperModeEnabled,
  isPageVisibleForProfile,
  migrateVisibleWorkspaces,
  needsOnboarding,
  normalizeVisibleWorkspaces,
  toggleDraftWorkspace,
  visiblePagesForProfile,
  workspacePreset,
  usesCaptureOnlyShell,
} from '../src/shared/workspace-profile';

describe('visible workspaces', () => {
  it('defaults fresh installs to developer mode off with onboarding pending', () => {
    const settings = createDefaultSnapshot().settings;

    expect(settings.developerMode).toBeFalse();
    expect(settings.visibleWorkspaces).toEqual(['devices', 'capture']);
    expect(settings.onboardingCompleted).toBeFalse();
    expect(needsOnboarding(settings)).toBeTrue();
    expect(isDeveloperModeEnabled(settings)).toBeFalse();
    expect(isCaptureOnlyWorkspaces(settings)).toBeFalse();
    expect(visiblePagesForProfile(settings)).toEqual(['devices', 'capture']);
    expect(defaultPageForProfile(settings)).toBe('devices');
  });

  it('offers the same workspaces with or without Developer mode', () => {
    expect(fullWorkspacesForDeveloperMode(false)).toEqual(['devices', 'capture']);
    expect(fullWorkspacesForDeveloperMode(true)).toEqual(['devices', 'capture']);
  });

  it('hides exactly the unselected workspaces while keeping settings reachable', () => {
    const settings = { ...createDefaultSnapshot().settings, visibleWorkspaces: ['capture'] as const };

    expect(isCaptureOnlyWorkspaces(settings)).toBeTrue();
    expect(visiblePagesForProfile(settings)).toEqual(['capture']);
    expect(defaultPageForProfile(settings)).toBe('capture');
    expect(isPageVisibleForProfile('capture', settings)).toBeTrue();
    expect(isPageVisibleForProfile('devices', settings)).toBeFalse();
    expect(isPageVisibleForProfile('settings', settings)).toBeTrue();
    expect(isPageVisibleForProfile('modules', settings)).toBeTrue();
  });

  it('always keeps capture visible and restores canonical order', () => {
    expect(normalizeVisibleWorkspaces(['devices'])).toEqual(['devices', 'capture']);
    // The retired Audio page is dropped from older saved settings.
    expect(normalizeVisibleWorkspaces(['audio', 'devices'])).toEqual(['devices', 'capture']);
    expect(normalizeVisibleWorkspaces([])).toEqual(['capture']);
    expect(normalizeVisibleWorkspaces(['capture', 'capture', 'nope'])).toEqual(['capture']);
    expect(normalizeVisibleWorkspaces('devices')).toBeNull();
    expect(normalizeVisibleWorkspaces(undefined)).toBeNull();
  });

  it('detects clipping, full, and custom presets', () => {
    expect(workspacePreset(['capture'])).toBe('clipping');
    expect(workspacePreset(['devices', 'capture'])).toBe('full');
    expect(workspacePreset(['devices', 'capture'], false)).toBe('full');
  });

  it('migrates the legacy clipping profile to capture-only', () => {
    expect(migrateVisibleWorkspaces(undefined, 'clipping')).toEqual(['capture']);
    expect(migrateVisibleWorkspaces(undefined, 'full')).toEqual(['devices', 'capture']);
    expect(migrateVisibleWorkspaces(undefined, null)).toEqual(['devices', 'capture']);
    expect(migrateVisibleWorkspaces(['audio', 'capture'], 'clipping')).toEqual(['capture']);
    expect(migrateVisibleWorkspaces(['devices', 'capture'], null)).toEqual(['devices', 'capture']);
  });
});

describe('onboarding draft', () => {
  it('starts from the current capture and workspace state', () => {
    const snapshot = createDefaultSnapshot();

    expect(createOnboardingDraft(snapshot)).toEqual({
      workspaces: ['devices', 'capture'],
      source: 'automatic-game',
      resolution: '1440p',
      replaySeconds: 60,
      hotkey: 'Ctrl+Shift+F10',
      replayEnabled: false,
      includeMic: true,
      includeSystemAudio: true,
      includeChatAudio: false,
    });
  });

  it('applies clipping and full presets to the draft', () => {
    const snapshot = createDefaultSnapshot();
    const draft = createOnboardingDraft(snapshot);

    expect(applyWorkspacePreset(draft, 'clipping')).toEqual({ ...draft, workspaces: ['capture'], replayEnabled: true });
    expect(applyWorkspacePreset({ ...draft, replayEnabled: true }, 'full')).toEqual({
      ...draft,
      workspaces: ['devices', 'capture'],
      replayEnabled: true,
    });
    expect(applyWorkspacePreset(draft, 'full', false).workspaces).toEqual(['devices', 'capture']);
  });

  it('toggles optional workspaces without ever dropping capture', () => {
    const snapshot = createDefaultSnapshot();
    const draft = createOnboardingDraft(snapshot);

    expect(toggleDraftWorkspace(draft, 'devices').workspaces).toEqual(['capture']);
    expect(toggleDraftWorkspace({ ...draft, workspaces: ['capture'] }, 'devices').workspaces).toEqual([
      'devices',
      'capture',
    ]);
    expect(toggleDraftWorkspace(draft, 'capture').workspaces).toEqual(['devices', 'capture']);
  });
});


describe('capture-only shell', () => {
  it('uses confirmed module configuration, including disabled replay', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.modules.forEach(module => { module.enabled = false; });
    snapshot.capture.config.enabled = false;
    expect(usesCaptureOnlyShell(snapshot)).toBeTrue();
    const device = snapshot.modules.find(module => module.kind === 'device')!;
    device.enabled = true;
    expect(usesCaptureOnlyShell(snapshot)).toBeFalse();
    snapshot.settings.visibleWorkspaces = ['capture'];
    expect(usesCaptureOnlyShell(snapshot)).toBeTrue();
  });
});
