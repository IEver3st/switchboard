import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import {
  appSettingsSchema,
  captureConfigSchema,
  ipcChannels,
  setAudioBusGainInputSchema,
  setDeviceSettingInputSchema,
  setMicProcessorInputSchema,
  setModuleStateInputSchema,
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
    ipcChannels.setDeviceSetting,
    getMainWindow,
    (input) => setDeviceSettingInputSchema.parse(input),
    (input) => controller.setDeviceSetting(input),
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
    (input) => captureConfigSchema.partial().parse(input),
    (input) => controller.setCaptureConfig(input),
  );
  ipcMain.handle(ipcChannels.saveReplay, (event) => {
    assertTrustedSender(event, getMainWindow);
    return controller.saveReplay();
  });
  handle(
    ipcChannels.updateSettings,
    getMainWindow,
    (input) => appSettingsSchema.partial().parse(input),
    (input) => controller.updateSettings(input),
  );
  handle(
    ipcChannels.revealClip,
    getMainWindow,
    (input) => z.string().min(1).max(4_096).parse(input),
    (path) => controller.revealClip(path),
  );

  const unsubscribe = controller.subscribe((snapshot) => {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(ipcChannels.snapshotUpdated, snapshot);
  });

  return () => {
    unsubscribe();
    for (const channel of Object.values(ipcChannels)) {
      if (channel !== ipcChannels.snapshotUpdated) ipcMain.removeHandler(channel);
    }
  };
}
