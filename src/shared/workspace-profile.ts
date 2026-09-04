import type { AppSettings, CaptureConfig, CaptureSourceType, PageId, WorkspaceProfile } from './contracts';

export function isClippingOnlyProfile(settings: Pick<AppSettings, 'workspaceProfile'>): boolean {
  return settings.workspaceProfile === 'clipping';
}

export function needsOnboarding(settings: Pick<AppSettings, 'onboardingCompleted'>): boolean {
  return settings.onboardingCompleted !== true;
}

export function visiblePagesForProfile(
  settings: Pick<AppSettings, 'workspaceProfile'>,
): Array<Exclude<PageId, 'settings' | 'modules'>> {
  if (isClippingOnlyProfile(settings)) return ['capture'];
  return ['devices', 'audio', 'capture'];
}

export function defaultPageForProfile(
  settings: Pick<AppSettings, 'workspaceProfile'>,
): Exclude<PageId, 'settings' | 'modules'> {
  return isClippingOnlyProfile(settings) ? 'capture' : 'devices';
}

export function isPageVisibleForProfile(
  page: PageId,
  settings: Pick<AppSettings, 'workspaceProfile'>,
): boolean {
  if (page === 'settings' || page === 'modules') return true;
  return visiblePagesForProfile(settings).includes(page);
}

export interface OnboardingDraft {
  profile: WorkspaceProfile | null;
  source: CaptureSourceType;
  hotkey: string;
  replayEnabled: boolean;
}

type OnboardingSnapshot = {
  settings: Pick<AppSettings, 'workspaceProfile'>;
  capture: { config: Pick<CaptureConfig, 'source' | 'hotkey' | 'enabled'> };
};

export function createOnboardingDraft(snapshot: OnboardingSnapshot): OnboardingDraft {
  return {
    profile: snapshot.settings.workspaceProfile,
    source: snapshot.capture.config.source,
    hotkey: snapshot.capture.config.hotkey,
    replayEnabled: snapshot.capture.config.enabled,
  };
}

export function applyProfileToDraft(draft: OnboardingDraft, profile: WorkspaceProfile): OnboardingDraft {
  if (profile === 'clipping') return { ...draft, profile, replayEnabled: true };
  return { ...draft, profile };
}
