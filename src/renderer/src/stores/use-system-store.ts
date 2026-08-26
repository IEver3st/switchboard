import { create } from 'zustand';
import {
  pageIdSchema,
  type ApplyAudioPresetInput,
  type CaptureConfig,
  type PageId,
  type RenameClipInput,
  type SetAudioBusDeviceInput,
  type SetAudioBusEnabledInput,
  type SetAudioBusGainInput,
  type SetDeviceAppearanceOverrideInput,
  type SetDeviceSettingInput,
  type SetMicProcessorInput,
  type SetModuleStateInput,
  type SettingsResetScope,
  type SystemSnapshot,
  type UpdateSettingsInput,
} from '../../../shared/contracts';
import { switchboardApi } from '../lib/demo-api';

type AsyncAction = () => Promise<SystemSnapshot>;

function pageFromHash(): PageId {
  const hash = window.location.hash.replace('#', '');
  const parsed = pageIdSchema.safeParse(hash);
  return parsed.success ? parsed.data : 'devices';
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
  setDeviceSetting(input: SetDeviceSettingInput): Promise<void>;
  setDeviceAppearanceOverride(input: SetDeviceAppearanceOverrideInput): Promise<void>;
  setAudioEnabled(enabled: boolean): Promise<void>;
  setAudioBusGain(input: SetAudioBusGainInput): Promise<void>;
  setAudioBusEnabled(input: SetAudioBusEnabledInput): Promise<void>;
  setAudioBusDevice(input: SetAudioBusDeviceInput): Promise<void>;
  applyAudioPreset(input: ApplyAudioPresetInput): Promise<void>;
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
      if (window.location.hash !== `#${get().page}`) window.history.replaceState(null, '', `#${get().page}`);
      const onHashChange = () => {
        const page = pageFromHash();
        if (window.location.hash !== `#${page}`) window.history.replaceState(null, '', `#${page}`);
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
    setDeviceSetting: (input) => run(`device:${input.deviceId}:${input.key}`, () => switchboardApi.setDeviceSetting(input)),
    setDeviceAppearanceOverride: (input) => run(`device:${input.deviceId}:appearance`, () => switchboardApi.setDeviceAppearanceOverride(input)),
    setAudioEnabled: (enabled) => run('audio:enabled', () => switchboardApi.setAudioEnabled(enabled)),
    setAudioBusGain: (input) => run(`audio:${input.busId}`, () => switchboardApi.setAudioBusGain(input)),
    setAudioBusEnabled: (input) => run(`audio:${input.busId}:enabled`, () => switchboardApi.setAudioBusEnabled(input)),
    setAudioBusDevice: (input) => run(`audio:${input.busId}:device`, () => switchboardApi.setAudioBusDevice(input)),
    applyAudioPreset: (input) => run('audio:preset', () => switchboardApi.applyAudioPreset(input)),
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
    deleteClip: (id) => run(`clip:${id}:delete`, () => switchboardApi.deleteClip(id)),
    renameClip: (input) => run(`clip:${input.id}:rename`, () => switchboardApi.renameClip(input)),
    updateSettings: (input) => run('settings:update', () => switchboardApi.updateSettings(input)),
    resetSettings: (scope) => run('settings:reset', () => switchboardApi.resetSettings(scope)),
    revealClip: (id) => switchboardApi.revealClip(id),
  };
});
