import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels, type SwitchboardApi, type SystemSnapshot } from '../shared/contracts';

const api: SwitchboardApi = {
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  setModuleState: (input) => ipcRenderer.invoke(ipcChannels.setModuleState, input),
  setDeviceSetting: (input) => ipcRenderer.invoke(ipcChannels.setDeviceSetting, input),
  setAudioEnabled: (enabled) => ipcRenderer.invoke(ipcChannels.setAudioEnabled, enabled),
  setAudioBusGain: (input) => ipcRenderer.invoke(ipcChannels.setAudioBusGain, input),
  setChatMix: (value) => ipcRenderer.invoke(ipcChannels.setChatMix, value),
  setMicProcessor: (input) => ipcRenderer.invoke(ipcChannels.setMicProcessor, input),
  setCaptureConfig: (input) => ipcRenderer.invoke(ipcChannels.setCaptureConfig, input),
  saveReplay: () => ipcRenderer.invoke(ipcChannels.saveReplay),
  updateSettings: (input) => ipcRenderer.invoke(ipcChannels.updateSettings, input),
  revealClip: (path) => ipcRenderer.invoke(ipcChannels.revealClip, path),
  subscribe: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: SystemSnapshot) => listener(snapshot);
    ipcRenderer.on(ipcChannels.snapshotUpdated, handler);
    return () => ipcRenderer.removeListener(ipcChannels.snapshotUpdated, handler);
  },
};

contextBridge.exposeInMainWorld('switchboard', api);
