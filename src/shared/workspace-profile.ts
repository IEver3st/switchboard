import type {
  AppSettings,
  CaptureConfig,
  CaptureResolution,
  CaptureSourceType,
  PageId,
  VisibleWorkspace,
} from './contracts';

export const workspaceOrder: ReadonlyArray<VisibleWorkspace> = ['devices', 'audio', 'capture'];

export const defaultVisibleWorkspaces: ReadonlyArray<VisibleWorkspace> = ['devices', 'audio', 'capture'];

export function normalizeVisibleWorkspaces(value: unknown): VisibleWorkspace[] | null {
  if (!Array.isArray(value)) return null;
  const selected = new Set<VisibleWorkspace>();
  for (const candidate of value) {
    if (candidate === 'devices' || candidate === 'audio' || candidate === 'capture') selected.add(candidate);
  }
  selected.add('capture');
  return workspaceOrder.filter((workspace) => selected.has(workspace));
}

export function migrateVisibleWorkspaces(value: unknown, legacyProfile: unknown): VisibleWorkspace[] {
  if (legacyProfile === 'clipping') return ['capture'];
  return normalizeVisibleWorkspaces(value) ?? [...defaultVisibleWorkspaces];
}

export function isDeveloperModeEnabled(settings: Pick<AppSettings, 'developerMode'>): boolean {
  return settings.developerMode === true;
}

export function isAudioWorkspaceAvailable(settings: Pick<AppSettings, 'developerMode'>): boolean {
  return isDeveloperModeEnabled(settings);
}

export function fullWorkspacesForDeveloperMode(developerMode: boolean): VisibleWorkspace[] {
  return developerMode ? [...defaultVisibleWorkspaces] : ['devices', 'capture'];
}

function filterAudioWhenLocked(workspaces: VisibleWorkspace[], developerMode: boolean): VisibleWorkspace[] {
  if (developerMode) return workspaces;
  const filtered: VisibleWorkspace[] = workspaces.filter((workspace) => workspace !== 'audio');
  if (!filtered.includes('capture')) filtered.push('capture');
  return workspaceOrder.filter((workspace) => filtered.includes(workspace));
}

export function isCaptureOnlyWorkspaces(settings: Pick<AppSettings, 'visibleWorkspaces'>): boolean {
  const workspaces = normalizeVisibleWorkspaces(settings.visibleWorkspaces) ?? [...defaultVisibleWorkspaces];
  return workspaces.length === 1 && workspaces[0] === 'capture';
}

export function needsOnboarding(settings: Pick<AppSettings, 'onboardingCompleted'>): boolean {
  return settings.onboardingCompleted !== true;
}

export function visiblePagesForProfile(
  settings: Pick<AppSettings, 'visibleWorkspaces' | 'developerMode'>,
): Array<Exclude<PageId, 'settings' | 'modules'>> {
  const workspaces = normalizeVisibleWorkspaces(settings.visibleWorkspaces) ?? [...defaultVisibleWorkspaces];
  return filterAudioWhenLocked(workspaces, isDeveloperModeEnabled(settings));
}

export function defaultPageForProfile(
  settings: Pick<AppSettings, 'visibleWorkspaces' | 'developerMode'>,
): Exclude<PageId, 'settings' | 'modules'> {
  const workspaces = visiblePagesForProfile(settings);
  return workspaces[0] ?? 'capture';
}

export function isPageVisibleForProfile(
  page: PageId,
  settings: Pick<AppSettings, 'visibleWorkspaces' | 'developerMode'>,
): boolean {
  if (page === 'settings' || page === 'modules') return true;
  if (page === 'audio' && !isDeveloperModeEnabled(settings)) return false;
  return visiblePagesForProfile(settings).includes(page);
}

export function workspacePreset(
  workspaces: ReadonlyArray<VisibleWorkspace>,
  developerMode = true,
): 'clipping' | 'full' | 'custom' {
  const normalized = normalizeVisibleWorkspaces(workspaces) ?? [...defaultVisibleWorkspaces];
  const visible = filterAudioWhenLocked(normalized, developerMode);
  if (visible.length === 1 && visible[0] === 'capture') return 'clipping';
  if (visible.length === fullWorkspacesForDeveloperMode(developerMode).length
    && fullWorkspacesForDeveloperMode(developerMode).every((entry) => visible.includes(entry))) return 'full';
  return 'custom';
}

export interface OnboardingDraft {
  workspaces: VisibleWorkspace[];
  source: CaptureSourceType;
  resolution: CaptureResolution;
  replaySeconds: number;
  hotkey: string;
  replayEnabled: boolean;
  includeMic: boolean;
  includeSystemAudio: boolean;
  includeChatAudio: boolean;
}

type OnboardingSnapshot = {
  settings: Pick<AppSettings, 'visibleWorkspaces' | 'developerMode'>;
  capture: {
    config: Pick<
      CaptureConfig,
      | 'source'
      | 'resolution'
      | 'replaySeconds'
      | 'hotkey'
      | 'enabled'
      | 'includeMic'
      | 'includeSystemAudio'
      | 'includeChatAudio'
    >;
  };
};

export function createOnboardingDraft(snapshot: OnboardingSnapshot): OnboardingDraft {
  const developerMode = isDeveloperModeEnabled(snapshot.settings);
  const workspaces = filterAudioWhenLocked(
    normalizeVisibleWorkspaces(snapshot.settings.visibleWorkspaces) ?? [...defaultVisibleWorkspaces],
    developerMode,
  );
  return {
    workspaces,
    source: snapshot.capture.config.source,
    resolution: snapshot.capture.config.resolution,
    replaySeconds: snapshot.capture.config.replaySeconds,
    hotkey: snapshot.capture.config.hotkey,
    replayEnabled: snapshot.capture.config.enabled,
    includeMic: snapshot.capture.config.includeMic,
    includeSystemAudio: snapshot.capture.config.includeSystemAudio,
    includeChatAudio: snapshot.capture.config.includeChatAudio,
  };
}

export function applyWorkspacePreset(
  draft: OnboardingDraft,
  preset: 'clipping' | 'full',
  developerMode = true,
): OnboardingDraft {
  if (preset === 'clipping') return { ...draft, workspaces: ['capture'], replayEnabled: true };
  return { ...draft, workspaces: fullWorkspacesForDeveloperMode(developerMode) };
}

export function toggleDraftWorkspace(
  draft: OnboardingDraft,
  workspace: VisibleWorkspace,
  developerMode = true,
): OnboardingDraft {
  if (workspace === 'capture') return draft;
  if (workspace === 'audio' && !developerMode) return draft;
  const selected = new Set(draft.workspaces);
  if (selected.has(workspace)) selected.delete(workspace);
  else selected.add(workspace);
  selected.add('capture');
  const next = workspaceOrder.filter((entry) => selected.has(entry));
  return { ...draft, workspaces: filterAudioWhenLocked(next, developerMode) };
}
