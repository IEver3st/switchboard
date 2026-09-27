// Review-only: confirms which startup messages are exposed after the stall notice.
import { app, BrowserWindow } from 'electron';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 1080, height: 720, useContentSize: true,
    webPreferences: { preload: join(here, 'preload.cjs'), sandbox: true, backgroundThrottling: false, additionalArguments: ['--startup-mode=pending'] } });
  await w.loadFile(resolve(here, '..', '..', 'out', 'renderer', 'index.html')).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 12_600));
  const dom = await w.webContents.executeJavaScript(`[...document.querySelectorAll('.startup-sequence__message')].map((e) => ({ cls: e.className, computed: getComputedStyle(e).visibility, checkVisibility: e.checkVisibility({ visibilityProperty: true, opacityProperty: true }) }))`);
  w.webContents.debugger.attach('1.3');
  const { nodes } = await w.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
  const names = nodes.filter((n) => !n.ignored && n.name?.value).map((n) => `${n.role?.value}: ${n.name.value}`);
  console.log(JSON.stringify({ dom, names }, null, 2));
  app.exit(0);
});
