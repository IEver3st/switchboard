import { app, BrowserWindow, desktopCapturer } from 'electron';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

app.setName('switchboard-wgc-repro');
app.setPath('userData', await mkdtemp(join(tmpdir(), 'switchboard-wgc-repro-')));

if (process.env.SWITCHBOARD_TEST_DISABLE_WGC_WINDOW_CAPTURE) {
  app.commandLine.appendSwitch('disable-features', process.env.SWITCHBOARD_TEST_DISABLE_WGC_WINDOW_CAPTURE);
}

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false });
  await window.loadURL('data:text/html,<title>WGC repro</title>');
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: process.env.SWITCHBOARD_TEST_ZERO_THUMBNAILS === '1'
      ? { width: 0, height: 0 }
      : { width: 320, height: 180 },
  });
  console.log(JSON.stringify({ windowSources: sources.length }));
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
