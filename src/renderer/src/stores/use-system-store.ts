import { create } from 'zustand';
import type {
  CaptureConfig,
  PageId,
  SetAudioBusGainInput,
  SetDeviceSettingInput,
  SetMicProcessorInput,
  SetModuleStateInput,
  SystemSnapshot,
  UpdateSettingsInput,
} from '../../../shared/contracts';
import { switchboardApi } from '../lib/demo-api';

type AsyncAction = () => Promise<SystemSnapshot>;

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
  clearError(): void;
  setModuleState(input: SetModuleStateInput): Promise<void>;
  setDeviceSetting(input: SetDeviceSettingInput): Promise<void>;
  setAudioEnabled(enabled: boolean): Promise<void>;
  setAudioBusGain(input: SetAudioBusGainInput): Promise<void>;
  setChatMix(value: number): Promise<void>;
  setMicProcessor(input: SetMicProcessorInput): Promise<void>;
  setCaptureConfig(input: Partial<CaptureConfig>): Promise<void>;
  saveReplay(): Promise<void>;
  updateSettings(input: UpdateSettingsInput): Promise<void>;
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
    page: 'overview',
    selectedDeviceId: null,
    loading: true,
    actionPending: null,
    error: null,
    async initialize() {
      try {
        const snapshot = await switchboardApi.getSnapshot();
        set({
          snapshot,
          selectedDeviceId: get().selectedDeviceId ?? snapshot.devices[0]?.id ?? null,
          loading: false,
        });
      } catch (error) {
        set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      }
      return switchboardApi.subscribe((snapshot) => set({ snapshot }));
    },
    setPage: (page) => set({ page }),
    selectDevice: (selectedDeviceId) => set({ selectedDeviceId, page: 'devices' }),
    clearError: () => set({ error: null }),
    setModuleState: (input) => run(`module:${input.moduleId}`, () => switchboardApi.setModuleState(input)),
    setDeviceSetting: (input) => run(`device:${input.deviceId}:${input.key}`, () => switchboardApi.setDeviceSetting(input)),
    setAudioEnabled: (enabled) => run('audio:enabled', () => switchboardApi.setAudioEnabled(enabled)),
    setAudioBusGain: (input) => run(`audio:${input.busId}`, () => switchboardApi.setAudioBusGain(input)),
    setChatMix: (value) => run('audio:chatmix', () => switchboardApi.setChatMix(value)),
    setMicProcessor: (input) => run(`audio:processor:${input.processorId}`, () => switchboardApi.setMicProcessor(input)),
    setCaptureConfig: (input) => run('capture:config', () => switchboardApi.setCaptureConfig(input)),
    saveReplay: () => run('capture:save', () => switchboardApi.saveReplay()),
    updateSettings: (input) => run('settings:update', () => switchboardApi.updateSettings(input)),
    revealClip: (path) => switchboardApi.revealClip(path),
  };
});
