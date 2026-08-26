import { create } from 'zustand';
import {
  pageIdSchema,
  type ApplyAudioPresetInput,
  type AudioPresetIdInput,
  type CaptureConfig,
  type CreateAudioPresetInput,
  type PageId,
  type RenameClipInput,
  type RenameAudioPresetInput,
  type SetAudioChannelProcessorInput,
  type SetAudioBusDeviceInput,
  type SetAudioBusEnabledInput,
  type SetAudioBusGainInput,
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

function pageFromHash(): PageId {
  const hash = window.location.hash.replace('#', '').split('/')[0];
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
  actionPending: string | null;
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
  setAudioBusGain(input: SetAudioBusGainInput): Promise<void>;
  setAudioBusEnabled(input: SetAudioBusEnabledInput): Promise<void>;
  setAudioBusDevice(input: SetAudioBusDeviceInput): Promise<void>;
  applyAudioPreset(input: ApplyAudioPresetInput): Promise<void>;
  createAudioPreset(input: CreateAudioPresetInput): Promise<void>;
  renameAudioPreset(input: RenameAudioPresetInput): Promise<void>;
  duplicateAudioPreset(input: AudioPresetIdInput): Promise<void>;
  deleteAudioPreset(input: AudioPresetIdInput): Promise<void>;
  importAudioPreset(): Promise<void>;
  exportAudioPreset(input: AudioPresetIdInput): Promise<void>;
  setAudioChannelProcessor(input: SetAudioChannelProcessorInput): Promise<void>;
  setAudioMonitoring(input: SetAudioMonitoringInput): Promise<void>;
  setChatMix(value: number): Promise<void>;
  setMicProcessor(input: SetMicProcessorInput): Promise<void>;
  setCaptureConfig(input: Partial<CaptureConfig>): Promise<void>;
  saveReplay(): Promise<void>;
  chooseClipDirectory(): Promise<void>;
  openClipsDirectory(): Promise<void>;
  refreshCaptureSources(): Promise<void>;
  deleteClip(id: string): Promise<void>;
  renameClip(input: RenameClipInput): Promise<void>;
  updateSettings(input: UpdateSettingsInput): Promise<void>;
  resetSettings(scope: SettingsResetScope): Promise<void>;
  revealClip(path: string): Promise<void>;
}

export const useSystemStore = create<SystemStore>((set, get) => {
  const run = async (label: string, action: AsyncAction): Promise<void> => {
    set({ actionPending: label, error: null });
    try {
      const snapshot = await action();
      set({ snapshot });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ actionPending: null });
    }
  };

  return {
    snapshot: null,
    page: pageFromHash(),
    selectedDeviceId: null,
    loading: true,
    actionPending: null,
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
      if (window.location.hash !== `#${page}`) window.location.hash = page;
      set({ page });
    },
    selectDevice: (selectedDeviceId) => set({ selectedDeviceId, page: 'devices' }),
    clearDeviceSelection: () => set({ selectedDeviceId: null }),
    clearError: () => set({ error: null }),
    setModuleState: (input) => run(`module:${input.moduleId}`, () => switchboardApi.setModuleState(input)),
    setDeviceControl: (input) => run(`device:${input.deviceId}:${input.change.type}`, () => switchboardApi.setDeviceControl(input)),
    setDeviceSetting: (input) => run(`device:${input.deviceId}:${input.key}`, () => switchboardApi.setDeviceSetting(input)),
    setDeviceAppearanceOverride: (input) => run(`device:${input.deviceId}:appearance`, () => switchboardApi.setDeviceAppearanceOverride(input)),
    setAudioEnabled: (enabled) => run('audio:enabled', () => switchboardApi.setAudioEnabled(enabled)),
    setAudioBusGain: (input) => run(`audio:${input.busId}`, () => switchboardApi.setAudioBusGain(input)),
    setAudioBusEnabled: (input) => run(`audio:${input.busId}:enabled`, () => switchboardApi.setAudioBusEnabled(input)),
    setAudioBusDevice: (input) => run(`audio:${input.busId}:device`, () => switchboardApi.setAudioBusDevice(input)),
    applyAudioPreset: (input) => run('audio:preset', () => switchboardApi.applyAudioPreset(input)),
    createAudioPreset: (input) => run('audio:preset:create', () => switchboardApi.createAudioPreset(input)),
    renameAudioPreset: (input) => run('audio:preset:rename', () => switchboardApi.renameAudioPreset(input)),
    duplicateAudioPreset: (input) => run('audio:preset:duplicate', () => switchboardApi.duplicateAudioPreset(input)),
    deleteAudioPreset: (input) => run('audio:preset:delete', () => switchboardApi.deleteAudioPreset(input)),
    importAudioPreset: () => run('audio:preset:import', () => switchboardApi.importAudioPreset()),
    exportAudioPreset: async (input) => {
      set({ actionPending: 'audio:preset:export', error: null });
      try { await switchboardApi.exportAudioPreset(input); }
      catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
      finally { set({ actionPending: null }); }
    },
    setAudioChannelProcessor: (input) => run(
      `audio:${input.busId}:processor:${input.processorId}`,
      () => switchboardApi.setAudioChannelProcessor(input),
    ),
    setAudioMonitoring: (input) => run('audio:monitoring', () => switchboardApi.setAudioMonitoring(input)),
    setChatMix: (value) => run('audio:chatmix', () => switchboardApi.setChatMix(value)),
    setMicProcessor: (input) => run(`audio:processor:${input.processorId}`, () => switchboardApi.setMicProcessor(input)),
    setCaptureConfig: (input) => run('capture:config', () => switchboardApi.setCaptureConfig(input)),
    saveReplay: () => run('capture:save', () => switchboardApi.saveReplay()),
    chooseClipDirectory: () => run('capture:directory', () => switchboardApi.chooseClipDirectory()),
    openClipsDirectory: async () => {
      set({ actionPending: 'capture:open-directory', error: null });
      try { await switchboardApi.openClipsDirectory(); }
      catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
      finally { set({ actionPending: null }); }
    },
    refreshCaptureSources: () => run('capture:sources', () => switchboardApi.refreshCaptureSources()),
    deleteClip: async (id) => {
      set({ actionPending: `clip:${id}:delete`, error: null });
      try { set({ snapshot: await switchboardApi.deleteClip(id) }); }
      catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      } finally { set({ actionPending: null }); }
    },
    renameClip: async (input) => {
      set({ actionPending: `clip:${input.id}:rename`, error: null });
      try { set({ snapshot: await switchboardApi.renameClip(input) }); }
      catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
        throw error;
      } finally { set({ actionPending: null }); }
    },
    updateSettings: (input) => run('settings:update', () => switchboardApi.updateSettings(input)),
    resetSettings: (scope) => run('settings:reset', () => switchboardApi.resetSettings(scope)),
    revealClip: (id) => switchboardApi.revealClip(id),
  };
});
