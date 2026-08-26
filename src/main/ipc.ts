import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import {
  applyAudioPresetInputSchema,
  audioPresetIdInputSchema,
  appSettingsSchema,
  captureConfigSchema,
  clipTrimInputSchema,
  createAudioPresetInputSchema,
  exportClipInputSchema,
  ipcChannels,
  renameClipInputSchema,
  renameAudioPresetInputSchema,
  setAudioChannelProcessorInputSchema,
  setAudioMonitoringInputSchema,
  setAudioBusDeviceInputSchema,
  setAudioBusEnabledInputSchema,
  setAudioBusGainInputSchema,
  setDeviceAppearanceOverrideInputSchema,
  setDeviceControlInputSchema,
  setDeviceSettingInputSchema,
  setMicProcessorInputSchema,
  setClipFavoriteInputSchema,
  setModuleStateInputSchema,
  settingsResetScopeSchema,
} from '../shared/contracts';
import type { AppController } from './controller';

function assertTrustedSender(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
    throw new Error('Rejected IPC from an untrusted webContents instance.');
  }

  const sourceUrl = event.senderFrame?.url;
  if (!sourceUrl) throw new Error('IPC request has no sender URL.');

  const parsed = new URL(sourceUrl);
  const trustedProtocol = parsed.protocol === 'file:';
  const trustedDevHost =
    ['http:', 'https:'].includes(parsed.protocol) && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (!trustedProtocol && !trustedDevHost) {
    throw new Error(`Rejected IPC sender: ${parsed.origin}`);
  }
}

function handle<TInput, TResult>(
  channel: string,
  getMainWindow: () => BrowserWindow | null,
  parse: (input: unknown) => TInput,
  action: (input: TInput) => TResult | Promise<TResult>,
): void {
  ipcMain.handle(channel, async (event, input) => {
    assertTrustedSender(event, getMainWindow);
    return action(parse(input));
  });
}

export function registerIpc(controller: AppController, getMainWindow: () => BrowserWindow | null): () => void {
  ipcMain.handle(ipcChannels.getSnapshot, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.getSnapshot();
  });

  handle(
    ipcChannels.setModuleState,
    getMainWindow,
    (input) => setModuleStateInputSchema.parse(input),
    (input) => controller.setModuleState(input),
  );
  handle(
    ipcChannels.setDeviceControl,
    getMainWindow,
    (input) => setDeviceControlInputSchema.parse(input),
    (input) => controller.setDeviceControl(input),
  );
  handle(
    ipcChannels.setDeviceSetting,
    getMainWindow,
    (input) => setDeviceSettingInputSchema.parse(input),
    (input) => controller.setDeviceSetting(input),
  );
  handle(
    ipcChannels.setDeviceAppearanceOverride,
    getMainWindow,
    (input) => setDeviceAppearanceOverrideInputSchema.parse(input),
    (input) => controller.setDeviceAppearanceOverride(input),
  );
  handle(
    ipcChannels.setAudioEnabled,
    getMainWindow,
    (input) => z.boolean().parse(input),
    (enabled) => controller.setAudioEnabled(enabled),
  );
  handle(
    ipcChannels.setAudioBusGain,
    getMainWindow,
    (input) => setAudioBusGainInputSchema.parse(input),
    (input) => controller.setAudioBusGain(input),
  );
  handle(
    ipcChannels.setAudioBusEnabled,
    getMainWindow,
    (input) => setAudioBusEnabledInputSchema.parse(input),
    (input) => controller.setAudioBusEnabled(input),
  );
  handle(
    ipcChannels.setAudioBusDevice,
    getMainWindow,
    (input) => setAudioBusDeviceInputSchema.parse(input),
    (input) => controller.setAudioBusDevice(input),
  );
  handle(
    ipcChannels.applyAudioPreset,
    getMainWindow,
    (input) => applyAudioPresetInputSchema.parse(input),
    (input) => controller.applyAudioPreset(input),
  );
  handle(
    ipcChannels.createAudioPreset,
    getMainWindow,
    (input) => createAudioPresetInputSchema.parse(input),
    (input) => controller.createAudioPreset(input),
  );
  handle(
    ipcChannels.renameAudioPreset,
    getMainWindow,
    (input) => renameAudioPresetInputSchema.parse(input),
    (input) => controller.renameAudioPreset(input),
  );
  handle(
    ipcChannels.duplicateAudioPreset,
    getMainWindow,
    (input) => audioPresetIdInputSchema.parse(input),
    (input) => controller.duplicateAudioPreset(input),
  );
  handle(
    ipcChannels.deleteAudioPreset,
    getMainWindow,
    (input) => audioPresetIdInputSchema.parse(input),
    (input) => controller.deleteAudioPreset(input),
  );
  ipcMain.handle(ipcChannels.importAudioPreset, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.importAudioPreset();
  });
  handle(
    ipcChannels.exportAudioPreset,
    getMainWindow,
    (input) => audioPresetIdInputSchema.parse(input),
    (input) => controller.exportAudioPreset(input),
  );
  handle(
    ipcChannels.setAudioChannelProcessor,
    getMainWindow,
    (input) => setAudioChannelProcessorInputSchema.parse(input),
    (input) => controller.setAudioChannelProcessor(input),
  );
  handle(
    ipcChannels.setAudioMonitoring,
    getMainWindow,
    (input) => setAudioMonitoringInputSchema.parse(input),
    (input) => controller.setAudioMonitoring(input),
  );
  handle(
    ipcChannels.setChatMix,
    getMainWindow,
    (input) => z.number().min(-1).max(1).parse(input),
    (value) => controller.setChatMix(value),
  );
  handle(
    ipcChannels.setMicProcessor,
    getMainWindow,
    (input) => setMicProcessorInputSchema.parse(input),
    (input) => controller.setMicProcessor(input),
  );
  handle(
    ipcChannels.setCaptureConfig,
    getMainWindow,
    (input) => captureConfigSchema.omit({ clipsDirectory: true }).partial().parse(input),
    (input) => controller.setCaptureConfig(input),
  );
  ipcMain.handle(ipcChannels.saveReplay, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.saveReplay();
  });
  ipcMain.handle(ipcChannels.chooseClipDirectory, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.chooseClipDirectory();
  });
  ipcMain.handle(ipcChannels.openClipsDirectory, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.openClipsDirectory();
  });
  ipcMain.handle(ipcChannels.refreshCaptureSources, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.refreshCaptureSources();
  });
  handle(
    ipcChannels.updateSettings,
    getMainWindow,
    (input) => appSettingsSchema.partial().parse(input),
    (input) => controller.updateSettings(input),
  );
  handle(
    ipcChannels.resetSettings,
    getMainWindow,
    (input) => settingsResetScopeSchema.parse(input),
    (scope) => controller.resetSettings(scope),
  );
  handle(
    ipcChannels.revealClip,
    getMainWindow,
    (input) => z.string().min(1).max(4_096).parse(input),
    (id) => controller.revealClip(id),
  );
  handle(
    ipcChannels.deleteClip,
    getMainWindow,
    (input) => z.string().min(1).max(256).parse(input),
    (id) => controller.deleteClip(id),
  );
  handle(
    ipcChannels.renameClip,
    getMainWindow,
    (input) => renameClipInputSchema.parse(input),
    (input) => controller.renameClip(input),
  );
  handle(
    ipcChannels.setClipFavorite,
    getMainWindow,
    (input) => setClipFavoriteInputSchema.parse(input),
    (input) => controller.setClipFavorite(input),
  );
  handle(
    ipcChannels.setClipTrim,
    getMainWindow,
    (input) => clipTrimInputSchema.parse(input),
    (input) => controller.setClipTrim(input),
  );
  handle(
    ipcChannels.exportClip,
    getMainWindow,
    (input) => exportClipInputSchema.parse(input),
    (input) => controller.exportClip(input),
  );

  const unsubscribe = controller.subscribe((snapshot) => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(ipcChannels.snapshotUpdated, snapshot);
  });
  const unsubscribeAudioMeters = controller.subscribeAudioMeters((frame) => {
    const window = getMainWindow();
    if (!window || window.isDestroyed() || !window.isVisible()) return;
    window.webContents.send(ipcChannels.audioMeterUpdated, frame);
  });

  return () => {
    unsubscribe();
    unsubscribeAudioMeters();
    for (const channel of Object.values(ipcChannels)) {
      if (channel !== ipcChannels.snapshotUpdated) ipcMain.removeHandler(channel);
    }
  };
}
