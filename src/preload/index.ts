import { contextBridge, ipcRenderer, webFrame } from 'electron';
import {
  audioMeterFrameSchema,
  clipExportProgressSchema,
  feedbackHandoffResultSchema,
  ipcChannels,
  preparedShareFileSchema,
  type AudioMeterFrame,
  type SwitchboardApi,
  type SystemSnapshot,
} from '../shared/contracts';
import { montageV2IpcChannels, type MontageV2Api } from '../shared/montage-v2';

const audioMeterListeners = new Set<(frame: AudioMeterFrame) => void>();
const handleAudioMeter = (_event: Electron.IpcRendererEvent, raw: unknown): void => {
  const parsed = audioMeterFrameSchema.safeParse(raw);
  if (!parsed.success) return;
  for (const listener of audioMeterListeners) listener(parsed.data);
};

function subscribeAudioMeters(listener: (frame: AudioMeterFrame) => void): () => void {
  if (audioMeterListeners.size === 0) {
    ipcRenderer.on(ipcChannels.audioMeterUpdated, handleAudioMeter);
    ipcRenderer.postMessage(ipcChannels.setAudioMeterSubscription, true);
  }
  audioMeterListeners.add(listener);

  return () => {
    audioMeterListeners.delete(listener);
    if (audioMeterListeners.size !== 0) return;
    ipcRenderer.postMessage(ipcChannels.setAudioMeterSubscription, false);
    ipcRenderer.removeListener(ipcChannels.audioMeterUpdated, handleAudioMeter);
  };
}

const api: SwitchboardApi & MontageV2Api = {
  setUiScale: (percent) => {
    if (![90, 100, 110, 125, 150].includes(percent)) throw new Error('Unsupported UI scale.');
    webFrame.setZoomFactor(percent / 100);
  },
  exportResourceDiagnostics: () => ipcRenderer.invoke(ipcChannels.exportResourceDiagnostics),
  runDiagnostics: () => ipcRenderer.invoke(ipcChannels.runDiagnostics),
  cancelDiagnostics: () => ipcRenderer.invoke(ipcChannels.cancelDiagnostics),
  getSnapshot: () => ipcRenderer.invoke(ipcChannels.getSnapshot),
  refreshDevices: () => ipcRenderer.invoke(ipcChannels.refreshDevices),
  setModuleState: (input) => ipcRenderer.invoke(ipcChannels.setModuleState, input),
  createModuleProject: (input) => ipcRenderer.invoke(ipcChannels.createModuleProject, input),
  linkModuleProject: () => ipcRenderer.invoke(ipcChannels.linkModuleProject),
  validateModuleProject: (input) => ipcRenderer.invoke(ipcChannels.validateModuleProject, input),
  revealModuleProject: (input) => ipcRenderer.invoke(ipcChannels.revealModuleProject, input),
  unlinkModuleProject: (input) => ipcRenderer.invoke(ipcChannels.unlinkModuleProject, input),
  setDeviceControl: (input) => ipcRenderer.invoke(ipcChannels.setDeviceControl, input),
  setDeviceSetting: (input) => ipcRenderer.invoke(ipcChannels.setDeviceSetting, input),
  setDeviceAppearanceOverride: (input) => ipcRenderer.invoke(ipcChannels.setDeviceAppearanceOverride, input),
  setAudioEnabled: (enabled) => ipcRenderer.invoke(ipcChannels.setAudioEnabled, enabled),
  setAudioMasterGain: (input) => ipcRenderer.invoke(ipcChannels.setAudioMasterGain, input),
  setAudioMasterEnabled: (input) => ipcRenderer.invoke(ipcChannels.setAudioMasterEnabled, input),
  setAudioBusGain: (input) => ipcRenderer.invoke(ipcChannels.setAudioBusGain, input),
  setAudioBusEnabled: (input) => ipcRenderer.invoke(ipcChannels.setAudioBusEnabled, input),
  setAudioChannelEnabled: (input) => ipcRenderer.invoke(ipcChannels.setAudioChannelEnabled, input),
  setAudioBusDevice: (input) => ipcRenderer.invoke(ipcChannels.setAudioBusDevice, input),
  setAudioApplicationRoute: (input) => ipcRenderer.invoke(ipcChannels.setAudioApplicationRoute, input),
  applyAudioPreset: (input) => ipcRenderer.invoke(ipcChannels.applyAudioPreset, input),
  createAudioPreset: (input) => ipcRenderer.invoke(ipcChannels.createAudioPreset, input),
  renameAudioPreset: (input) => ipcRenderer.invoke(ipcChannels.renameAudioPreset, input),
  duplicateAudioPreset: (input) => ipcRenderer.invoke(ipcChannels.duplicateAudioPreset, input),
  deleteAudioPreset: (input) => ipcRenderer.invoke(ipcChannels.deleteAudioPreset, input),
  importAudioPreset: () => ipcRenderer.invoke(ipcChannels.importAudioPreset),
  exportAudioPreset: (input) => ipcRenderer.invoke(ipcChannels.exportAudioPreset, input),
  setAudioChannelProcessor: (input) => ipcRenderer.invoke(ipcChannels.setAudioChannelProcessor, input),
  setAudioMonitoring: (input) => ipcRenderer.invoke(ipcChannels.setAudioMonitoring, input),
  testMicrophone: () => ipcRenderer.invoke(ipcChannels.testMicrophone),
  setChatMix: (value) => ipcRenderer.invoke(ipcChannels.setChatMix, value),
  setMicProcessor: (input) => ipcRenderer.invoke(ipcChannels.setMicProcessor, input),
  subscribeAudioMeters,
  setCaptureConfig: (input) => ipcRenderer.invoke(ipcChannels.setCaptureConfig, input),
  saveReplay: () => ipcRenderer.invoke(ipcChannels.saveReplay),
  chooseClipDirectory: () => ipcRenderer.invoke(ipcChannels.chooseClipDirectory),
  openClipsDirectory: () => ipcRenderer.invoke(ipcChannels.openClipsDirectory),
  refreshCaptureSources: () => ipcRenderer.invoke(ipcChannels.refreshCaptureSources),
  updateAutoCaptureSettings: (input) => ipcRenderer.invoke(ipcChannels.updateAutoCaptureSettings, input),
  setupAutoCaptureProvider: (providerId) => ipcRenderer.invoke(ipcChannels.setupAutoCaptureProvider, providerId),
  emitAutoCaptureTestEvent: (input) => ipcRenderer.invoke(ipcChannels.emitAutoCaptureTestEvent, input),
  scanGames: () => ipcRenderer.invoke(ipcChannels.scanGames),
  addGame: () => ipcRenderer.invoke(ipcChannels.addGame),
  checkAppUpdates: () => ipcRenderer.invoke(ipcChannels.checkAppUpdates),
  downloadAppUpdate: () => ipcRenderer.invoke(ipcChannels.downloadAppUpdate),
  installAppUpdate: () => ipcRenderer.invoke(ipcChannels.installAppUpdate),
  updateSettings: (input) => ipcRenderer.invoke(ipcChannels.updateSettings, input),
  resetSettings: (scope) => ipcRenderer.invoke(ipcChannels.resetSettings, scope),
  handoffFeedbackReport: async (input) => feedbackHandoffResultSchema.parse(
    await ipcRenderer.invoke(ipcChannels.handoffFeedbackReport, input),
  ),
  revealClip: (id) => ipcRenderer.invoke(ipcChannels.revealClip, id),
  deleteClip: (id) => ipcRenderer.invoke(ipcChannels.deleteClip, id),
  markClipsReviewed: (input) => ipcRenderer.invoke(ipcChannels.markClipsReviewed, input),
  renameClip: (input) => ipcRenderer.invoke(ipcChannels.renameClip, input),
  setClipFavorite: (input) => ipcRenderer.invoke(ipcChannels.setClipFavorite, input),
  setClipTrim: (input) => ipcRenderer.invoke(ipcChannels.setClipTrim, input),
  setClipCanvasSize: (input) => ipcRenderer.invoke(ipcChannels.setClipCanvasSize, input),
  setClipAudioTrackLevel: (input) => ipcRenderer.invoke(ipcChannels.setClipAudioTrackLevel, input),
  loadClipAudioWaveform: (id) => ipcRenderer.invoke(ipcChannels.loadClipAudioWaveform, id),
  exportClip: (input) => ipcRenderer.invoke(ipcChannels.exportClip, input),
  prepareClipShare: async (input) => {
    const result = await ipcRenderer.invoke(ipcChannels.prepareClipShare, input);
    return result === null ? null : preparedShareFileSchema.parse(result);
  },
  startPreparedShareDrag: (id) => ipcRenderer.postMessage(ipcChannels.startPreparedShareDrag, id),
  revealPreparedShareFile: (id) => ipcRenderer.invoke(ipcChannels.revealPreparedShareFile, id),
  exportMontage: (input) => ipcRenderer.invoke(ipcChannels.exportMontage, input),
  cancelClipExport: (exportId) => ipcRenderer.invoke(ipcChannels.cancelClipExport, exportId),
  subscribeClipExportProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown) => {
      const parsed = clipExportProgressSchema.safeParse(raw);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(ipcChannels.clipExportProgress, handler);
    return () => ipcRenderer.removeListener(ipcChannels.clipExportProgress, handler);
  },
  importMontageAudio: () => ipcRenderer.invoke(montageV2IpcChannels.importAudio),
  loadMontageAudioWaveform: (assetId) => ipcRenderer.invoke(montageV2IpcChannels.loadAudioWaveform, assetId),
  listMontageDrafts: () => ipcRenderer.invoke(montageV2IpcChannels.listDrafts),
  saveMontageDraft: (project) => ipcRenderer.invoke(montageV2IpcChannels.saveDraft, project),
  deleteMontageDraft: (projectId) => ipcRenderer.invoke(montageV2IpcChannels.deleteDraft, projectId),
  exportMontageV2: (input) => ipcRenderer.invoke(montageV2IpcChannels.export, input),
  cancelMontageV2Export: (exportId) => ipcRenderer.invoke(montageV2IpcChannels.cancelExport, exportId),
  subscribe: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: SystemSnapshot) => listener(snapshot);
    ipcRenderer.on(ipcChannels.snapshotUpdated, handler);
    return () => ipcRenderer.removeListener(ipcChannels.snapshotUpdated, handler);
  },
};

contextBridge.exposeInMainWorld('switchboard', api);
