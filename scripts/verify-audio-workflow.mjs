import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.switchboard', 'audio-repair-20260907', 'native');
const userData = process.env.SWITCHBOARD_AUDIO_UI_USER_DATA ?? await mkdtemp(join(tmpdir(), 'switchboard-audio-workflow-'));
const restorePhase = process.argv.includes('--restore');
app.setName('switchboard-audio-workflow-review');
app.setAppPath(root);
app.setPath('userData', userData);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('force-prefers-reduced-motion');
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1';
process.env.SWITCHBOARD_NATIVE_REVIEW_AUDIO_HOST = join(root, 'engines', 'audio-host', 'bin', 'Release', 'net10.0-windows', 'Audio.Host.exe');
app.on('browser-window-created', (_event, window) => {
  window.setPosition(-10_000, -10_000, false);
  window.setFocusable(false);
  window.setMinimumSize(1, 1);
  window.webContents.setBackgroundThrottling(false);
});

let gainFault = null;
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => originalHandle(channel, async (...args) => {
  if (channel === 'audio:set-master-gain') evidence.gainRequests = [...(evidence.gainRequests ?? []), args[1]];
  if (channel === 'audio:set-master-gain' && gainFault) {
    const fault = gainFault;
    gainFault = null;
    await fault.wait;
    if (fault.reject) throw new Error('Audio verification: rejected change');
  }
  return handler(...args);
});
let window;
const evidence = { userData, layouts: [], checks: [], consoleErrors: [] };
await mkdir(output, { recursive: true });
await import('../out/main/index.js');
app.whenReady().then(run).catch(async error => {
  evidence.error = String(error.stack ?? error);
  try { evidence.page = await evaluate('({hash:location.hash,body:document.body.innerText.slice(0,6000)})'); await screenshot('failure'); } catch {}
  await writeFile(join(output, 'workflow.json'), JSON.stringify(evidence, null, 2));
  console.error(evidence.error);
  process.env.SWITCHBOARD_REVIEW_EXIT_CODE = '1';
  app.quit();
  setTimeout(() => app.exit(1), 5_000).unref();
});

const delay = ms => new Promise(done => setTimeout(done, ms));
function assert(condition, message) { if (!condition) throw new Error(message); }
async function evaluate(source) { return window.webContents.executeJavaScript(source); }
async function until(check, message) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(message);
}
async function snapshot() { return evaluate('window.switchboard.getSnapshot()'); }
async function api(method, ...args) { return evaluate(`window.switchboard[${JSON.stringify(method)}](...${JSON.stringify(args)})`); }
async function route(tab) {
  await evaluate(`window.location.hash = ${JSON.stringify(`audio/${tab}`)}; window.dispatchEvent(new HashChangeEvent('hashchange'));`);
  await until(() => evaluate(`!!document.querySelector('.audio-page[data-audio-tab=${JSON.stringify(tab)}]')`), `Missing audio ${tab}`);
}
async function screenshot(name) {
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await delay(150);
  await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage()).toPNG());
}
async function click(selector) {
  assert(await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}); if(!node || node.disabled) return false; node.click(); return true})()`), `Cannot click ${selector}`);
  await delay(80);
}
async function key(selector, key) {
  assert(await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}); if(!node) return false; node.focus(); node.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true})); return true})()`), `Missing keyboard control: ${selector}`);
}
async function exact(label, value) {
  const selector = `input[aria-label="${label} exact volume percentage"]`;
  await until(() => evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`), `Input unavailable: ${label}`);
  await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await delay(50);
  evidence.lastExactInput = await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});return {active:document.activeElement===input,value:input.value,focused:document.hasFocus()};})()`);
  await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)}); if(document.hasFocus()) input.blur(); else input.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));})()`);
}
async function setViewport(width, height) {
  window.setMinimumSize(1, 1);
  window.setContentSize(width, height, false);
  await window.webContents.capturePage();
  await delay(250);
  const actual = await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  if (actual.width !== width || actual.height !== height) {
    window.setSize(window.getBounds().width + width - actual.width, window.getBounds().height + height - actual.height, false);
    await window.webContents.capturePage();
  }
  await until(() => evaluate(`innerWidth===${width} && innerHeight===${height}`), `Cannot size native viewport to ${width}x${height}: ${JSON.stringify({actual,bounds:window.getBounds(),content:window.getContentBounds(),zoom:window.webContents.getZoomFactor()})}`);
}

async function run() {
  await until(async () => { window = BrowserWindow.getAllWindows()[0]; return window && !window.webContents.isLoading(); }, 'No hidden app window');
  window.webContents.on('console-message', event => { if (event.level === 'error') evidence.consoleErrors.push(event.message); });
  await until(() => evaluate('!!window.switchboard && document.body.innerText.length > 0'), 'Renderer did not load');
  await evaluate(`(()=>{const skip=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Skip setup');skip?.click();})()`);
  await until(() => evaluate('!!window.switchboard && !!document.querySelector("nav[aria-label=Primary]") && !document.querySelector(".startup-screen")'), 'App did not initialize');
  evidence.displays = screen.getAllDisplays().map(display => ({ bounds: display.bounds, primary: display.id === screen.getPrimaryDisplay().id }));
  assert(!window.isVisible() && !window.isFocused(), 'Review window must remain hidden and unfocused.');
  if (restorePhase) {
    const state = await snapshot();
    assert(state.audio.mixes[0].master.gain === 1.27, 'Master did not persist across application restart');
    assert(state.audio.chatMix === -0.25, 'ChatMix did not persist across application restart');
    assert(state.audio.micProcessors.find(item => item.id === 'gain').parameters.gainDb === 3, 'Microphone gain did not persist');
    assert(state.audio.pathPresets.some(item => item.name === 'Audio verification voice'), 'User preset did not persist');
    evidence.checks.push('application restart persistence');
    await writeFile(join(output, 'restart.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ passed: true, phase: 'restore', userData }));
    app.quit();
    return;
  }
  await api('updateSettings', { developerMode: true, visibleWorkspaces: ['devices', 'audio', 'capture'], uiScalePercent: 100 });
  await api('setAudioEnabled', true);
  let state = await snapshot();
  assert(state.audio.host?.capabilities.microphoneDsp === 'available', `Physical microphone unavailable: ${state.audio.host?.microphone?.error}`);
  assert(!state.audio.monitoringEnabled, 'Review must not play microphone monitoring');
  evidence.initialHost = state.audio.host;
  await route('mixer');
  for (const [width, height] of process.argv.includes('--interactions-only') ? [] : [[1080, 720], [1420, 900], [1920, 1080]]) {
    await setViewport(width, height);
    for (const tab of ['mixer', 'game', 'chat', 'media', 'microphone']) {
      await route(tab);
      const metrics = await evaluate(`(()=>{const viewport=document.querySelector('[data-radix-scroll-area-viewport]');const chat=document.querySelector('.chatmix-control');return {width:innerWidth,height:innerHeight,horizontalOverflow:document.documentElement.scrollWidth>innerWidth || (!!viewport && viewport.scrollWidth>viewport.clientWidth+1),chatMixVisible:!chat || chat.getBoundingClientRect().bottom<=innerHeight, status:document.querySelector('.audio-header__identity p')?.textContent, reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches}})()`);
      assert(!metrics.horizontalOverflow, `Audio ${tab} overflows at ${width}x${height}`);
      assert(metrics.chatMixVisible, `ChatMix requires scrolling at ${width}x${height}`);
      await screenshot(`${width}x${height}-${tab}`);
      evidence.layouts.push({ tab, ...metrics });
    }
  }
  await setViewport(1420, 900);
  await route('mixer');
  await exact('Personal master', 127);
  await until(async () => (await snapshot()).audio.mixes[0].master.gain === 1.27, 'Master did not reach canonical state');
  await click('[aria-label="Mute master output"]');
  await until(async () => !(await snapshot()).audio.mixes[0].master.enabled, 'Master mute failed');
  await click('[aria-label="Unmute master output"]');
  await api('setAudioBusGain', { mixId: 'stream', busId: 'game', gain: 0.61 });
  state = await snapshot();
  assert(state.audio.mixes.find(mix => mix.id === 'personal').buses.find(bus => bus.id === 'game').gain === 1, 'Stream edit changed personal mix');
  await api('setChatMix', -0.25);
  await key('[aria-label="ChatMix game and chat balance"]', 'ArrowRight');
  await until(async () => (await snapshot()).audio.chatMix === -0.24, 'ChatMix keyboard edit did not persist');
  await click('[aria-label="Reset ChatMix to center"]');
  await until(async () => (await snapshot()).audio.chatMix === 0, 'ChatMix reset did not persist');
  await api('setChatMix', -0.25);
  evidence.checks.push('ChatMix keyboard and reset');
  await api('setAudioChannelEnabled', { busId: 'media', enabled: false });
  await until(() => evaluate(`!!document.querySelector('[aria-label="Enable Media channel"]')`), 'Disabled channel state missing');
  await screenshot('media-disabled');
  await click('[aria-label="Enable Media channel"]');
  evidence.checks.push('master exact gain and mute', 'independent destination mixes', 'disabled channel restoration');

  let release;
  gainFault = { reject: true, wait: new Promise(done => { release = done; }) };
  await exact('Personal master', 42);
  await until(() => evaluate('document.querySelector(".mixer-channel--master")?.getAttribute("aria-busy")==="true"'), 'Pending mixer state missing');
  assert((await snapshot()).audio.mixes[0].master.gain === 1.27, 'Pending gain overwrote confirmed state');
  await screenshot('mixer-pending');
  release();
  await until(() => evaluate(`!document.querySelector('input[aria-label="Personal master exact volume percentage"]').disabled`), 'Pending state did not clear after rejection');
  assert(await evaluate(`document.querySelector('input[aria-label="Personal master exact volume percentage"]').value === '127'`), 'Rejected gain did not restore the displayed value');
  await screenshot('mixer-rejected');
  evidence.checks.push('pending status and rejected fader restoration');

  await route('microphone');
  await api('setMicProcessor', { processorId: 'gain', parameters: { gainDb: 3 } });
  await key('[role="slider"][aria-label="Gain"]', 'ArrowRight');
  await until(async () => (await snapshot()).audio.micProcessors.find(item => item.id === 'gain').parameters.gainDb > 3, 'Microphone parameter keyboard edit failed');
  await api('setMicProcessor', { processorId: 'gain', parameters: { gainDb: 3 } });
  const eqBefore = (await snapshot()).audio.micProcessors.find(item => item.id === 'equalizer').parameters.bands;
  await key('[aria-label="EQ band 1"]', 'ArrowUp');
  await until(async () => (await snapshot()).audio.host.microphone.processors.find(item => item.id === 'equalizer').parameters.bands[0].gainDb === eqBefore[0].gainDb + 0.5, 'Equalizer keyboard edit did not reach the host');
  await click('[aria-label="Bypass Equalizer"]');
  await until(() => evaluate(`document.querySelector('[aria-label="EQ band 1"]').getAttribute('aria-disabled')==='true'`), 'Bypassed EQ must disable band controls');
  await key('[aria-label="EQ band 1"]', 'ArrowUp');
  await delay(80);
  assert((await snapshot()).audio.micProcessors.find(item => item.id === 'equalizer').parameters.bands[0].gainDb === eqBefore[0].gainDb + 0.5, 'Disabled EQ accepted a keyboard edit');
  await click('[aria-label="Enable Equalizer"]');
  await api('setMicProcessor', { processorId: 'equalizer', parameters: { bands: eqBefore } });
  evidence.checks.push('microphone and EQ keyboard controls', 'disabled EQ rejects retained keyboard focus');
  await api('createAudioPreset', { kind: 'microphone', name: 'Audio verification voice' });
  state = await snapshot();
  assert(state.audio.host.microphone.processors.find(item => item.id === 'gain').parameters.gainDb === 3, 'Host microphone settings did not match');
  const microphoneId = state.audio.buses.find(bus => bus.id === 'mic').deviceId;
  const outputId = state.audio.buses.find(bus => bus.id === 'game').deviceId;
  const rejectedInput = await evaluate(`window.switchboard.setAudioBusDevice({busId:'mic',deviceId:${JSON.stringify(outputId)}}).then(()=>false,()=>true)`);
  assert(rejectedInput && (await snapshot()).audio.buses.find(bus => bus.id === 'mic').deviceId === microphoneId, 'Invalid input replaced the microphone');
  evidence.checks.push('microphone processor host confirmation', 'user preset creation', 'invalid endpoint rejection');

  const hostPid = state.engines.find(engine => engine.kind === 'audio').pid;
  assert(hostPid && hostPid !== process.pid, 'No owned audio process to exercise recovery');
  process.kill(hostPid);
  await until(async () => { const live = await snapshot(); return live.audio.host?.running && live.engines.find(engine => engine.kind === 'audio').pid !== hostPid; }, 'Killed audio host did not recover');
  evidence.checks.push('killed host recovery');

  const sceneState = await api('saveScene', { name: 'Audio verification scene', captureCurrent: true, includeAudio: true, includeCapture: false, includeDevices: false });
  const sceneId = sceneState.setup.scenes.find(scene => scene.name === 'Audio verification scene').id;
  await api('setAudioEnabled', false);
  await api('applyScene', sceneId);
  assert((await snapshot()).audio.host?.running, 'An enabled audio scene did not start the stopped host');
  await api('restoreScene');
  assert(!(await snapshot()).audio.enabled, 'Restoring the scene did not stop its host');
  evidence.checks.push('audio scene starts a stopped host and restores off');

  await route('microphone');
  evidence.stopped = (await snapshot()).audio;
  assert(evidence.stopped.capabilities.microphoneDsp === 'unavailable' && evidence.stopped.host === null, 'Stopped audio retained live host capabilities');
  await until(() => evaluate(`document.querySelector('[aria-label="EQ band 1"]').getAttribute('aria-disabled')==='true' && [...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Test microphone')?.disabled`), 'Stopped microphone controls did not disable');
  await screenshot('microphone-off');
  window.webContents.reload();
  await until(() => evaluate('!!document.querySelector("nav[aria-label=Primary]")'), 'Renderer reload failed');
  state = await snapshot();
  assert(state.audio.mixes[0].master.gain === 1.27 && state.audio.chatMix === -0.25, 'Audio values did not survive reload');
  evidence.checks.push('renderer reload persistence', 'audio stop releases host');
  evidence.final = state.audio;
  assert(!window.isVisible() && !window.isFocused(), 'Review unexpectedly showed or focused a window');
  await writeFile(join(output, 'workflow.json'), JSON.stringify(evidence, null, 2));
  await writeFile(join(output, 'user-data.txt'), userData);
  console.log(JSON.stringify({ passed: true, checks: evidence.checks, output, userData }));
  app.quit();
}
