import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userData = await mkdtemp(join(tmpdir(), 'switchboard-onboarding-review-'));
const outputDirectory = await mkdtemp(join(tmpdir(), 'switchboard-onboarding-captures-'));

app.setName('switchboard-onboarding-review');
app.setAppPath(projectRoot);
app.setPath('userData', userData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';

await import('../out/main/index.js');

void app.whenReady().then(run).catch((error) => {
  console.error(error);
  app.exit(1);
});

async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  await waitFor(window, `!document.querySelector('.startup-screen')`, 'startup');
  await window.webContents.executeJavaScript(`window.switchboard.updateSettings({ uiScalePercent: 100, developerMode: true })`);
  window.show();
  window.focus();
  window.webContents.focus();
  await mkdir(outputDirectory, { recursive: true });

  const captures = [];
  for (const viewport of [
    { width: 1080, height: 720 },
    { width: 1420, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    for (const step of [0, 1, 2, 3, 4]) {
      if (window.isMaximized()) window.unmaximize();
      window.setContentSize(viewport.width, viewport.height, false);
      await waitForViewport(window, viewport);
      await waitFor(window, `Boolean(document.querySelector('.onboarding-screen'))`, 'onboarding');
      await navigateToStep(window, step);
      if (step === 1) {
        await click(window, 'Full setup');
      }
      await delay(700);
      // Native window restoration can race a settings snapshot. Reassert after navigation.
      if (window.isMaximized()) window.unmaximize();
      window.setContentSize(viewport.width, viewport.height, false);
      await waitForViewport(window, viewport);
      await delay(300);
      await waitForViewport(window, viewport);
      await window.webContents.executeJavaScript(`document.getAnimations().forEach((animation) => {
        try { animation.finish(); } catch {}
      })`);
      await delay(80);
      const metrics = await window.webContents.executeJavaScript(`(() => {
        const main = document.querySelector('.onboarding-main');
        const stage = document.querySelector('.onboarding-stage[data-step-index]');
        const rect = stage?.getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          current: stage?.querySelector('h2')?.textContent?.trim(),
          documentOverflowX: document.documentElement.scrollWidth > innerWidth,
          mainOverflowX: main ? main.scrollWidth > main.clientWidth : null,
          mainScrollHeight: main?.scrollHeight ?? null,
          mainClientHeight: main?.clientHeight ?? null,
          activeAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
          stage: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          focused: document.activeElement?.textContent?.trim().slice(0, 60) ?? null,
        };
      })()`);
      if (metrics.width !== viewport.width || Math.abs(metrics.height - viewport.height) > 2) {
        throw new Error(`Viewport changed before capture: ${JSON.stringify(metrics)}`);
      }
      if (metrics.documentOverflowX || metrics.mainOverflowX || metrics.mainScrollHeight > metrics.mainClientHeight + 1) {
        throw new Error(`Onboarding overflow: ${JSON.stringify(metrics)}`);
      }
      const filename = `${viewport.width}x${viewport.height}-step-${step + 1}.png`;
      const image = await window.webContents.capturePage();
      await writeFile(join(outputDirectory, filename), image.toPNG());
      captures.push({ viewport, step: step + 1, filename, metrics });
    }
  }

  if (window.isMaximized()) window.unmaximize();
  window.setContentSize(1080, 720, false);
  await waitForViewport(window, { width: 1080, height: 720 });
  await navigateToStep(window, 1);
  await delay(700);
  const transitionFrames = [];
  await click(window, 'Continue');
  let elapsed = 0;
  for (const timestamp of [0, 50, 100, 180, 280, 420]) {
    await delay(timestamp - elapsed);
    elapsed = timestamp;
    const filename = `motion-step-2-to-3-${String(timestamp).padStart(3, '0')}ms.png`;
    const image = await window.webContents.capturePage();
    await writeFile(join(outputDirectory, filename), image.toPNG());
    transitionFrames.push(filename);
  }
  await waitForCurrentStep(window, 2);

  let reducedMotion = null;
  try {
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await waitFor(window, `matchMedia('(prefers-reduced-motion: reduce)').matches`, 'reduced motion emulation');
    await delay(80);
    await navigateToStep(window, 1);
    await delay(30);
    reducedMotion = await window.webContents.executeJavaScript(`({
      matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
      animations: document.getAnimations()
        .filter((animation) => animation.playState === 'running')
        .map((animation) => ({
          target: animation.effect?.target?.className ?? animation.effect?.target?.tagName ?? null,
          duration: animation.effect?.getTiming?.().duration ?? null,
          currentTime: animation.currentTime,
        })),
      current: document.querySelector('.onboarding-stage h2')?.textContent?.trim(),
    })`);
    await delay(300);
    reducedMotion.settledRunningAnimations = await window.webContents.executeJavaScript(
      `document.getAnimations().filter((animation) => animation.playState === 'running').length`,
    );
  } finally {
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
  }

  if (reducedMotion.runningAnimations !== 0 || reducedMotion.settledRunningAnimations !== 0) {
    throw new Error(`Reduced motion left active animations: ${JSON.stringify(reducedMotion)}`);
  }

  await keyboardClick(window, 'Back');
  await waitForCurrentStep(window, 0);
  await keyboardClick(window, 'Get started');
  await waitForCurrentStep(window, 1);
  await click(window, 'Just clipping');
  await click(window, 'Continue');
  await waitForCurrentStep(window, 2);
  const saved = await window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
  if (saved.settings.visibleWorkspaces.join(',') !== 'capture') throw new Error('Workspace choice was not persisted.');
  await navigateToStep(window, 4);
  await click(window, 'Open Capture');
  await waitFor(window, `!document.querySelector('.onboarding-screen')`, 'completion');
  const reloaded = new Promise((resolveReload) => window.webContents.once('did-finish-load', resolveReload));
  window.reload();
  await reloaded;
  window.show();
  window.focus();
  window.webContents.focus();
  await waitFor(window, `!document.querySelector('.startup-screen') && Boolean(document.querySelector('main'))`, 'reload');
  const persisted = await window.webContents.executeJavaScript('window.switchboard.getSnapshot()');
  if (!persisted.settings.onboardingCompleted || persisted.settings.visibleWorkspaces.join(',') !== 'capture') {
    throw new Error('Onboarding settings did not survive reload.');
  }

  // Failure injection only in this isolated review process, after real persistence checks.
  await window.webContents.executeJavaScript('window.switchboard.updateSettings({ onboardingCompleted: false })');
  await waitForCurrentStep(window, 0);
  await click(window, 'Get started');
  await waitForCurrentStep(window, 1);
  await delay(350);
  ipcMain.removeHandler('settings:update');
  ipcMain.handle('settings:update', async () => {
    await delay(800);
    throw new Error('Review fixture: settings could not be saved. Please try again.');
  });
  await click(window, 'Continue');
  await waitFor(window, `document.querySelector('.onboarding-stage')?.getAttribute('aria-busy') === 'true'`, 'pending');
  await delay(150);
  await writeFile(join(outputDirectory, '1080x720-pending.png'), (await window.webContents.capturePage()).toPNG());
  await waitFor(window, `Boolean(document.querySelector('.onboarding-error'))`, 'save failure');
  await delay(250);
  await writeFile(join(outputDirectory, '1080x720-error.png'), (await window.webContents.capturePage()).toPNG());
  const failure = await window.webContents.executeJavaScript(`({
    step: document.querySelector('.onboarding-stage')?.getAttribute('data-step-index'),
    busy: document.querySelector('.onboarding-stage')?.getAttribute('aria-busy'),
    error: document.querySelector('.onboarding-error')?.textContent,
    overflow: document.documentElement.scrollWidth > innerWidth,
  })`);
  if (failure.step !== '1' || failure.busy !== 'false' || failure.overflow) throw new Error('Save failure recovery was incorrect.');
  console.log(JSON.stringify({ outputDirectory, captures, transitionFrames, reducedMotion,
    interaction: { keyboardBackAndStart: true, persistedAfterReload: true, failure } }, null, 2));
  app.quit();
}

async function keyboardClick(window, label) {
  window.focus();
  window.webContents.focus();
  await delay(80);
  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === ${JSON.stringify(label)})?.focus();
  `);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  window.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
}

async function click(window, label) {
  await waitFor(
    window,
    `[...document.querySelectorAll('button')].some((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)})`,
    `${label} button`,
  );
  const clicked = await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
    button?.click();
    return Boolean(button);
  })()`);
  if (!clicked) throw new Error(`Could not click ${label}`);
}

async function navigateToStep(window, target) {
  let current = Number(await window.webContents.executeJavaScript(`document.querySelector('section[data-step-index]')?.getAttribute('data-step-index')`));
  if (current > target) {
    const title = ['Welcome', 'Choose your setup', 'Set up capture', 'Set up audio tracks', 'Review and finish'][target];
    await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(`button[aria-label="${title}, completed. Activate to revise."]`)})?.click()`);
    await waitForCurrentStep(window, target);
    current = target;
  }
  while (current < target) {
    await click(window, current === 0 ? 'Get started' : 'Continue');
    current += 1;
    await waitForCurrentStep(window, current);
  }
}

async function waitForCurrentStep(window, index) {
  const title = ['Welcome', 'Choose your setup', 'Set up capture', 'Set up audio tracks', 'Review and finish'][index];
  await waitFor(window, `document.querySelector('.onboarding-stage h2')?.textContent?.trim() === ${JSON.stringify(title)}`, title);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await delay(50);
  }
  throw new Error('window timed out');
}

async function waitForLoad(window) {
  if (!window.webContents.isLoading()) return;
  await new Promise((resolveLoad) => window.webContents.once('did-finish-load', resolveLoad));
}

async function waitForViewport(window, viewport) {
  await waitFor(window, `innerWidth === ${viewport.width} && Math.abs(innerHeight - ${viewport.height}) <= 2`, `${viewport.width}x${viewport.height}`);
}

async function waitFor(window, expression, label) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await delay(40);
  }
  const diagnostic = await window.webContents.executeJavaScript(`({
    url: location.href,
    ready: document.readyState,
    text: document.body.innerText.slice(0, 1500),
  })`);
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(diagnostic)}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
