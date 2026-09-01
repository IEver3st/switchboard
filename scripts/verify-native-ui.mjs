import { app, BrowserWindow } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reviewRoot = join(projectRoot, '.impeccable', 'review', 'native');
const userData = join(reviewRoot, 'workflow-user-data');
const expectationPath = join(reviewRoot, 'workflow-expectation.json');
const reportPath = join(reviewRoot, 'workflow-report.json');
const phase = process.argv.find((argument) => argument.startsWith('--phase='))?.split('=')[1] ?? 'write';

if (!['write', 'verify'].includes(phase)) throw new Error(`Unknown native UI verification phase: ${phase}`);
if (relative(reviewRoot, userData).startsWith(`..${sep}`) || relative(reviewRoot, userData) === '..') {
  throw new Error('Native UI verification data must stay inside the review directory.');
}

await mkdir(reviewRoot, { recursive: true });
if (phase === 'write') {
  await rm(userData, { recursive: true, force: true });
  await mkdir(userData, { recursive: true });
}

app.setName('switchboard-native-ui-verification');
app.setAppPath(projectRoot);
app.setPath('userData', userData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

let window;
let report = phase === 'verify'
  ? JSON.parse(await readFile(reportPath, 'utf8'))
  : { startedAt: new Date().toISOString(), steps: [], capabilities: {} };

await import('../out/main/index.js');
void app.whenReady().then(run).catch(async (error) => {
  report.steps.push({ name: `${phase}.failure`, passed: false, error: error instanceof Error ? error.message : String(error) });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`).catch(() => undefined);
  console.error('Native UI verification failed.', error);
  app.exit(1);
});

async function run() {
  window = await waitForWindow();
  await waitForLoad();
  await waitForSelector('nav[aria-label="Primary"]', 20_000);
  window.setContentSize(1420, 900, false);

  if (phase === 'verify') await verifyRestartPersistence();
  else await exerciseWorkflows();

  report.completedAt = new Date().toISOString();
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ phase, passed: true, steps: report.steps.length, reportPath }, null, 2));
  app.quit();
}

async function exerciseWorkflows() {
  await step('devices.open-g502', async () => {
    await openDevice('G502 X Plus');
    return { selected: 'G502 X Plus' };
  });

  const originalMouse = device(await snapshot(), 'G502 X Plus');
  const originalDpi = originalMouse.capabilities.dpi.activeDpi;
  const originalPollingRate = originalMouse.capabilities.reportRate.value;
  const originalShiftDpi = originalMouse.capabilities.dpi.shiftDpi;
  const originalLightingEnabled = originalMouse.capabilities.lighting.enabled;
  const originalLightingColor = originalMouse.capabilities.lighting.color;

  await step('devices.g502-dpi', async () => {
    const next = originalDpi === 3_200 ? 1_600 : 3_200;
    await clickSelector(`[aria-label="${next} DPI"]`);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.dpi.activeDpi === next, 'DPI update');
    return { from: originalDpi, to: next };
  });

  await step('devices.g502-dpi-shift', async () => {
    const next = originalShiftDpi === 700 ? 800 : 700;
    const editor = await setDpiShift(next);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.dpi.shiftDpi === next, 'DPI Shift update');
    return { from: originalShiftDpi, to: next, editor };
  });

  await step('devices.g502-polling-rate', async () => {
    const next = originalPollingRate === 500 ? 1_000 : 500;
    await clickSelector(`[aria-label="${next} hertz"]`);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.reportRate.value === next, 'polling-rate update');
    return { from: originalPollingRate, to: next };
  });

  await step('devices.g502-lighting', async () => {
    await clickSelector('[aria-label="Mouse lighting"]');
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.lighting.enabled !== originalLightingEnabled, 'lighting toggle');
    const enabled = device(await snapshot(), 'G502 X Plus').capabilities.lighting.enabled;
    if (!enabled) await clickSelector('[aria-label="Mouse lighting"]');
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.lighting.enabled, 'lighting enable');
    const nextColor = originalLightingColor?.toUpperCase() === '#FF4F7D' ? '#FF1744' : '#FF4F7D';
    const colorTrigger = await evaluate(`document.querySelector('.lighting-color-trigger')?.getAttribute('aria-label')`);
    if (!colorTrigger) throw new Error('The lighting color picker trigger was not rendered.');
    const mouse = device(await snapshot(), 'G502 X Plus');
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'lighting-color', color: nextColor } })})`);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.lighting.color?.toUpperCase() === nextColor, 'lighting color');
    return { enabled: true, color: nextColor, colorTrigger };
  });

  await step('devices.g502-button-assignment', async () => {
    const callout = await evaluate(`document.querySelector('button[aria-label^="Back, assigned to"]')?.getAttribute('aria-label')`);
    if (!callout) throw new Error('The Back button assignment callout was not rendered.');
    const mouse = device(await snapshot(), 'G502 X Plus');
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'button-assignment', buttonId: 'back', actionId: 'mouse.forward' } })})`);
    await waitSnapshot((value) => binding(value, 'back') === 'mouse.forward', 'button assignment');
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'button-assignment', buttonId: 'back', actionId: 'mouse.back' } })})`);
    await waitSnapshot((value) => binding(value, 'back') === 'mouse.back', 'button assignment restore');
    return { callout, button: 'Back', testedAssignment: 'Forward', restored: 'Back' };
  });

  await restoreMouse({ originalDpi, originalPollingRate, originalShiftDpi, originalLightingEnabled, originalLightingColor });

  await step('devices.open-quadcast', async () => {
    await openDevice('QuadCast 2');
    return { selected: 'QuadCast 2' };
  });

  const originalMicrophone = device(await snapshot(), 'QuadCast 2');
  const originalGain = originalMicrophone.settings.gain;
  const originalMonitoring = originalMicrophone.settings.monitoring;
  const originalMuteLed = originalMicrophone.settings.muteLed;

  await step('devices.quadcast-hardware-controls', async () => {
    const sliders = await evaluate(`
      [...document.querySelectorAll('[role="slider"]')]
        .filter((slider) => ['Input volume', 'Direct monitoring'].includes(slider.getAttribute('aria-label')))
        .map((slider) => ({ label: slider.getAttribute('aria-label'), min: slider.getAttribute('aria-valuemin'), max: slider.getAttribute('aria-valuemax'), value: slider.getAttribute('aria-valuenow') }))
    `);
    if (sliders.length !== 2) throw new Error(`QuadCast hardware sliders were incomplete: ${JSON.stringify(sliders)}`);
    await evaluate(`window.switchboard.setDeviceSetting(${JSON.stringify({ deviceId: originalMicrophone.id, key: 'gain', value: originalGain + 1 })})`);
    await waitSnapshot((value) => device(value, 'QuadCast 2').settings.gain === originalGain + 1, 'microphone gain');
    await evaluate(`window.switchboard.setDeviceSetting(${JSON.stringify({ deviceId: originalMicrophone.id, key: 'monitoring', value: originalMonitoring + 1 })})`);
    await waitSnapshot((value) => device(value, 'QuadCast 2').settings.monitoring === originalMonitoring + 1, 'direct monitoring');
    await clickSelector('[aria-label="Follow physical mute"]');
    await waitSnapshot((value) => device(value, 'QuadCast 2').settings.muteLed !== originalMuteLed, 'mute light toggle');
    return { sliders, gain: originalGain + 1, monitoring: originalMonitoring + 1, muteLed: !originalMuteLed };
  });

  await evaluate(`window.switchboard.setDeviceSetting(${JSON.stringify({ deviceId: originalMicrophone.id, key: 'gain', value: originalGain })})`);
  await evaluate(`window.switchboard.setDeviceSetting(${JSON.stringify({ deviceId: originalMicrophone.id, key: 'monitoring', value: originalMonitoring })})`);
  await clickSelector('[aria-label="Follow physical mute"]');
  report.capabilities.quadCastLighting = originalMicrophone.capabilities.lighting?.writable ? 'writable' : 'unavailable';
  report.capabilities.quadCastInputMeter = (await snapshot()).audio.capabilities.realtimeMetering;

  await openAudioTab('mixer');
  await step('audio.start', async () => {
    if (!(await snapshot()).audio.enabled) {
      await evaluate('window.switchboard.setAudioEnabled(true)');
      await waitSnapshot(
        (value) => value.audio.enabled && value.engines.find((engine) => engine.kind === 'audio')?.state === 'running',
        'Audio start',
        15_000,
      );
    }
    return { state: (await snapshot()).engines.find((engine) => engine.kind === 'audio')?.state };
  });

  await step('audio.mixer-and-chatmix', async () => {
    await waitForSelector('[aria-label="Game in personal mix fader"]');
    await waitForSelector('[aria-label="ChatMix game and chat balance"]');
    const before = await snapshot();
    const originalGameGain = before.audio.mixes.find((mix) => mix.id === 'personal').buses.find((bus) => bus.id === 'game').gain;
    const originalChatMix = before.audio.chatMix;
    const controls = await evaluate(`
      ['Game in personal mix fader', 'ChatMix game and chat balance'].map((label) => {
        const slider = document.querySelector('[aria-label="' + label + '"]');
        return { label, min: slider?.getAttribute('aria-valuemin'), max: slider?.getAttribute('aria-valuemax'), valueText: slider?.getAttribute('aria-valuetext') };
      })
    `);
    if (controls.some((control) => !control.valueText)) throw new Error(`Mixer controls were incomplete: ${JSON.stringify(controls)}`);
    const nextGain = Math.max(0, originalGameGain - 0.05);
    const nextChatMix = Math.min(1, originalChatMix + 0.05);
    await evaluate(`window.switchboard.setAudioBusGain(${JSON.stringify({ mixId: 'personal', busId: 'game', gain: nextGain })})`);
    await waitSnapshot((value) => value.audio.mixes.find((mix) => mix.id === 'personal').buses.find((bus) => bus.id === 'game').gain === nextGain, 'Game fader');
    await evaluate(`window.switchboard.setChatMix(${JSON.stringify(nextChatMix)})`);
    await waitSnapshot((value) => value.audio.chatMix === nextChatMix, 'ChatMix');
    await evaluate(`window.switchboard.setAudioBusGain(${JSON.stringify({ mixId: 'personal', busId: 'game', gain: originalGameGain })})`);
    await evaluate(`window.switchboard.setChatMix(${JSON.stringify(originalChatMix)})`);
    return { controls, gameGainChanged: true, chatMixChanged: true };
  });

  await step('audio.routing-notice-removed', async () => {
    const text = await textContent('.mixer-workbench__routing-note');
    if (text) throw new Error('The mixer still rendered the removed standalone application-routing notice.');
    report.capabilities.applicationRouting = (await snapshot()).audio.capabilities.applicationRouting;
    return { state: report.capabilities.applicationRouting, standaloneNotice: false };
  });

  await step('audio.game-preset-and-eq', async () => {
    await openAudioTab('game');
    const header = await evaluate(`({
      presetDropdown: Boolean(document.querySelector('.preset-picker [role="combobox"]')),
      featuredPresets: Boolean(document.querySelector('.preset-picker__featured')),
      repeatedOutputRoute: Boolean(document.querySelector('.audio-workbench__device')),
    })`);
    if (!header.presetDropdown || header.featuredPresets || header.repeatedOutputRoute) {
      throw new Error(`Game processing header did not use the compact preset-only layout: ${JSON.stringify(header)}`);
    }
    await selectPreset('Competitive FPS');
    await waitSnapshot((value) => value.audio.activePresetIds.game === 'game-competitive-fps', 'Game preset');
    const inputValue = await evaluate(`document.querySelector('#audio-panel-game input[aria-label="EQ band gain"]')?.value`);
    if (inputValue === undefined) throw new Error('The Game EQ exact gain field was not rendered.');
    const game = (await snapshot()).audio.channelProcessing.find((item) => item.busId === 'game');
    const bands = structuredClone(game.equalizer.bands);
    bands[0].gainDb = -2.5;
    await evaluate(`window.switchboard.setAudioChannelProcessor(${JSON.stringify({ busId: 'game', processorId: 'equalizer', parameters: { bands } })})`);
    await waitSnapshot((value) => value.audio.channelProcessing.find((item) => item.busId === 'game').equalizer.bands[0].gainDb === -2.5, 'Game EQ exact value');
    return { preset: 'Competitive FPS', fieldValue: inputValue, gainDb: -2.5, header };
  });

  await step('audio.chat-and-media-presets', async () => {
    await openAudioTab('chat');
    await selectPreset('Clear Voice');
    await waitSnapshot((value) => value.audio.activePresetIds.chat === 'chat-clear-voice', 'Chat preset');
    await openAudioTab('media');
    await selectPreset('Music');
    await waitSnapshot((value) => value.audio.activePresetIds.media === 'media-music', 'Media preset');
    return { chat: 'Clear Voice', media: 'Music' };
  });

  await step('audio.microphone-preset-and-primary-controls', async () => {
    await openAudioTab('microphone');
    await selectPreset('Clear Speech');
    await waitSnapshot((value) => value.audio.activePresetIds.microphone === 'mic-clear-speech', 'Microphone preset');
    const controls = await evaluate(`
      ['Removal strength', 'Gate threshold', 'Compression ratio'].map((label) => {
        const slider = document.querySelector('[role="slider"][aria-label="' + label + '"]');
        return { label, min: slider?.getAttribute('aria-valuemin'), max: slider?.getAttribute('aria-valuemax'), valueText: slider?.getAttribute('aria-valuetext') };
      })
    `);
    if (controls.some((control) => !control.min || !control.max || !control.valueText)) {
      throw new Error(`Microphone primary controls were incomplete: ${JSON.stringify(controls)}`);
    }
    await evaluate(`window.switchboard.setMicProcessor(${JSON.stringify({ processorId: 'noise-suppression', enabled: true, parameters: { amount: 80 } })})`);
    await waitSnapshot((value) => micProcessor(value, 'noise-suppression').parameters.amount === 80, 'Noise removal');
    await evaluate(`window.switchboard.setMicProcessor(${JSON.stringify({ processorId: 'noise-gate', enabled: true, parameters: { thresholdDb: -48 } })})`);
    await waitSnapshot((value) => micProcessor(value, 'noise-gate').parameters.thresholdDb === -48, 'Noise gate');
    await evaluate(`window.switchboard.setMicProcessor(${JSON.stringify({ processorId: 'compressor', enabled: true, parameters: { ratio: 4 } })})`);
    await waitSnapshot((value) => micProcessor(value, 'compressor').parameters.ratio === 4, 'Voice consistency');
    return { controls, noiseRemoval: 80, gateThresholdDb: -48, compressorRatio: 4 };
  });

  await step('audio.microphone-precise-controls-and-eq', async () => {
    const ratioValue = await evaluate(`document.querySelector('#microphone-consistency-section [aria-label="Compression ratio"]')?.getAttribute('aria-valuenow')`);
    if (ratioValue === undefined) throw new Error('The advanced compressor ratio control was not rendered.');
    await evaluate(`window.switchboard.setMicProcessor(${JSON.stringify({ processorId: 'compressor', parameters: { ratio: 4.1 } })})`);
    await waitSnapshot((value) => micProcessor(value, 'compressor').parameters.ratio === 4.1, 'Advanced compressor ratio');
    const voiceSection = await sectionText('Voice consistency');
    if (!voiceSection.includes('4.1')) throw new Error('The visible voice consistency control did not synchronize to 4.1:1.');
    const microphone = await snapshot();
    const bands = structuredClone(micProcessor(microphone, 'equalizer').parameters.bands);
    bands[0].gainDb = -2.5;
    await evaluate(`window.switchboard.setMicProcessor(${JSON.stringify({ processorId: 'equalizer', parameters: { bands } })})`);
    await waitSnapshot((value) => micProcessor(value, 'equalizer').parameters.bands[0].gainDb === -2.5, 'Microphone EQ exact value');
    return { ratioFieldValue: ratioValue, compressorRatio: 4.1, simpleState: 'Custom', eqGainDb: -2.5 };
  });

  await step('audio.capability-gated-workflows', async () => {
    const state = await snapshot();
    const testDisabled = await selectorDisabled('button[aria-describedby="microphone-test-status"]');
    const monitoringDisabled = await selectorDisabled('[aria-label="Monitoring"]');
    const expectedTestDisabled = state.audio.capabilities.microphoneTest !== 'available';
    const expectedMonitoringDisabled = state.audio.capabilities.monitoring === 'unavailable';
    if (testDisabled !== expectedTestDisabled || monitoringDisabled !== expectedMonitoringDisabled) {
      throw new Error(`Microphone actions did not match host capabilities: ${JSON.stringify({
        microphoneTest: state.audio.capabilities.microphoneTest,
        testDisabled,
        monitoring: state.audio.capabilities.monitoring,
        monitoringDisabled,
      })}`);
    }
    report.capabilities.microphoneTest = state.audio.capabilities.microphoneTest;
    report.capabilities.monitoring = state.audio.capabilities.monitoring;
    return {
      microphoneTest: { capability: state.audio.capabilities.microphoneTest, disabled: testDisabled },
      monitoring: { capability: state.audio.capabilities.monitoring, disabled: monitoringDisabled },
    };
  });

  const finalState = await snapshot();
  const expectation = {
    gamePreset: finalState.audio.activePresetIds.game,
    gameEqGainDb: finalState.audio.channelProcessing.find((item) => item.busId === 'game').equalizer.bands[0].gainDb,
    chatPreset: finalState.audio.activePresetIds.chat,
    mediaPreset: finalState.audio.activePresetIds.media,
    microphonePreset: finalState.audio.activePresetIds.microphone,
    noiseRemoval: micProcessor(finalState, 'noise-suppression').parameters.amount,
    gateThresholdDb: micProcessor(finalState, 'noise-gate').parameters.thresholdDb,
    compressorRatio: micProcessor(finalState, 'compressor').parameters.ratio,
    microphoneEqGainDb: micProcessor(finalState, 'equalizer').parameters.bands[0].gainDb,
  };
  await writeFile(expectationPath, `${JSON.stringify(expectation, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (finalState.audio.enabled) await window.webContents.executeJavaScript('window.switchboard.setAudioEnabled(false)');
}

async function verifyRestartPersistence() {
  const expected = JSON.parse(await readFile(expectationPath, 'utf8'));
  await step('application-restart.persistence', async () => {
    const value = await snapshot();
    const actual = {
      gamePreset: value.audio.activePresetIds.game,
      gameEqGainDb: value.audio.channelProcessing.find((item) => item.busId === 'game').equalizer.bands[0].gainDb,
      chatPreset: value.audio.activePresetIds.chat,
      mediaPreset: value.audio.activePresetIds.media,
      microphonePreset: value.audio.activePresetIds.microphone,
      noiseRemoval: micProcessor(value, 'noise-suppression').parameters.amount,
      gateThresholdDb: micProcessor(value, 'noise-gate').parameters.thresholdDb,
      compressorRatio: micProcessor(value, 'compressor').parameters.ratio,
      microphoneEqGainDb: micProcessor(value, 'equalizer').parameters.bands[0].gainDb,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Persisted state mismatch: ${JSON.stringify({ expected, actual })}`);
    }
    return actual;
  });
}

async function step(name, action) {
  const evidence = await action();
  report.steps.push({ name, passed: true, evidence });
  console.log(`PASS ${name}`);
}

async function restoreMouse(values) {
  await clickSelector(`[aria-label="${values.originalDpi} DPI"]`);
  await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.dpi.activeDpi === values.originalDpi, 'DPI restore');
  await clickSelector(`[aria-label="${values.originalPollingRate} hertz"]`);
  await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.reportRate.value === values.originalPollingRate, 'polling-rate restore');
  await setDpiShift(values.originalShiftDpi);
  await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.dpi.shiftDpi === values.originalShiftDpi, 'DPI Shift restore');
  if (values.originalLightingColor) {
    if (!device(await snapshot(), 'G502 X Plus').capabilities.lighting.enabled) await clickSelector('[aria-label="Mouse lighting"]');
    const mouse = device(await snapshot(), 'G502 X Plus');
    await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'lighting-color', color: values.originalLightingColor } })})`);
    await waitSnapshot((value) => device(value, 'G502 X Plus').capabilities.lighting.color?.toUpperCase() === values.originalLightingColor.toUpperCase(), 'lighting color restore');
  }
  const currentEnabled = device(await snapshot(), 'G502 X Plus').capabilities.lighting.enabled;
  if (currentEnabled !== values.originalLightingEnabled) await clickSelector('[aria-label="Mouse lighting"]');
}

async function setDpiShift(value) {
  const mouse = device(await snapshot(), 'G502 X Plus');
  const editor = await evaluate(`({ trigger: document.querySelector('.dpi-shift-control__value')?.textContent?.trim() })`);
  if (!editor.trigger) throw new Error('DPI Shift value control was not rendered.');
  Object.assign(editor, { min: mouse.capabilities.dpi.min, max: mouse.capabilities.dpi.max, step: mouse.capabilities.dpi.step });
  await evaluate(`window.switchboard.setDeviceControl(${JSON.stringify({ deviceId: mouse.id, change: { type: 'dpi-shift', value } })})`);
  return editor;
}

async function openDevice(name) {
  await clickButtonText('Devices', 'nav[aria-label="Primary"]');
  await evaluate(`document.querySelector('.device-workbench__back')?.click()`);
  await waitForSelector('.device-gallery');
  await clickSelector(`button[aria-label*="${name}"]`);
  await waitForSelector('.device-workbench');
}

async function openAudioTab(tab) {
  await evaluate(`window.location.hash = ${JSON.stringify(`audio/${tab}`)}`);
  await waitForSelector(`#audio-panel-${tab}`);
}

async function clickButtonText(text, scope = 'body') {
  const clicked = await evaluate(`
    (() => {
      const root = document.querySelector(${JSON.stringify(scope)});
      const button = [...(root?.querySelectorAll('button') ?? [])].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(text)});
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Could not click button: ${text}.`);
}

async function clickSelector(selector) {
  await waitForSelector(selector);
  const clicked = await evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) || element.matches(':disabled')) return false;
      element.click();
      return true;
    })()
  `);
  if (!clicked) throw new Error(`Could not click ${selector}.`);
}

async function setReactInput(selector, value) {
  const focused = await evaluate(`
    (() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!(input instanceof HTMLInputElement)) return false;
      input.focus();
      input.select();
      return document.activeElement === input;
    })()
  `);
  if (!focused) throw new Error(`Could not focus ${selector}.`);
  await window.webContents.insertText(String(value));
  await delay(60);
}

async function blurSelector(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.blur()`);
  await delay(80);
}

async function pressSliderKey(selector, key) {
  const focused = await evaluate(`
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) || element.matches(':disabled')) return false;
      element.focus();
      return document.activeElement === element;
    })()
  `);
  if (!focused) throw new Error(`Could not focus ${selector}.`);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
  await delay(100);
}

async function selectorDisabled(selector) {
  return evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)})?.matches(':disabled'))`);
}

async function textContent(selector) {
  return evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
}

async function sectionText(title) {
  return evaluate(`
    [...document.querySelectorAll('.mic-setting')].find((candidate) => candidate.querySelector('h3')?.textContent?.includes(${JSON.stringify(title)}))?.textContent ?? ''
  `);
}

async function selectPreset(label) {
  await waitForEnabledSelector('.preset-picker [role="combobox"]');
  await clickSelector('.preset-picker [role="combobox"]');
  await waitForSelector('[role="option"]');
  const selected = await evaluate(`
    (() => {
      const label = ${JSON.stringify(label)};
      const option = [...document.querySelectorAll('[role="option"]')]
        .find((candidate) => candidate.textContent?.trim() === label);
      if (!option) return false;
      option.click();
      return true;
    })()
  `);
  if (!selected) throw new Error(`Preset option was not found: ${label}`);
  await waitForEnabledSelector('.preset-picker [role="combobox"]');
}

async function waitForEnabledSelector(selector, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const enabled = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      return Boolean(element && !element.matches(':disabled'));
    })()`);
    if (enabled) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for enabled selector: ${selector}.`);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidate = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed());
    if (candidate) return candidate;
    await delay(50);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForLoad() {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad, rejectLoad) => {
    const timeout = setTimeout(() => rejectLoad(new Error('Switchboard renderer did not finish loading.')), 20_000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timeout);
      resolveLoad();
    });
  });
}

async function waitForSelector(selector, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(40);
  }
  const diagnostics = await evaluate(`({
    hash: location.hash,
    text: document.body.innerText.slice(0, 1_200),
    labels: [...document.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label')).filter(Boolean).slice(0, 80),
  })`);
  throw new Error(`Timed out waiting for ${selector}. ${JSON.stringify(diagnostics)}`);
}

async function waitForEnabledButton(text, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await evaluate(`
      [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === ${JSON.stringify(text)} && !button.disabled)
    `);
    if (ready) return;
    await delay(50);
  }
  const diagnostics = await evaluate(`({
    hash: location.hash,
    text: document.body.innerText.slice(0, 800),
    buttons: [...document.querySelectorAll('button')].map((button) => ({ text: button.textContent?.trim(), disabled: button.disabled })).filter((button) => button.text)
  })`);
  throw new Error(`Timed out waiting for enabled button: ${text}. ${JSON.stringify(diagnostics)}`);
}

async function waitSnapshot(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await snapshot();
    if (predicate(value)) return value;
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function snapshot() {
  return evaluate('window.switchboard.getSnapshot()');
}

function evaluate(expression) {
  return window.webContents.executeJavaScript(expression, true);
}

function device(value, name) {
  const found = value.devices.find((candidate) => candidate.displayName === name);
  if (!found) throw new Error(`Missing fixture device: ${name}.`);
  return found;
}

function binding(value, buttonId) {
  return device(value, 'G502 X Plus').capabilities.buttonAssignments.bindings.find((candidate) => candidate.buttonId === buttonId)?.currentActionId;
}

function micProcessor(value, id) {
  const found = value.audio.micProcessors.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing microphone processor: ${id}.`);
  return found;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
