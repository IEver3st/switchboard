import { create } from 'zustand';
import {
  pageIdSchema,
  type ApplyAudioPresetInput,
  type AudioPresetIdInput,
  type CaptureConfig,
  type CreateAudioPresetInput,
  type ExportClipInput,
  type PageId,
  type RenameClipInput,
  type SetClipFavoriteInput,
  type SetClipTrimInput,
  type RenameAudioPresetInput,
  type SetAudioChannelProcessorInput,
  type SetAudioBusDeviceInput,
  type SetAudioApplicationRouteInput,
  type SetAudioBusEnabledInput,
  type SetAudioBusGainInput,
  type SetAudioMasterEnabledInput,
  type SetAudioMasterGainInput,
  type SetDeviceAppearanceOverrideInput,
  type SetDeviceControlInput,
  type SetDeviceSettingInput,
  type SetMicProcessorInput,
  type SetAudioMonitoringInput,
  type SetModuleStateInput,
  type SettingsResetScope,
  type SystemSnapshot,
  type UpdateSettingsInput,
} from '../../../shared/contracts';
import { switchboardApi } from '../lib/demo-api';

type AsyncAction = () => Promise<SystemSnapshot>;

const settingsCategoryStorageKey = 'switchboard.settings.category';

function pageFromHash(): PageId {
  const hash = window.location.hash.replace('#', '').split('/')[0];
  if (hash === 'modules') {
    window.sessionStorage.setItem(settingsCategoryStorageKey, 'modules');
    return 'settings';
  }
  const parsed = pageIdSchema.safeParse(hash);
  return parsed.success ? parsed.data : 'devices';
}

function canonicalPageHash(page: PageId): string {
  if (page === 'audio' && /^#audio\/(mixer|game|chat|media|microphone)$/.test(window.location.hash)) {
    return window.location.hash;
  }
  return `#${page}`;
}

interface SystemStore {
  snapshot: SystemSnapshot | null;
  page: PageId;
  selectedDeviceId: string | null;
  loading: boolean;
  error: string | null;
  initialize(): Promise<() => void>;
  setPage(page: PageId): void;
  selectDevice(id: string): void;
  clearDeviceSelection(): void;
  clearError(): void;
  setModuleState(input: SetModuleStateInput): Promise<void>;
  setDeviceControl(input: SetDeviceControlInput): Promise<void>;
  setDeviceSetting(input: SetDeviceSettingInput): Promise<void>;
  setDeviceAppearanceOverride(input: SetDeviceAppearanceOverrideInput): Promise<void>;
  setAudioEnabled(enabled: boolean): Promise<void>;
  setAudioMasterGain(input: SetAudioMasterGainInput): Promise<void>;
  setAudioMasterEnabled(input: SetAudioMasterEnabledInput): Promise<void>;
  setAudioBusGain(input: SetAudioBusGainInput): Promise<void>;
  setAudioBusEnabled(input: SetAudioBusEnabledInput): Promise<void>;
  setAudioBusDevice(input: SetAudioBusDeviceInput): Promise<void>;
  setAudioApplicationRoute(input: SetAudioApplicationRouteInput): Promise<void>;
  applyAudioPreset(input: ApplyAudioPresetInput): Promise<void>;
  createAudioPreset(input: CreateAudioPresetInput): Promise<void>;
  renameAudioPreset(input: RenameAudioPresetInput): Promise<void>;
  duplicateAudioPreset(input: AudioPresetIdInput): Promise<void>;
  deleteAudioPreset(input: AudioPresetIdInput): Promise<void>;
  importAudioPreset(): Promise<void>;
  exportAudioPreset(input: AudioPresetIdInput): Promise<void>;
  setAudioChannelProcessor(input: SetAudioChannelProcessorInput): Promise<void>;
  setAudioMonitoring(input: SetAudioMonitoringInput): Promise<void>;
  testMicrophone(): Promise<void>;
  setChatMix(value: number): Promise<void>;
  setMicProcessor(input: SetMicProcessorInput): Promise<void>;
  setCaptureConfig(input: Partial<CaptureConfig>): Promise<void>;
  saveReplay(): Promise<void>;
  chooseClipDirectory(): Promise<void>;
  openClipsDirectory(): Promise<void>;
  refreshCaptureSources(): Promise<void>;
  scanGames(): Promise<void>;
  addGame(): Promise<void>;
  deleteClip(id: string): Promise<void>;
  renameClip(input: RenameClipInput): Promise<void>;
  setClipFavorite(input: SetClipFavoriteInput): Promise<void>;
  setClipTrim(input: SetClipTrimInput): Promise<void>;
  exportClip(input: ExportClipInput): Promise<boolean>;
  updateSettings(input: UpdateSettingsInput): Promise<void>;
  resetSettings(scope: SettingsResetScope): Promise<void>;
  revealClip(path: string): Promise<void>;
}

export const useSystemStore = create<SystemStore>((set, get) => {
  const run = async (action: AsyncAction): Promise<void> => {
    set({ error: null });
    try {
      const snapshot = await action();
      set({ snapshot });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  };

  return {
    snapshot: null,
    page: pageFromHash(),
    selectedDeviceId: null,
    loading: true,
    error: null,
    async initialize() {
      try {
        const snapshot = await switchboardApi.getSnapshot();
        set({
          snapshot,
          selectedDeviceId: get().selectedDeviceId,
          loading: false,
        });
      } catch (error) {
        set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      }
      const initialHash = canonicalPageHash(get().page);
      if (window.location.hash !== initialHash) window.history.replaceState(null, '', initialHash);
      const onHashChange = () => {
        const page = pageFromHash();
        const nextHash = canonicalPageHash(page);
        if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
        set({ page, selectedDeviceId: null });
      };
      window.addEventListener('hashchange', onHashChange);
      const unsubscribe = switchboardApi.subscribe((snapshot) => set({ snapshot }));
      return () => {
        window.removeEventListener('hashchange', onHashChange);
        unsubscribe();
      };
    },
    setPage: (page) => {
      const nextPage = page === 'modules' ? 'settings' : page;
      if (page === 'modules') window.sessionStorage.setItem(settingsCategoryStorageKey, 'modules');
      if (window.location.hash !== `#${nextPage}`) window.location.hash = nextPage;
      set({ page: nextPage });
    },
    selectDevice: (selectedDeviceId) => set({ selectedDeviceId, page: 'devices' }),
    clearDeviceSelection: () => set({ selectedDeviceId: null }),
    clearError: () => set({ error: null }),
    setModuleState: (input) => run(() => switchboardApi.setModuleState(input)),
    setDeviceControl: (input) => run(() => switchboardApi.setDeviceControl(input)),
    setDeviceSetting: (input) => run(() => switchboardApi.setDeviceSetting(input)),
    setDeviceAppearanceOverride: (input) => run(() => switchboardApi.setDeviceAppearanceOverride(input)),
    setAudioEnabled: (enabled) => run(() => switchboardApi.setAudioEnabled(enabled)),
    setAudioMasterGain: (input) => run(() => switchboardApi.setAudioMasterGain(input)),
    setAudioMasterEnabled: (input) => run(() => switchboardApi.setAudioMasterEnabled(input)),
    setAudioBusGain: (input) => run(() => switchboardApi.setAudioBusGain(input)),
    setAudioBusEnabled: (input) => run(() => switchboardApi.setAudioBusEnabled(input)),
    setAudioBusDevice: (input) => run(() => switchboardApi.setAudioBusDevice(input)),
    setAudioApplicationRoute: (input) => run(() => switchboardApi.setAudioApplicationRoute(input)),
    applyAudioPreset: (input) => run(() => switchboardApi.applyAudioPreset(input)),
    createAudioPreset: (input) => run(() => switchboardApi.createAudioPreset(input)),
    renameAudioPreset: (input) => run(() => switchboardApi.renameAudioPreset(input)),
    duplicateAudioPreset: (input) => run(() => switchboardApi.duplicateAudioPreset(input)),
    deleteAudioPreset: (input) => run(() => switchboardApi.deleteAudioPreset(input)),
    importAudioPreset: () => run(() => switchboardApi.importAudioPreset()),
    exportAudioPreset: async (input) => {
      set({ error: null });
      try { await switchboardApi.exportAudioPreset(input); }
      catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
    },
    setAudioChannelProcessor: (input) => run(() => switchboardApi.setAudioChannelProcessor(input)),
    setAudioMonitoring: (input) => run(() => switchboardApi.setAudioMonitoring(input)),
    testMicrophone: async () => {
      set({ error: null });
      try { await switchboardApi.testMicrophone(); }
      catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
    },
    setChatMix: (value) => run(() => switchboardApi.setChatMix(value)),
    setMicProcessor: (input) => run(() => switchboardApi.setMicProcessor(input)),
    setCaptureConfig: (input) => run(() => switchboardApi.setCaptureConfig(input)),
    saveReplay: () => run(() => switchboardApi.saveReplay()),
    chooseClipDirectory: () => run(() => switchboardApi.chooseClipDirectory()),
    openClipsDirectory: async () => {
      set({ error: null });
      try { await switchboardApi.openClipsDirectory(); }
      catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
    },
    refreshCaptureSources: () => run(() => switchboardApi.refreshCaptureSources()),
    scanGames: () => run(() => switchboardApi.scanGames()),
    addGame: () => run(() => switchboardApi.addGame()),
    deleteClip: async (id) => {
      set({ error: null });
      try { set({ snapshot: await switchboardApi.deleteClip(id) }); }
      catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    renameClip: async (input) => {
      set({ error: null });
      try { set({ snapshot: await switchboardApi.renameClip(input) }); }
      catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    setClipFavorite: async (input) => {
      const before = get().snapshot;
      if (!before) return;
      const optimistic = structuredClone(before);
      const clip = optimistic.clips.find((candidate) => candidate.id === input.id);
      if (!clip) return;
      clip.favorite = input.favorite;
      set({ snapshot: optimistic, error: null });
      try { set({ snapshot: await switchboardApi.setClipFavorite(input) }); }
      catch (error) {
        set({ snapshot: before, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    setClipTrim: async (input) => {
      set({ error: null });
      try { set({ snapshot: await switchboardApi.setClipTrim(input) }); }
      catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    exportClip: async (input) => {
      set({ error: null });
      try { return await switchboardApi.exportClip(input); }
      catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
    updateSettings: (input) => run(() => switchboardApi.updateSettings(input)),
    resetSettings: (scope) => run(() => switchboardApi.resetSettings(scope)),
    revealClip: (id) => switchboardApi.revealClip(id),
  };
});
