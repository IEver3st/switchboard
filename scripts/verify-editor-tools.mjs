import { execFile } from 'node:child_process';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { copyFile, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const executeFile = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedUserData = await mkdtemp(join(tmpdir(), 'switchboard-montage-qa-'));
const mediaDirectory = join(isolatedUserData, 'clips');
const menusOnly = process.env.SWITCHBOARD_EDITOR_MENUS_ONLY === '1';
const outputDirectory = join(projectRoot, 'design-qa', 'editor-tools', menusOnly ? 'menus' : 'native');
const exportDestination = join(isolatedUserData, 'Montage export.mp4');
const sourceState = process.env.APPDATA ? join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json') : null;
if (!sourceState) throw new Error('APPDATA is required for native montage verification.');
await mkdir(mediaDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
await copyFile(sourceState, join(isolatedUserData, 'switchboard-state.json'));

const downloads = join(process.env.USERPROFILE, 'Downloads');
const musicName = (await readdir(downloads)).find(name => name.toLowerCase().endsWith('.mp3'));
if (!musicName) throw new Error('The requested Downloads MP3 is unavailable. No test tone will be used.');
const requestedMusic = join(downloads, musicName);
const clips = [];
for (let index = 0; index < 5; index += 1) {
  const path = join(mediaDirectory, `montage-${index + 1}.mp4`);
  const colors = ['0x15364a', '0x3d2f52', '0x4a331f', '0x224836', '0x344462'];
  await executeFile('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=${colors[index]}:s=640x360:r=10:d=4`,
    '-stream_loop', '-1', '-i', requestedMusic, '-t', '4',
    '-shortest', '-preset', 'ultrafast', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata:s:a:0', 'title=Game', '-y', path,
  ], { windowsHide: true });
  const file = await stat(path);
  clips.push({
    id: `montage-qa-${index + 1}`,
    path,
    name: ['Opening play', 'Team follow-up', 'The chase', 'Last stand', 'Final round'][index],
    game: 'Switchboard QA',
    createdAt: Date.now() - index * 1_000,
    durationMs: 4_000,
    fileSize: file.size,
    width: 640,
    height: 360,
    fps: 10,
    codec: 'h264',
    favorite: false,
    titleEdited: true,
    canvasSize: 'original',
    audioChannels: ['game'],
  });
}

const copiedState = JSON.parse(await readFile(join(isolatedUserData, 'switchboard-state.json'), 'utf8'));
copiedState.clips = clips;
copiedState.settings.onboardingCompleted = true;
copiedState.settings.uiScalePercent = 100;
copiedState.settings.enabledWorkspaces = ['devices', 'audio', 'capture'];
copiedState.audio.enabled = false;
copiedState.capture.config.enabled = false;
copiedState.capture.config.clipsDirectory = mediaDirectory;
for (const module of copiedState.modules ?? []) if (module.id?.startsWith('device.')) module.enabled = false;
await writeFile(join(isolatedUserData, 'switchboard-state.json'), JSON.stringify(copiedState, null, 2));

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setName('switchboard-montage-qa');
app.setAppPath(projectRoot);
app.setPath('userData', isolatedUserData);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1';
process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
shell.showItemInFolder = () => undefined;
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportDestination });

const musicPath = join(isolatedUserData, 'Custom soundtrack.mp3');
await executeFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', requestedMusic, '-t', '5', '-c:a', 'copy', '-y', musicPath], { windowsHide: true });
let importMode = 'success';
dialog.showOpenDialog = async () => importMode === 'cancel' ? ({ canceled: true, filePaths: [] }) : ({ canceled: false, filePaths: [importMode === 'failure' ? join(isolatedUserData, 'missing.wav') : musicPath] });
await import('../out/main/index.js');
void app.whenReady().then(run).catch(async (error) => {
  const current = BrowserWindow.getAllWindows()[0];
  if (current && !current.isDestroyed()) {
    console.error(await evaluate(current, `({body:document.body.innerText.slice(0,2000), ready:document.readyState})`).catch(() => null));
    await capture(current,'failure.png').catch(() => {});
  }
  console.error(error);
  app.exit(1);
});


async function run() {
  const window = await waitForWindow();
  await waitForLoad(window);
  const dragCalls=[];
  window.webContents.startDrag = (item) => { dragCalls.push(item.file); };
  window.setTitle('Switchboard montage verification');
  window.setPosition(-2200, 40);
  window.webContents.setBackgroundThrottling(false);
  await waitForCondition(() => evaluate(window, `!!document.querySelector('button[aria-label="Open Opening play"]') || !document.querySelector('.startup-screen')`), 'startup', 30000);
  const errors = [];
  window.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message); });
  const project = {
    schemaVersion: 2, type: 'montage', id: '11111111-1111-4111-8111-111111111111', name: 'Friday highlights',
    createdAt: Date.now(), updatedAt: Date.now(), durationMs: 20000, canvasSize: 'original',
    segments: clips.map((clip, index) => ({ id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`, clipId: clip.id, sourceDurationMs: clip.durationMs, trimStartMs: 0, trimEndMs: clip.durationMs, volume: 1, muted: false }))
  };
  await evaluate(window, `window.switchboard.saveMontageDraft(${JSON.stringify(project)})`);
  await waitForCondition(() => evaluate(window, `[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Capture')`), 'Capture navigation', 30000);
  await clickButton(window, 'Capture');
  await waitForSelector(window, '.montage-v2-draft');
  await clickButtonStartsWith(window, 'Friday highlights');
  await waitForSelector(window, '.montage-v2-preview[data-state="ready"]');
  if (await evaluate(window, `Boolean(document.querySelector('button[aria-label="Collapse inspector"]'))`)) await clickAriaButton(window, 'Collapse inspector');
  const report = { sizes: [], checks: [], isolatedUserData };
  if (menusOnly) {
    await verifyMenus(window, report);
    report.errors = errors;
    if (errors.length) throw new Error(errors.join('\n'));
    await writeFile(join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    app.exit(0);
    return;
  }
  for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(width, height, false);
    await waitForViewport(window, { width, height });
    await delay(350);
    const state = await evaluate(window, `(() => {
      const viewport = document.querySelector('.montage-v2-timeline__viewport');
      const play = document.querySelector('.montage-v2-play').getBoundingClientRect();
      const lane = document.querySelector('.montage-v2-music-lane').getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, scroll: viewport.scrollWidth, client: viewport.clientWidth, segments: document.querySelectorAll('.montage-v2-segment').length, playBottom: play.bottom, musicBottom: lane.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
    })()`);
    if (state.scroll > state.client + 1 || state.overflow || state.musicBottom > height || state.playBottom > height) throw new Error(`Layout failure ${JSON.stringify(state)}`);
    report.sizes.push(state);
    await capture(window, `${width}x${height}-fit.png`);
  }
  await clickAriaButton(window, 'Open inspector');
  await selectValue(window, 'Playback speed', '0.5');
  await waitForCondition(() => evaluate(window, `document.querySelector('video[data-active="true"]').playbackRate === 0.5`), 'speed preview');
  await clickAriaButton(window, 'Undo');
  await waitForCondition(() => evaluate(window, `document.querySelector('[role="combobox"][aria-label="Playback speed"]').textContent.startsWith('1×')`), 'undo speed');
  await clickAriaButton(window, 'Redo');
  await waitForCondition(() => evaluate(window, `document.querySelector('[role="combobox"][aria-label="Playback speed"]').textContent.startsWith('0.5×')`), 'redo speed');
  await evaluate(window, `document.querySelector('.editor-picture summary').click()`);
  await clickAriaButton(window, 'Flip horizontally');
  await evaluate(window, `document.querySelector('[role="slider"][aria-label="Brightness"]').focus()`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'}); window.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'});
  await delay(100);
  if(!await evaluate(window, `document.querySelector('video[data-active="true"]').style.scale==='-1 1'`)) throw new Error('Flip preview failed');
  await capture(window, 'picture-tools.png');
  await evaluate(window, `document.querySelector('.editor-picture summary').click()`);
  await clickButton(window, 'Add title');
  await setInput(window, 'Title text', 'CLEAN CUT');
  await selectValue(window, 'Text position', 'center');
  await selectValue(window, 'Text size', 'small');
  await selectValue(window, 'Text position', 'bottom');
  await selectValue(window, 'Text size', 'medium');
  await clickAriaButton(window, 'Mute preview');
  await clickButton(window, 'Play');
  await delay(500);
  await clickButton(window, 'Pause');
  report.checks.push('Speed and title preview');
  for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
    window.setContentSize(width, height, false); await waitForViewport(window, { width, height }); await delay(200);
    await capture(window, `${width}x${height}-montage-tools.png`);
    if (await evaluate(window, `document.documentElement.scrollWidth > innerWidth`)) throw new Error('Montage horizontal overflow');
  }
  await clickAriaButton(window, 'Trim start one frame later');
  await delay(650);
  let drafts = await evaluate(window, `window.switchboard.listMontageDrafts()`);
  if (drafts[0].segments[0].videoEdits.brightness !== 0.01 || drafts[0].segments[0].videoEdits.flipHorizontal !== true || drafts[0].segments[0].trimStartMs !== 100 || drafts[0].segments[0].videoEdits.speed !== 0.5 || drafts[0].segments[0].videoEdits.text.content !== 'CLEAN CUT') throw new Error('Canonical segment edits missing');
  report.checks.push('Undo/redo, picture adjustment by keyboard, flip, title size/placement, frame trim and canonical autosave');
  await clickButton(window, 'Add music');
  await waitForSelector(window, '.editor-music-waveform svg');
  await setInput(window, 'Source in', '1.250');
  await setInput(window, 'Source out', '3.750');
  await delay(700);
  drafts = await evaluate(window, `window.switchboard.listMontageDrafts()`);
  if (drafts[0].music.sourceStartMs !== 1250 || drafts[0].music.sourceEndMs !== 3750) throw new Error('Music trim not saved');
  await capture(window, 'music-trimming.png');
  report.checks.push('Music source trimming and real waveform');
  await evaluate(window, `window.__exportProgress=[]; window.switchboard.subscribeClipExportProgress(p => window.__exportProgress.push(p)); void 0;`);
  await clickButton(window, 'Share');
  await waitForSelector(window, '.editor-size-options');
  await capture(window, 'montage-export-presets.png');
  await clickButton(window, 'Choose destination');
  await waitForSelector(window, '[data-share-state="ready"]', 60000);
  const share = await evaluate(window, `({draggable:!!document.querySelector('[data-share-state="ready"] [draggable="true"]'), progress:window.__exportProgress})`);
  if (!share.draggable || !share.progress.some(p => p.percent > 0 && p.percent < 99)) throw new Error('Share drag or progress missing');
  await capture(window, 'montage-export-ready.png');
  await evaluate(window, `document.querySelector('[data-share-state="ready"] [draggable="true"]').dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()})); void 0;`);
  await waitForCondition(async()=>dragCalls.length>0,'native drag request');
  if(dragCalls[0]!==exportDestination || !(await stat(dragCalls[0])).isFile()) throw new Error('Native drag did not receive the exported file');
  report.nativeDragValidated=true;
  report.checks.push('Actual montage render, progress and draggable prepared file');
  report.exportProbe = JSON.parse((await executeFile('ffprobe', ['-v','error','-show_entries','format=duration,size:stream=codec_type','-of','json',exportDestination], {windowsHide:true})).stdout);
  await clickButton(window, 'Done');
  await clickButton(window, 'Back to clips');
  await delay(200);
  await evaluate(window, `(() => { const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.includes('Opening play')); if(!b) throw Error('No clip edit button'); b.click(); })()`);
  await waitForSelector(window, '[data-testid="clip-editor"]');
  if (await evaluate(window, `!!document.querySelector('button[aria-label="Open Inspector"]')`)) await clickAriaButton(window, 'Open Inspector');
  await selectValue(window, 'Playback speed', '2');
  await clickButton(window, 'Add title');
  await setInput(window, 'Title text', 'CLIP TITLE');
  await clickAriaButton(window, 'Trim end one frame earlier');
  await clickButton(window, 'Music');
  await clickButton(window, 'Add music');
  await waitForSelector(window, '.editor-clip-music .editor-music-waveform svg');
  await setInput(window, 'Music source in', '1.100');
  await setInput(window, 'Music source out', '3.300');
  await capture(window, 'clip-music-trimming.png');
  await clickButton(window, 'Save edits');
  await delay(400);
  await clickButton(window, 'Edit clip');
  const snapshot = await evaluate(window, `window.switchboard.getSnapshot()`);
  report.clipSaved = snapshot.clips.find(c => c.id === 'montage-qa-1');
  if (report.clipSaved.music?.sourceStartMs !== 1100 || report.clipSaved.music?.sourceEndMs !== 3300 || report.clipSaved.videoEdits?.speed !== 2 || report.clipSaved.videoEdits?.text?.content !== 'CLIP TITLE') throw new Error('Clip edits missing in snapshot');
  for (const [width, height] of [[1080,720],[1420,900],[1920,1080]]) {
    window.setContentSize(width,height,false); await waitForViewport(window,{width,height}); await delay(200);
    await capture(window, `${width}x${height}-clip-tools.png`);
    if(await evaluate(window, `document.documentElement.scrollWidth > innerWidth`)) throw new Error('Clip overflow');
  }
  await clickButton(window, 'Share'); await clickButton(window, 'Prepare clip');
  await waitForSelector(window, '[data-share-state="ready"]',60000);
  await capture(window, 'clip-export-ready.png');
  report.checks.push('Clip speed, title, trim, save and actual prepared share');
  await clickButton(window, 'Done');
  await clickButton(window, 'Back to clips');
  await clickAriaButton(window, 'Open Opening play');
  await waitForSelector(window, '[data-testid="clip-editor"]');
  if (await evaluate(window, `!document.querySelector('[role="combobox"][aria-label="Playback speed"]').textContent.startsWith('2×')`)) throw new Error('Reopened clip lost speed');
  await clickButton(window, 'Music');
  if (await evaluate(window, `document.querySelector('[aria-label="Music source in"]').value !== '1.100'`)) throw new Error('Reopened clip lost music trim');
  report.checks.push('Reopened canonical clip music and edits');
  await clickButton(window, 'Back to clips');
  window.webContents.reload();
  await waitForLoad(window);
  await waitForCondition(() => evaluate(window, `!!document.querySelector('button[aria-label="Open Opening play"]') || !document.querySelector('.startup-screen')`), 'reloaded startup', 30000);
  await clickButton(window, 'Capture');
  await waitForSelector(window, '.montage-v2-draft');
  await clickButtonStartsWith(window, 'Friday highlights');
  await waitForSelector(window, '.montage-v2-preview[data-state="ready"]');
  const reopened=await evaluate(window, `window.switchboard.listMontageDrafts()`);
  if(reopened[0].segments[0].videoEdits.text.content!=='CLEAN CUT' || reopened[0].music.sourceStartMs!==1250) throw new Error('Draft did not survive reload');
  report.checks.push('Montage reload with title, speed and music');
  await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const reduced = await evaluate(window, `matchMedia('(prefers-reduced-motion: reduce)').matches`);
  report.reducedMotion=reduced;
  await window.webContents.debugger.detach();
  window.setContentSize(1080,720,false); await waitForViewport(window,{width:1080,height:720});
  await clickButton(window, 'Share');
  await evaluate(window, `document.querySelectorAll('.editor-size-options button')[4].click()`);
  await evaluate(window, `(() => {const el=document.querySelector('.editor-custom-size input'); el.focus(); el.select();})()`);
  await window.webContents.insertText('0');
  await delay(100);
  if (!await evaluate(window, `document.querySelector('[data-share-clip-dialog] [role="alert"]') !== null`)) throw new Error('Invalid size did not produce validation feedback');
  await capture(window, '1080x720-invalid-size.png');
  await evaluate(window, `(() => {const el=document.querySelector('.editor-custom-size input'); el.focus(); el.select();})()`);
  await window.webContents.insertText('20'); await delay(100);
  if(!await evaluate(window, `document.querySelector('[data-share-clip-dialog] footer strong').textContent.includes('20 MB')`)) throw new Error('Custom output summary disagrees with size target');
  await capture(window, '1080x720-custom-export.png');
  await evaluate(window, `window.__cancelled=false; window.switchboard.subscribeClipExportProgress(p => { if(!window.__cancelled && p.percent>0) {window.__cancelled=true; window.switchboard.cancelMontageV2Export(p.exportId);} }); void 0;`);
  await clickButton(window, 'Choose destination');
  await waitForCondition(() => evaluate(window, `window.__cancelled && document.querySelector('[data-share-state="idle"]')!==null`), 'export cancellation',30000);
  if((await stat(exportDestination)).size !== Number(report.exportProbe.format.size)) throw new Error('Cancellation changed the existing export');
  report.checks.push('Custom sizes, invalid input, reduced motion and mid-export cancellation preserving existing output');
  report.errors=errors;
  await writeFile(join(outputDirectory,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  app.exit(0);
}

async function verifyMenus(window, report) {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const draft = async () => { await delay(650); return (await evaluate(window, 'window.switchboard.listMontageDrafts()'))[0]; };
  const openMenu = async (selector, ratio = 0.5) => {
    const r = await rect(window, selector);
    const x = Math.round(r.x + r.width * ratio), y = Math.round(r.y + r.height / 2);
    window.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'right', clickCount: 1 });
    window.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'right', clickCount: 1 });
    await waitForSelector(window, '[role="menu"]');
    return { x, y, r };
  };
  const action = async (label) => {
    const item = await evaluate(window, `(() => { const el = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === ${JSON.stringify(label)}); if (!el || el.hasAttribute('data-disabled')) throw Error('Unavailable menu action'); const r=el.getBoundingClientRect(); return {x:r.x+10,y:r.y+r.height/2}; })()`);
    await nativeClick(window, item.x, item.y);
    await waitForMissingSelector(window, '[role="menu"]');
  };
  const verifyPopup = async (role) => {
    const r = await rect(window, `[role="${role}"]`);
    const size = await evaluate(window, '({w:innerWidth,h:innerHeight})');
    assert(r.x >= 0 && r.y >= 0 && r.x + r.width <= size.w + 1 && r.y + r.height <= size.h + 1, 'Popup clipped outside window');
    await verifyNoHorizontalOverflow(window, role);
  };
  await clickAriaButton(window, 'Open inspector');
  await selectValue(window, 'Playback speed', '0.5');
  await clickButton(window, 'Add title');
  await selectValue(window, 'Text position', 'center');
  await selectValue(window, 'Text size', 'large');
  await selectValue(window, 'Montage canvas', '9:16');
  assert((await draft()).canvasSize === '9:16', 'Canvas selection did not persist');
  await selectValue(window, 'Montage canvas', 'original');
  for (const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
    window.setContentSize(width,height,false); await waitForViewport(window,{width,height}); await delay(200);
    await evaluate(window, `document.querySelector('[aria-label="Playback speed"]').focus()`);
    await key(window,'Return'); await waitForSelector(window,'[role="listbox"]');
    await verifyPopup('listbox'); await capture(window,`${width}x${height}-speed-menu.png`);
    await key(window,'Escape');
    await waitForMissingSelector(window,'[role="listbox"]');
    assert(await evaluate(window, `document.activeElement.getAttribute('aria-label')==='Playback speed'`), 'Select focus did not return');
    await openMenu('.montage-v2-segment-slot:last-child');
    await verifyPopup('menu'); await capture(window,`${width}x${height}-timeline-menu.png`);
    await key(window,'Escape'); await waitForMissingSelector(window,'[role="menu"]');
    assert(await evaluate(window, `!!document.querySelector('.montage-v2-shell')`), 'Escape closed editor');
    report.sizes.push({width,height,menusContained:true});
  }
  // Clicked point must win over the playhead and the previously selected segment.
  await openMenu('.montage-v2-segment-slot:first-child');
  await action('Trim start to here');
  let saved = await draft();
  assert(saved.segments[0].trimStartMs === 2000 && saved.segments[0].videoEdits.speed === 0.5, 'Speed-aware trim used the wrong source position');
  await clickAriaButton(window,'Undo');
  assert((await draft()).segments[0].trimStartMs === 0, 'Menu trim could not be undone');
  await openMenu('.montage-v2-segment-slot:nth-child(2)');
  await action('Split here');
  saved=await draft();
  assert(saved.segments.length===6 && saved.segments[1].trimEndMs===2000 && saved.segments[2].trimStartMs===2000, 'Split targeted the wrong clip or time');
  await clickAriaButton(window,'Undo');
  await openMenu('.montage-v2-segment-slot:nth-child(2)'); await action('Duplicate segment');
  assert((await draft()).segments.length===6,'Duplicate failed');
  await clickAriaButton(window,'Undo');
  await openMenu('.montage-v2-segment-slot:nth-child(2)'); await action('Remove segment');
  assert((await draft()).segments.length===4,'Remove failed');
  await clickAriaButton(window,'Undo');
  await openMenu('.montage-v2-segment-slot:nth-child(2)',0); 
  assert(await evaluate(window, `[...document.querySelectorAll('[role="menuitem"]')].find(el=>el.textContent==='Split here').hasAttribute('data-disabled')`),'Split at boundary should be disabled');
  await key(window,'Escape');
  await clickAriaButton(window,'Zoom in'); await clickAriaButton(window,'Zoom in');
  await evaluate(window, `document.querySelector('.montage-v2-timeline__viewport').scrollLeft=200`);
  const zoomPoint=await openMenu('.montage-v2-segment-slot:nth-child(2)'); await action('Trim end to here');
  assert((await draft()).segments[1].trimEndMs===2000,'Zoomed/scrolled context position is incorrect');
  await clickAriaButton(window,'Undo'); await clickButton(window,'Fit');
  await clickButton(window,'Add music'); await waitForSelector(window,'.montage-v2-music-clip');
  await openMenu('.montage-v2-music-clip'); await action('Mute music');
  assert((await draft()).music.muted===true,'Music mute did not persist');
  await openMenu('.montage-v2-music-clip'); await action('Remove music');
  assert(!(await draft()).music,'Music removal did not persist');
  await clickAriaButton(window,'Undo');
  // Native keyboard context-menu invocation uses the focused timeline playhead.
  await evaluate(window, `document.querySelector('[aria-label="Montage playhead"]').focus()`);
  await key(window,'F10',['shift']); await waitForSelector(window,'[role="menu"]');
  await key(window,'Escape');
  report.checks.push('Custom speed/text/canvas menus with native keyboard selection and focus return', 'Clicked-position trims, speed conversion, split, duplicate, remove, undo, boundary disabling and zoom/scroll', 'Music lane mute/remove and undo; keyboard context menu');
  await clickButton(window,'Back to clips');
  await waitForMissingSelector(window,'.montage-v2-shell');
  await clickAriaButton(window,'Open Opening play'); await waitForSelector(window,'[data-testid="clip-editor"]');
  if(await evaluate(window, `!!document.querySelector('[aria-label="Open Inspector"]')`)) await clickAriaButton(window,'Open Inspector');
  await selectValue(window,'Playback speed','2');
  for(const [width,height] of [[1080,720],[1420,900],[1920,1080]]) {
    window.setContentSize(width,height,false); await waitForViewport(window,{width,height}); await delay(150);
    await openMenu('.clip-editor-timeline__clip-track'); await verifyPopup('menu');
    await capture(window,`${width}x${height}-clip-menu.png`); await key(window,'Escape');
  }
  await openMenu('.clip-editor-timeline__clip-track',0.25); await action('Trim start to here');
  await openMenu('.clip-editor-timeline__clip-track',0.75); await action('Trim end to here');
  await waitForSelector(window,'[data-timeline-track="0"]');
  await openMenu('[data-timeline-track="0"]',0.5); await action('Trim start to here');
  await clickButton(window,'Save edits'); await delay(400);
  const clip=(await evaluate(window,'window.switchboard.getSnapshot()')).clips.find(clip=>clip.id==='montage-qa-1');
  assert(clip.trimStartMs===1000 && clip.trimEndMs===3000,'Single clip menu trim did not save');
  assert(clip.audioTrackTrims[0].startMs===2000,'Audio lane trim did not save independently');
  await clickButton(window,'Back to clips'); await clickAriaButton(window,'Open Opening play'); await waitForSelector(window,'[data-testid="clip-editor"]');
  assert(await evaluate(window, `document.querySelector('[aria-label="Trim start"][type="number"]').value==='1.000'`),'Clip trim lost on reopening');
  await evaluate(window, `document.querySelector('[data-testid="clip-timeline-scrub-target"]').focus()`);
  await key(window,'F10',['shift']); await waitForSelector(window,'[role="menu"]');
  await action('Reset trim'); await clickButton(window,'Save edits'); await delay(400);
  assert((await evaluate(window,'window.switchboard.getSnapshot()')).clips.find(clip=>clip.id==='montage-qa-1').trimStartMs===0,'Reset trim did not save');
  await window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await openMenu('.clip-editor-timeline__clip-track'); await capture(window,'reduced-motion-menu.png'); await key(window,'Escape');
  window.webContents.debugger.detach();
  report.checks.push('Single clip and independent audio-lane trimming, save/reopen/reset, keyboard invocation, reduced motion');
}

async function selectValue(window, label, value) {
  const options = label === 'Playback speed' ? ['0.25','0.5','0.75','1','1.25','1.5','2','3','4'] : label === 'Text position' ? ['top','center','bottom'] : label === 'Text size' ? ['small','medium','large'] : ['original','9:16'];
  await evaluate(window, `document.querySelector('[role="combobox"][aria-label="${label}"]').focus()`);
  await key(window, 'Return');
  await waitForSelector(window, '[role="listbox"]');
  await key(window, 'Home');
  for (let index=0; index<options.indexOf(value); index++) await key(window, 'Down');
  await key(window, 'Return');
  await waitForMissingSelector(window, '[role="listbox"]');
}
async function key(window, keyCode, modifiers = []) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  await delay(70);
}
async function setInput(window, label, value) {
  await evaluate(window, `(() => {const el=document.querySelector('[aria-label="${label}"]'); if(!el) throw Error('Missing ${label}'); el.focus(); el.select(); })()`);
  await window.webContents.insertText(value);
  await delay(100);
  await evaluate(window, `document.querySelector('[aria-label="${label}"]').blur()`);
  await delay(100);
}

async function verifyNoHorizontalOverflow(window, label) {
  const value = await evaluate(window, `({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })`);
  if (value.scrollWidth !== value.clientWidth) throw new Error(`Horizontal overflow in ${label}: ${JSON.stringify(value)}`);
}

async function capture(window, name) {
  await delay(240);
  for (let attempt=0; attempt<3; attempt++) {
    try { await writeFile(join(outputDirectory, name), (await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG()); return; }
    catch(error) { if(attempt===2) throw new Error('Capture '+name+': '+error.message); await delay(200); }
  }
}

async function clickButton(window, label) {
  const clicked = await evaluate(window, `(() => { const button = [...document.querySelectorAll('button')].find((value) => value.textContent?.trim() === ${JSON.stringify(label)} && !value.disabled); button?.click(); return Boolean(button); })()`);
  if (!clicked) throw new Error(`Could not click ${label}.`);
}

async function clickButtonStartsWith(window, label) {
  const clicked = await evaluate(window, `(() => { const button = [...document.querySelectorAll('button')].find((value) => value.textContent?.trim().startsWith(${JSON.stringify(label)}) && !value.disabled); button?.click(); return Boolean(button); })()`);
  if (!clicked) throw new Error(`Could not click ${label}.`);
}

async function clickAriaButton(window, label) {
  const clicked = await evaluate(window, `(() => { const button = document.querySelector('button[aria-label=${JSON.stringify(label)}]'); button?.click(); return Boolean(button); })()`);
  if (!clicked) throw new Error(`Could not click button labelled ${label}.`);
}

async function rect(window, selector) {
  const value = await evaluate(window, `(() => { const rect = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null; })()`);
  if (!value) throw new Error(`Missing geometry for ${selector}.`);
  return value;
}

async function nativeClick(window, x, y) {
  window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
  window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 });
  await delay(160);
}

async function waitForWindow() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (window) return window;
    await delay(50);
  }
  throw new Error('Switchboard did not create its main window.');
}

async function waitForLoad(window) {
  if (window.webContents.getURL() && !window.webContents.isLoading()) return;
  await new Promise((resolveLoad, reject) => {
    const timeout = setTimeout(() => reject(new Error('Switchboard renderer did not load.')), 20_000);
    window.webContents.once('did-finish-load', () => { clearTimeout(timeout); resolveLoad(); });
  });
}

async function waitForSelector(window, selector, timeout = 10000) {
  await waitForCondition(() => evaluate(window, `Boolean(document.querySelector(${JSON.stringify(selector)}))`), selector, timeout);
}

async function waitForMissingSelector(window, selector) {
  await waitForCondition(() => evaluate(window, `!document.querySelector(${JSON.stringify(selector)})`), `${selector} to close`);
}

async function waitForCondition(predicate, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForViewport(window, viewport) {
  await waitForCondition(async () => {
    const size = await evaluate(window, `({ width: innerWidth, height: innerHeight })`);
    return size.width === viewport.width && Math.abs(size.height - viewport.height) <= 2;
  }, `${viewport.width}x${viewport.height} viewport`);
}

function evaluate(window, expression) {
  return window.webContents.executeJavaScript(expression, true).catch(error => { throw new Error('Native QA expression failed: ' + expression.slice(0,350) + '\n' + error.message); });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function setField(window, label, value) {
  await evaluate(window, `(() => {
    const field = [...document.querySelectorAll('label')].find(el => el.querySelector('span')?.textContent === ${JSON.stringify(label)})?.querySelector('input');
    if (!field) throw new Error('Field missing: ' + ${JSON.stringify(label)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await delay(100);
}
