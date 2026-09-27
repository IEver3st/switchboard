import { app, BrowserWindow, desktopCapturer } from 'electron';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

app.setPath('userData', await mkdtemp(join(tmpdir(), 'switchboard-source-memory-')));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
void app.whenReady().then(async () => {
const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
await window.loadURL('about:blank');
async function sample(phase) {
  await delay(3000);
  console.log(JSON.stringify({ phase, processes: app.getAppMetrics().map(p => ({
    role: p.type, privateMb: Math.round(p.memory.privateBytes / 1024), residentMb: Math.round(p.memory.workingSetSize / 1024),
  })) }));
}
try {
  await sample('baseline');
  window.setContentSize(1420, 900);
  window.setPosition(-30000, -30000);
  window.showInactive();
  await sample('blank-window-composited');
  await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
  await sample('inventory-only');
  for (let i = 0; i < 3; i++) {
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 180 } });
    await sample(`screen-preview-${i + 1}`);
  }
} finally { window.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
