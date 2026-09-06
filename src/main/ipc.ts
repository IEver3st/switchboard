import { debugDiagnostics } from './services/debug-diagnostics';
import { developerDiagnostics } from './services/developer-diagnostics';
import { app, ipcMain, nativeImage, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import {
  applyAudioPresetInputSchema,
  audioPresetIdInputSchema,
  updateSettingsInputSchema,
  autoCaptureProviderIdSchema,
  autoCaptureSettingsPatchSchema,
  autoCaptureTestEventInputSchema,
  setCaptureConfigInputSchema,
  clipTrimInputSchema,
  createModuleProjectInputSchema,
  createAudioPresetInputSchema,
  exportClipInputSchema,
  exportMontageInputSchema,
  feedbackReportInputSchema,
  ipcChannels,
  markClipsReviewedInputSchema,
  moduleProjectIdInputSchema,
  prepareClipShareInputSchema,
  renameClipInputSchema,
  renameAudioPresetInputSchema,
  setAudioChannelProcessorInputSchema,
  setAudioMonitoringInputSchema,
  setAudioBusDeviceInputSchema,
  setAudioApplicationRouteInputSchema,
  setAudioBusEnabledInputSchema,
  setAudioBusGainInputSchema,
  setAudioChannelEnabledInputSchema,
  setAudioMasterEnabledInputSchema,
  setAudioMasterGainInputSchema,
  setDeviceAppearanceOverrideInputSchema,
  setDeviceControlInputSchema,
  setDeviceSettingInputSchema,
  setMicProcessorInputSchema,
  setClipFavoriteInputSchema,
  setClipCanvasSizeInputSchema,
  setClipAudioTrackLevelInputSchema,
  setModuleStateInputSchema,
  settingsResetScopeSchema,
} from '../shared/contracts';
import type { AppController } from './controller';
import { AudioMeterDeliveryGate } from './services/audio-meter-delivery';
import { getPreparedShareService } from './services/prepared-share';
import { getStartupSnapshot } from './startup-readiness';

function assertTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): void {
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
    return developerDiagnostics.trace('main', `ipc:${channel}`, () =>
      debugDiagnostics.measureAsync(`ipc:${channel}`, async () => action(parse(input))));
  });
}

export function registerIpc(controller: AppController, getMainWindow: () => BrowserWindow | null): () => void {
  handle(ipcChannels.exportResourceDiagnostics, getMainWindow, input => z.undefined().parse(input), () => controller.exportResourceDiagnostics());
  const audioMeterDelivery = new AudioMeterDeliveryGate();
  ipcMain.handle(ipcChannels.getSnapshot, async (event) => {
    assertTrustedSender(event, getMainWindow);
    return debugDiagnostics.measureAsync('ipc:snapshot:get', async () => { return getStartupSnapshot(controller); });
  });
  ipcMain.handle(ipcChannels.refreshDevices, async (event) => {
    assertTrustedSender(event, getMainWindow);
    return debugDiagnostics.measureAsync('ipc:devices:refresh', () => controller.refreshDevices());
  });

  handle(
    ipcChannels.setModuleState,
    getMainWindow,
    (input) => setModuleStateInputSchema.parse(input),
    (input) => controller.setModuleState(input),
  );
  handle(
    ipcChannels.createModuleProject,
    getMainWindow,
    (input) => createModuleProjectInputSchema.parse(input),
    (input) => controller.createModuleProject(input),
  );
  handle(
    ipcChannels.linkModuleProject,
    getMainWindow,
    (input) => z.undefined().parse(input),
    () => controller.linkModuleProject(),
  );
  handle(
    ipcChannels.validateModuleProject,
    getMainWindow,
    (input) => moduleProjectIdInputSchema.parse(input),
    (input) => controller.validateModuleProject(input),
  );
  handle(
    ipcChannels.revealModuleProject,
    getMainWindow,
    (input) => moduleProjectIdInputSchema.parse(input),
    (input) => controller.revealModuleProject(input),
  );
  handle(
    ipcChannels.unlinkModuleProject,
    getMainWindow,
    (input) => moduleProjectIdInputSchema.parse(input),
    (input) => controller.unlinkModuleProject(input),
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
    ipcChannels.setAudioMasterGain,
    getMainWindow,
    (input) => setAudioMasterGainInputSchema.parse(input),
    (input) => controller.setAudioMasterGain(input),
  );
  handle(
    ipcChannels.setAudioMasterEnabled,
    getMainWindow,
    (input) => setAudioMasterEnabledInputSchema.parse(input),
    (input) => controller.setAudioMasterEnabled(input),
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
    ipcChannels.setAudioChannelEnabled,
    getMainWindow,
    (input) => setAudioChannelEnabledInputSchema.parse(input),
    (input) => controller.setAudioChannelEnabled(input),
  );
  handle(
    ipcChannels.setAudioBusDevice,
    getMainWindow,
    (input) => setAudioBusDeviceInputSchema.parse(input),
    (input) => controller.setAudioBusDevice(input),
  );
  handle(
    ipcChannels.setAudioApplicationRoute,
    getMainWindow,
    (input) => setAudioApplicationRouteInputSchema.parse(input),
    (input) => controller.setAudioApplicationRoute(input),
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
  ipcMain.handle(ipcChannels.testMicrophone, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.testMicrophone();
  });
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
    (input) => setCaptureConfigInputSchema.parse(input),
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
    ipcChannels.updateAutoCaptureSettings,
    getMainWindow,
    (input) => autoCaptureSettingsPatchSchema.parse(input),
    (input) => controller.updateAutoCaptureSettings(input),
  );
  handle(
    ipcChannels.setupAutoCaptureProvider,
    getMainWindow,
    (input) => autoCaptureProviderIdSchema.parse(input),
    (providerId) => controller.setupAutoCaptureProvider(providerId),
  );
  handle(
    ipcChannels.emitAutoCaptureTestEvent,
    getMainWindow,
    (input) => autoCaptureTestEventInputSchema.parse(input),
    (input) => controller.emitAutoCaptureTestEvent(input),
  );
  ipcMain.handle(ipcChannels.scanGames, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.scanGames();
  });
  ipcMain.handle(ipcChannels.addGame, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.addGame();
  });
  ipcMain.handle(ipcChannels.checkAppUpdates, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.checkAppUpdates();
  });
  ipcMain.handle(ipcChannels.downloadAppUpdate, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.downloadAppUpdate();
  });
  ipcMain.handle(ipcChannels.installAppUpdate, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.installAppUpdate();
  });
  handle(
    ipcChannels.updateSettings,
    getMainWindow,
    (input) => updateSettingsInputSchema.parse(input),
    (input) => controller.updateSettings(input),
  );
  handle(
    ipcChannels.resetSettings,
    getMainWindow,
    (input) => settingsResetScopeSchema.parse(input),
    (scope) => controller.resetSettings(scope),
  );
  handle(
    ipcChannels.handoffFeedbackReport,
    getMainWindow,
    (input) => feedbackReportInputSchema.parse(input),
    (input) => controller.handoffFeedbackReport(input),
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
    ipcChannels.markClipsReviewed,
    getMainWindow,
    (input) => markClipsReviewedInputSchema.parse(input),
    (input) => controller.markClipsReviewed(input),
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
    ipcChannels.setClipCanvasSize,
    getMainWindow,
    (input) => setClipCanvasSizeInputSchema.parse(input),
    (input) => controller.setClipCanvasSize(input),
  );
  handle(
    ipcChannels.setClipAudioTrackLevel,
    getMainWindow,
    (input) => setClipAudioTrackLevelInputSchema.parse(input),
    (input) => controller.setClipAudioTrackLevel(input),
  );
  handle(
    ipcChannels.loadClipAudioWaveform,
    getMainWindow,
    (input) => z.string().min(1).max(256).parse(input),
    (id) => controller.loadClipAudioWaveform(id),
  );
  handle(
    ipcChannels.exportClip,
    getMainWindow,
    (input) => exportClipInputSchema.parse(input),
    (input) => controller.exportClip(input),
  );
  handle(
    ipcChannels.prepareClipShare,
    getMainWindow,
    (input) => prepareClipShareInputSchema.parse(input),
    (input) => controller.prepareClipShare(input),
  );
  ipcMain.on(ipcChannels.startPreparedShareDrag, (event, raw) => {
    try {
      assertTrustedSender(event, getMainWindow);
      const id = z.string().uuid().parse(raw);
      const prepared = getPreparedShareService().resolve(id);
      if (!prepared) throw new Error('The prepared share file is no longer available. Prepare it again.');
      const fallbackIconPath = app.isPackaged
        ? join(process.resourcesPath, 'branding', 'switchboard-icon.png')
        : join(app.getAppPath(), 'resources', 'branding', 'switchboard-icon.png');
      const sourceIcon = nativeImage.createFromPath(prepared.iconPath ?? fallbackIconPath);
      const fallbackIcon = sourceIcon.isEmpty() ? nativeImage.createFromPath(fallbackIconPath) : sourceIcon;
      if (fallbackIcon.isEmpty()) throw new Error('Switchboard could not create the file drag icon.');
      event.sender.startDrag({ file: prepared.path, icon: fallbackIcon.resize({ width: 48, height: 48, quality: 'best' }) });
    } catch (error) {
      console.error('Switchboard could not start the prepared file drag.', error);
    }
  });
  ipcMain.handle(ipcChannels.revealPreparedShareFile, (event, raw) => {
    assertTrustedSender(event, getMainWindow);
    getPreparedShareService().reveal(z.string().uuid().parse(raw));
  });
  ipcMain.on(ipcChannels.setAudioMeterSubscription, (event, raw) => {
    try {
      assertTrustedSender(event, getMainWindow);
      const requested = z.boolean().parse(raw);
      const sender = event.sender;
      const senderId = sender.id;
      const changed = audioMeterDelivery.setRequested(senderId, requested);
      if (changed) controller.setAudioMeteringRequested(requested);
      if (requested && changed) {
        const clearDemand = () => {
          if (audioMeterDelivery.clear(senderId)) controller.setAudioMeteringRequested(false);
        };
        sender.once('did-start-navigation', clearDemand);
        sender.once('destroyed', clearDemand);
      }
    } catch (error) {
      console.error('Switchboard rejected an audio meter subscription request.', error);
    }
  });
  handle(
    ipcChannels.exportMontage,
    getMainWindow,
    (input) => exportMontageInputSchema.parse(input),
    (input) => controller.exportMontage(input),
  );
  handle(
    ipcChannels.cancelClipExport,
    getMainWindow,
    (input) => z.string().uuid().parse(input),
    (exportId) => controller.cancelClipExport(exportId),
  );

  const unsubscribe = controller.subscribe((snapshot) => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return;
    debugDiagnostics.measure('ipc:snapshot:send', () => window.webContents.send(ipcChannels.snapshotUpdated, snapshot));
  });
  const unsubscribeAudioMeters = controller.subscribeAudioMeters((frame) => {
    const window = getMainWindow();
    if (
      !window
      || window.isDestroyed()
      || !audioMeterDelivery.shouldDeliver(window.webContents.id, window.isVisible())
    ) return;
    window.webContents.send(ipcChannels.audioMeterUpdated, frame);
  });
  const unsubscribeClipExportProgress = controller.subscribeClipExportProgress((progress) => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(ipcChannels.clipExportProgress, progress);
  });

  return () => {
    controller.setAudioMeteringRequested(false);
    unsubscribe();
    unsubscribeAudioMeters();
    unsubscribeClipExportProgress();
    ipcMain.removeAllListeners(ipcChannels.startPreparedShareDrag);
    ipcMain.removeAllListeners(ipcChannels.setAudioMeterSubscription);
    for (const channel of Object.values(ipcChannels)) {
      if (channel !== ipcChannels.snapshotUpdated) ipcMain.removeHandler(channel);
    }
  };
}
