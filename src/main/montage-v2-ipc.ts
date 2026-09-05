import { ipcChannels } from '../shared/contracts';
import { selectShareVideoEncoder } from './services/clip-library';
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {
  exportMontageV2InputSchema,
  montageAudioAssetIdSchema,
  montageDraftIdSchema,
  montageProjectV2Schema,
  montageV2IpcChannels,
} from '../shared/montage-v2';
import type { AppController } from './controller';
import { getMontageV2Service } from './services/montage-v2';

function assertTrustedSender(event: IpcMainInvokeEvent, getMainWindow: () => BrowserWindow | null): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) {
    throw new Error('Rejected montage IPC from an untrusted webContents instance.');
  }
  const sourceUrl = event.senderFrame?.url;
  if (!sourceUrl) throw new Error('Montage IPC request has no sender URL.');
  const parsed = new URL(sourceUrl);
  const trustedProtocol = parsed.protocol === 'file:';
  const trustedDevHost = ['http:', 'https:'].includes(parsed.protocol)
    && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (!trustedProtocol && !trustedDevHost) throw new Error(`Rejected montage IPC sender: ${parsed.origin}`);
}

export function registerMontageV2Ipc(
  controller: AppController,
  getMainWindow: () => BrowserWindow | null,
): () => void {
  const service = getMontageV2Service();

  ipcMain.handle(montageV2IpcChannels.importAudio, (event) => {
    assertTrustedSender(event, getMainWindow);
    return service.importAudio();
  });
  ipcMain.handle(montageV2IpcChannels.loadAudioWaveform, (event, raw) => {
    assertTrustedSender(event, getMainWindow);
    return service.loadAudioWaveform(montageAudioAssetIdSchema.parse(raw));
  });
  ipcMain.handle(montageV2IpcChannels.listDrafts, (event) => {
    assertTrustedSender(event, getMainWindow);
    return service.listDrafts();
  });
  ipcMain.handle(montageV2IpcChannels.saveDraft, (event, raw) => {
    assertTrustedSender(event, getMainWindow);
    return service.saveDraft(montageProjectV2Schema.parse(raw));
  });
  ipcMain.handle(montageV2IpcChannels.deleteDraft, (event, raw) => {
    assertTrustedSender(event, getMainWindow);
    return service.deleteDraft(montageDraftIdSchema.parse(raw));
  });
  ipcMain.handle(montageV2IpcChannels.export, (event, raw) => {
    assertTrustedSender(event, getMainWindow);
    const input = exportMontageV2InputSchema.parse(raw);
    const snapshot = controller.getSnapshot();
    return service.export(input, snapshot.clips, selectShareVideoEncoder(snapshot.capture.capabilities.encoders), (fraction) => {
      if (!event.sender.isDestroyed()) event.sender.send(ipcChannels.clipExportProgress, { exportId: input.exportId, percent: Math.min(99, Math.round(fraction * 100)), stage: fraction >= 0.92 ? 'finalizing' : 'compressing' });
    });
  });
  ipcMain.handle(montageV2IpcChannels.cancelExport, (event, raw) => {
    assertTrustedSender(event, getMainWindow);
    service.cancelExport(montageDraftIdSchema.parse(raw));
  });

  return () => {
    for (const channel of Object.values(montageV2IpcChannels)) ipcMain.removeHandler(channel);
  };
}
