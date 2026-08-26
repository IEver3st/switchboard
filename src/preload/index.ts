import { contextBridge, ipcRenderer } from 'electron';
import {
  audioMeterFrameSchema,
  ipcChannels,
  type SwitchboardApi,
  type SystemSnapshot,
} from '../shared/contracts';

const api: SwitchboardApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  setModuleState: (input) => ipcRenderer.invoke(ipcChannels.setModuleState, input),
  setDeviceSetting: (input) => ipcRenderer.invoke(ipcChannels.setDeviceSetting, input),
  setDeviceAppearanceOverride: (input) => ipcRenderer.invoke(ipcChannels.setDeviceAppearanceOverride, input),
  setAudioEnabled: (enabled) => ipcRenderer.invoke(ipcChannels.setAudioEnabled, enabled),
  setAudioBusGain: (input) => ipcRenderer.invoke(ipcChannels.setAudioBusGain, input),
  setAudioBusEnabled: (input) => ipcRenderer.invoke(ipcChannels.setAudioBusEnabled, input),
  setAudioBusDevice: (input) => ipcRenderer.invoke(ipcChannels.setAudioBusDevice, input),
  applyAudioPreset: (input) => ipcRenderer.invoke(ipcChannels.applyAudioPreset, input),
  setChatMix: (value) => ipcRenderer.invoke(ipcChannels.setChatMix, value),
  setMicProcessor: (input) => ipcRenderer.invoke(ipcChannels.setMicProcessor, input),
  subscribeAudioMeters: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      const parsed = audioMeterFrameSchema.safeParse(raw);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(ipcChannels.audioMeterUpdated, handler);
    return () => ipcRenderer.removeListener(ipcChannels.audioMeterUpdated, handler);
  },
  setCaptureConfig: (input) => ipcRenderer.invoke(ipcChannels.setCaptureConfig, input),
  saveReplay: () => ipcRenderer.invoke(ipcChannels.saveReplay),
  chooseClipDirectory: () => ipcRenderer.invoke(ipcChannels.chooseClipDirectory),
  openClipsDirectory: () => ipcRenderer.invoke(ipcChannels.openClipsDirectory),
  refreshCaptureSources: () => ipcRenderer.invoke(ipcChannels.refreshCaptureSources),
  updateSettings: (input) => ipcRenderer.invoke(ipcChannels.updateSettings, input),
  resetSettings: (scope) => ipcRenderer.invoke(ipcChannels.resetSettings, scope),
  revealClip: (id) => ipcRenderer.invoke(ipcChannels.revealClip, id),
  deleteClip: (id) => ipcRenderer.invoke(ipcChannels.deleteClip, id),
  renameClip: (input) => ipcRenderer.invoke(ipcChannels.renameClip, input),
  subscribe: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: SystemSnapshot) => listener(snapshot);
    ipcRenderer.on(ipcChannels.snapshotUpdated, handler);
    return () => ipcRenderer.removeListener(ipcChannels.snapshotUpdated, handler);
  },
};

contextBridge.exposeInMainWorld('switchboard', api);
