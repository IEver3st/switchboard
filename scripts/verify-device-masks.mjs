import { app, BrowserWindow } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'design-qa', 'device-masks', process.argv[2] ?? 'after');
app.setName('switchboard-mask-review');
app.setAppPath(root);
app.setPath('userData', await mkdtemp(join(tmpdir(), 'switchboard-mask-review-')));
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
const delay = ms => new Promise(r => setTimeout(r, ms));
let window;
const evaluate = source => window.webContents.executeJavaScript(source, true);
async function wait(source) {
  for (let i = 0; i < 250; i++) {
    if (await evaluate(source)) return;
    await delay(80);
  }
  throw new Error(`Timed out: ${source}`);
}
async function run() {
try {
  await app.whenReady();
  for (let i = 0; i < 250 && !window; i++) {
    window = BrowserWindow.getAllWindows()[0];
    await delay(80);
  }
  await wait('Boolean(window.switchboard)');
  await evaluate('window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100 })');
  await wait("!document.querySelector('.startup-screen')");
  const report = [];
  for (const [name, key] of [
    ['mouse', 'logitech-g502-x-plus-white'],
    ['keyboard', 'razer-huntsman-v2-analog'],
  ]) {
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'All devices')?.click()`);
    await wait("Boolean(document.querySelector('.device-gallery'))");
    await evaluate(`document.querySelector('.device-gallery [data-asset-key="${key}"]').closest('button').click()`);
    await wait(`Boolean(document.querySelector('.device-render--hero[data-asset-key="${key}"] canvas[data-render-state="ready"]'))`);
    const device = await evaluate(`(async () => (await window.switchboard.getSnapshot()).devices.find(d => d.asset.key === '${key}'))()`);
    const control = async change => {
      await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: device.id, change })})`);
      await delay(250);
      await wait("Boolean(document.querySelector('.device-render--hero canvas[data-render-state=ready]'))");
    };
    await control({ type: 'lighting-effect', effectId: 'static' });
    await control({ type: 'lighting-color', color: '#0099ff' });
    let offCanvas;
    for (const [state, enabled, brightness] of [['on', true, 100], ['off', false, 100], ['zero', true, 0]]) {
      await control({ type: 'lighting-enabled', enabled });
      await control({ type: 'lighting-brightness', brightness });
      for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
        if (window.isMaximized()) window.unmaximize();
        window.setContentSize(width, height, false);
        await wait(`Math.abs(innerWidth - ${width}) <= 2 && Math.abs(innerHeight - ${height}) <= 2`);
        await delay(200);
        const metrics = await evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, state: document.querySelector('.device-render--hero')?.dataset.lightingEnabled })`);
        if (metrics.scrollWidth > metrics.width) throw new Error('Horizontal overflow');
        const file = `${name}-${state}-${width}x${height}.png`;
        await writeFile(join(output, file), (await window.webContents.capturePage()).toPNG());
        if (width === 1420) {
          const data = await evaluate(`document.querySelector('.device-render--hero canvas').toDataURL().split(',')[1]`);
          if (state === 'off') offCanvas = data;
          if (state === 'zero' && data !== offCanvas) throw new Error(`${name}: zero brightness differs from off`);
          if (name === 'keyboard') {
            const opaqueWristRest = await evaluate(`(() => {
              const canvas = document.querySelector('.device-render--hero canvas');
              const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
              for (let y = Math.floor(canvas.height * .72); y < canvas.height * .95; y++) {
                for (let x = Math.floor(canvas.width * .1); x < canvas.width * .95; x++) {
                  if (data[(y * canvas.width + x) * 4 + 3] !== 255) return false;
                }
              }
              return true;
            })()`);
            if (!opaqueWristRest) throw new Error('Huntsman matte erased wrist-rest material');
          }
          await writeFile(join(output, `${name}-${state}-canvas.png`), Buffer.from(data, 'base64'));
        }
        report.push({ file, metrics });
      }
    }
    window.webContents.reloadIgnoringCache();
    await wait('Boolean(window.switchboard)');
    await wait("!document.querySelector('.startup-screen')");
    const persisted = await evaluate(`(async () => (await window.switchboard.getSnapshot()).devices.find(d => d.id === ${JSON.stringify(device.id)}).capabilities.lighting)()`);
    if (!persisted.enabled || persisted.brightness !== 0) throw new Error('Lighting state did not persist across reload');
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Verified device masks: ${report.length} native captures in ${output}`);
  app.exit(0);
} catch (error) {
  console.error(error);
  app.exit(1);
}
}
void run();
