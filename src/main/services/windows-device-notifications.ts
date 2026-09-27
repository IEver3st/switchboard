import { BaseWindow } from 'electron';

/** HWND only: no webContents, renderer, polling, or visible window. */
export function watchWindowsDeviceChanges(onChange: () => void): () => void {
  const window = new BaseWindow({ show: false, focusable: false, skipTaskbar: true, width: 1, height: 1 });
  const message = 0x0219; // WM_DEVICECHANGE / DBT_DEVNODES_CHANGED
  try {
    window.hookWindowMessage(message, wParam => {
      if (wParam.readUInt32LE(0) === 0x0007) onChange();
    });
  } catch (error) { window.destroy(); throw error; }
  return () => {
    if (window.isDestroyed()) return;
    window.unhookWindowMessage(message);
    window.destroy();
  };
}
