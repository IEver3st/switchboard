import { app, BaseWindow, webContents } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const output = await mkdtemp(resolve(tmpdir(), 'switchboard-device-notifications-'));
app.setPath('userData', output);
await exec('bun', ['build', 'src/main/services/windows-device-notifications.ts', '--target=node', '--format=esm', '--external=electron', `--outfile=${resolve(output, 'watcher.mjs')}`], { cwd: resolve(import.meta.dirname, '..'), windowsHide: true });
const { watchWindowsDeviceChanges } = await import(pathToFileURL(resolve(output, 'watcher.mjs')).href);
app.on('window-all-closed', () => {});
void app.whenReady().then(async () => {
  const initial = webContents.getAllWebContents().length;
  const windows = BaseWindow.getAllWindows().length;
  for (let i = 0; i < 3; i++) {
    let notifications = 0;
    const stop = watchWindowsDeviceChanges(() => notifications++);
    const window = BaseWindow.getAllWindows().at(-1);
    if (!window || window.isVisible() || webContents.getAllWebContents().length !== initial) throw new Error('Notification watcher created visible UI or a renderer.');
    const hwnd = window.getNativeWindowHandle().readBigUInt64LE(0).toString();
    await exec('powershell.exe', ['-NoProfile', '-Command', `Add-Type 'using System; using System.Runtime.InteropServices; public class NotificationProbe { [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }'; [NotificationProbe]::SendMessage([IntPtr]${hwnd}, 0x219, [IntPtr]7, [IntPtr]0) | Out-Null`], { windowsHide: true });
    if (notifications !== 1) throw new Error('Native device message did not reach the watcher.');
    stop(); stop();
    if (BaseWindow.getAllWindows().length !== windows) throw new Error('Native notification window leaked.');
  }
  console.log('Device notifications: 3 start/message/stop cycles; no renderer or visible window.');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
