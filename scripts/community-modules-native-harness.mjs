import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'design-qa/community-modules-20260916');
const phase = process.argv[2];
const id = 'device.review.community';
const key = generateKeyPairSync('ed25519');
let version = '1.0.0';
let offline = false;
function packageBytes() {
  const payload = Buffer.from(JSON.stringify({ repository: 'switchboard-review/device-module', manifest: {
    schemaVersion: 1, id, name: 'Community review device', description: 'A fixture for testing the community module installation workflow.',
    author: 'Review fixture', version, minimumCoreVersion: '0.9.0', kind: 'device', entrypoint: 'src/index.js', capabilities: ['device-discovery'],
    permissions: { hid: [{ vendorId: 'fffe', productIds: ['fffe'] }] },
  }, source: 'export default { detect() { return []; } };' }));
  return Buffer.from(JSON.stringify({ format: 1, payload: payload.toString('base64'), publicKey: key.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), signature: sign(null, payload, key.privateKey).toString('base64') }));
}
const actualFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).includes('switchboard-review/device-module')) {
    await delay(100);
    if (offline) throw new Error('Review fixture: network unavailable.');
    const bytes = packageBytes();
    if (String(url).includes('api.github.com')) return new Response(JSON.stringify({ tag_name: `v${version}`, draft: false, prerelease: false,
      assets: [{ name: 'switchboard-module.json', size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, browser_download_url: `https://github.com/switchboard-review/device-module/releases/download/v${version}/switchboard-module.json` }] }));
    return new Response(bytes);
  }
  return actualFetch(url, options);
};

app.setName('switchboard-community-review');
app.setAppPath(root);
app.setPath('userData', process.env.SWITCHBOARD_COMMUNITY_REVIEW_DATA);
const watchdog = setTimeout(() => { console.error('Community review timed out.'); app.exit(2); }, 60_000);
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1); });

async function run() {
  let window;
  for (let i = 0; i < 200 && !window; i++) { window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed()); if (!window) await delay(25); }
  assert(window); assert(!window.isVisible());
  const js = code => window.webContents.executeJavaScript(code);
  window.webContents.setBackgroundThrottling(false);
  window.setMinimumSize(1, 1);
  await until(js, 'Boolean(window.switchboard) && !document.querySelector(".startup-screen")');
  window.webContents.setZoomFactor(1);
  const snapshot = () => js('window.switchboard.getSnapshot()');
  const current = async () => (await snapshot()).modules.find(module => module.id === id);
  if (phase === 'restart') {
    await until(js, `(async () => (await window.switchboard.getSnapshot()).modules.find(m => m.id === '${id}')?.development?.status === 'ready')()`);
    assert.equal((await current()).enabled, true);
    assert.equal((await current()).source, 'community');
    assert.equal((await current()).version, '1.0.0');
    await js(`window.switchboard.setModuleState({ moduleId: '${id}', enabled: false })`);
    assert.equal((await current()).enabled, false);
    await js(`window.sessionStorage.setItem('switchboard.settings.category', 'modules'); window.location.hash = 'settings'`);
    await until(js, `Boolean(document.querySelector('[data-module-row="${id}"]'))`);
    await js(`document.querySelector('[data-module-row="${id}"] .module-list-row__main').click()`);
    await clickText(js, '.community-module-actions button', 'Remove…');
    await js(`document.querySelector('.community-module-remove input').click()`);
    await clickText(js, '.community-module-remove button', 'Remove module');
    await until(js, `(async () => !(await window.switchboard.getSnapshot()).modules.some(m => m.id === '${id}'))()`);
    // Verify that the UI action persisted revocation in the main-owned policy.
    const blocked = JSON.parse(await (await import('node:fs/promises')).readFile(resolve(process.env.SWITCHBOARD_COMMUNITY_REVIEW_DATA, 'community-modules', 'blocked-publishers.json'), 'utf8'));
    assert.equal(blocked.length, 1);
    console.log('Community native restart: signed package and enabled state survived; disable and publisher-block removal succeeded.');
  } else {
    await js(`window.switchboard.updateSettings({ onboardingCompleted: true, uiScalePercent: 100 })`);
    await js(`window.sessionStorage.setItem('switchboard.settings.category', 'modules'); window.location.hash = 'settings'`);
    await until(js, 'Boolean(document.querySelector("[data-community-install]"))');
    for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
      window.setContentSize(width, height, false);
      await until(js, `innerWidth === ${width}`);
      await js('document.querySelector("[data-community-install]").click()');
      await until(js, 'Boolean(document.querySelector("[data-community-dialog]"))');
      await setInput(js, 'invalid URL');
      await clickText(js, '[data-community-dialog] button', 'Review');
      await until(js, 'Boolean(document.querySelector("[data-community-dialog] [role=alert]"))');
      assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
      await capture(window, `error-${width}x${height}`);
      await setInput(js, 'switchboard-review/device-module');
      await clickText(js, '[data-community-dialog] button', 'Review');
      await until(js, 'Boolean(document.querySelector("[data-community-review]"))');
      assert.equal(await js(`(() => { const r = document.querySelector('[data-community-dialog]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`), true);
      assert.equal(await js(`document.querySelector('[data-community-dialog]').scrollWidth <= document.querySelector('[data-community-dialog]').clientWidth`), true);
      await capture(window, `review-${width}x${height}`);
      await clickText(js, '[data-community-dialog] button', 'Cancel');
      await until(js, '!document.querySelector("[data-community-dialog]")');
      assert.equal(await js('document.activeElement?.hasAttribute("data-community-install")'), true);
    }
    // Real main/preload/UI installation with a deterministic signed GitHub transport fixture.
    await js('document.querySelector("[data-community-install]").click()');
    await setInput(js, 'switchboard-review/device-module');
    offline = true;
    await clickText(js, '[data-community-dialog] button', 'Review');
    await until(js, 'document.querySelector("[data-community-dialog] [role=alert]")?.textContent.includes("network unavailable")');
    offline = false;
    await clickText(js, '[data-community-dialog] button', 'Review');
    await until(js, 'Boolean(document.querySelector("[data-community-confirm]"))');
    await js('document.querySelector("[data-community-confirm]").click()');
    await until(js, 'document.querySelector("[data-community-dialog]")?.textContent.includes("Module installed")');
    assert.equal((await current()).enabled, false);
    await clickText(js, '[data-community-dialog] button', 'Done');
    for (const enabled of [true, false, true]) {
      await js(`document.querySelector('[data-module-toggle="${id}"]').click()`);
      await until(js, `(async () => (await window.switchboard.getSnapshot()).modules.find(m => m.id === '${id}')?.enabled === ${enabled})()`);
    }
    window.webContents.reload();
    await until(js, `Boolean(document.querySelector('[data-module-toggle="${id}"]'))`);
    assert.equal((await current()).enabled, true);
    await js(`document.querySelector('[data-module-row="${id}"] .module-list-row__main').click()`);
    await until(js, `Boolean(document.querySelector('[data-module-details="${id}"]'))`);
    version = '2.0.0';
    await clickText(js, '.community-module-actions button', 'Review update');
    await clickText(js, '[data-community-dialog] button', 'Review');
    await until(js, 'Boolean(document.querySelector("[data-community-confirm]"))');
    await js('document.querySelector("[data-community-confirm]").click()');
    await until(js, 'document.querySelector("[data-community-dialog]")?.textContent.includes("Module installed")');
    assert.equal((await current()).version, '2.0.0'); assert.equal((await current()).enabled, false);
    await clickText(js, '[data-community-dialog] button', 'Done');
    await clickText(js, '.community-module-actions button', 'Roll back to v1.0.0');
    await until(js, `(async () => (await window.switchboard.getSnapshot()).modules.find(m => m.id === '${id}')?.version === '1.0.0')()`);
    await capture(window, 'rollback-details');
    assert.equal(await js(`document.querySelector('[data-module-details] [role="switch"]').getAttribute('data-state')`), 'unchecked');
    await clickText(js, '.community-module-actions button', 'Remove…');
    await clickText(js, '.community-module-remove button', 'Remove module');
    await until(js, `(async () => !(await window.switchboard.getSnapshot()).modules.some(m => m.id === '${id}'))()`);
    version = '1.0.0';
    const review = await js('window.switchboard.inspectCommunityModule({repository: "switchboard-review/device-module"})');
    await js(`window.switchboard.installCommunityModule({reviewId: ${JSON.stringify(review.reviewId)}})`);
    await js(`window.switchboard.setModuleState({moduleId: '${id}', enabled: true})`);
    await window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await js('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
    window.webContents.debugger.detach();
    console.log('Community native UI: all three sizes; validation/offline errors; install; repeated toggles; renderer refresh; update; rollback; remove; focus restoration; reduced motion.');
  }
  assert(BrowserWindow.getAllWindows().every(w => !w.isVisible()));
  clearTimeout(watchdog);
  app.quit();
}
async function until(js, condition) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) { try { if (await js(condition)) return; } catch {} await delay(40); }
  throw new Error(`Timed out: ${condition}; viewport ${await js('JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})')}`);
}
async function setInput(js, value) {
  await until(js, 'Boolean(document.querySelector("[data-community-dialog] input"))');
  await js(`(() => { const input = document.querySelector('[data-community-dialog] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
}
async function clickText(js, selector, text) {
  await until(js, `[...document.querySelectorAll(${JSON.stringify(selector)})].some(button => button.textContent.trim() === ${JSON.stringify(text)} && !button.disabled)`);
  await js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`);
}
async function capture(window, name) {
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await delay(180);
  await writeFile(resolve(output, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
function delay(ms) { return new Promise(done => setTimeout(done, ms)); }
