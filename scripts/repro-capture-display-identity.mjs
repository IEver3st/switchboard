import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app, desktopCapturer, screen } from 'electron';

const workspace = mkdtempSync(join(tmpdir(), 'switchboard-display-identity-'));
app.setPath('userData', join(workspace, 'user-data'));
const reportPath = process.env.SWITCHBOARD_REPRO_OUTPUT;
const reportProgress = (phase) => {
  if (reportPath) writeFileSync(reportPath, JSON.stringify({ phase }, null, 2));
};

reportProgress('waiting-for-electron-ready');
void app.whenReady().then(run).catch((error) => {
  reportProgress(`failed: ${error instanceof Error ? error.message : String(error)}`);
  app.exit(1);
});

async function run() {
 try {
  reportProgress('listing-electron-displays');
  const ffmpeg = process.env.SWITCHBOARD_FFMPEG
    ?? execFileSync('where.exe', ['ffmpeg.exe'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  const nativeSources = (await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 320, height: 180 },
  })).filter((source) => source.id.startsWith('screen:'));
  reportProgress('captured-electron-thumbnails');
  const primary = screen.getPrimaryDisplay();
  const indexedDisplays = [
    primary,
    ...screen.getAllDisplays().filter((display) => display.id !== primary.id),
  ];

  for (const [index, display] of indexedDisplays.entries()) {
    const source = nativeSources.find((candidate) => candidate.display_id === String(display.id));
    if (!source) throw new Error(`Electron source for display id ${display.id} was not found.`);
    writeFileSync(join(workspace, `electron-${index}.png`), source.thumbnail.toPNG());
  }

  const statePath = join(process.env.APPDATA, 'switchboard-prototype', 'switchboard-state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const selectedDisplayIndex = state.capture?.config?.displayIndex;
  const latestClip = state.clips?.[0];
  if (!Number.isInteger(selectedDisplayIndex)) throw new Error('Persisted capture display index was not found.');
  if (!latestClip?.thumbnailPath) throw new Error('The latest saved clip has no thumbnail to compare.');

  const scores = [];
  for (const electronIndex of indexedDisplays.keys()) {
    const result = spawnSync(ffmpeg, [
      '-hide_banner', '-i', join(workspace, `electron-${electronIndex}.png`),
      '-i', latestClip.thumbnailPath,
      '-filter_complex', '[1:v]scale=320:180[clip];[0:v][clip]ssim', '-f', 'null', '-',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const stderr = String(result.stderr ?? '');
    if (result.status !== 0) throw new Error(stderr || `FFmpeg SSIM exited with ${result.status}.`);
    const match = stderr.match(/All:([0-9.]+)/);
    if (!match) throw new Error(`Could not read SSIM for Electron display ${electronIndex}.`);
    scores.push({ electronIndex, ssim: Number(match[1]) });
  }

  scores.sort((left, right) => right.ssim - left.ssim);
  const report = JSON.stringify({
    selectedDisplayIndex,
    latestClip: { path: latestClip.path, thumbnailPath: latestClip.thumbnailPath },
    bestMatchingDisplayIndex: scores[0].electronIndex,
    scores,
    displays: indexedDisplays.map((display, index) => ({ index, id: display.id, label: display.label, bounds: display.bounds })),
    mismatch: selectedDisplayIndex !== scores[0].electronIndex,
  }, null, 2);
  if (reportPath) {
    writeFileSync(reportPath, report);
  }
  console.log(report);
  if (selectedDisplayIndex !== scores[0].electronIndex) process.exitCode = 1;
  } finally {
    app.quit();
    rmSync(workspace, { recursive: true, force: true });
  }
}
