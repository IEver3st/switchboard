import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { mkdir, mkdtemp, readFile, writeFile, stat, copyFile, rename, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('.'), output = join(root, 'design-qa/clip-editor-upgrades/native');
const profile = await mkdtemp(join(tmpdir(), 'switchboard-clip-upgrades-'));
await mkdir(output, { recursive: true });
const media = join(profile, 'clips'); await mkdir(media);
const source = join(root, 'design-qa/clip-editor-upgrades/render/fixture.mp4');
const clipPath = join(media, 'editor-fixture.mp4'); await copyFile(source, clipPath);
const state = JSON.parse(await readFile(join(process.env.APPDATA, 'Switchboard Dev', 'switchboard-state.json'), 'utf8'));
const clip = { id: 'clip-upgrades-qa', path: clipPath, name: 'Editor verification fixture', game: 'Generated test media', createdAt: Date.now(), durationMs: 5000, fileSize: (await stat(clipPath)).size, width: 640, height: 360, fps: 30, codec: 'h264', favorite: false, titleEdited: true, canvasSize: 'original', audioChannels: ['game', 'microphone'] };
state.clips = [clip]; state.settings.onboardingCompleted = true; state.settings.uiScalePercent = 100; state.settings.enabledWorkspaces = ['devices', 'audio', 'capture']; state.settings.clipEditorInspectorOpen = true;
state.audio.enabled = false; state.capture.config.enabled = false; state.capture.config.clipsDirectory = media;
for (const module of state.modules ?? []) if (module.id?.startsWith('device.')) module.enabled = false;
await writeFile(join(profile, 'switchboard-state.json'), JSON.stringify(state));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.setName('switchboard-clip-upgrades-qa'); app.setAppPath(root); app.setPath('userData', profile);
process.env.SWITCHBOARD_NATIVE_REVIEW = '1'; process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN = '1'; process.env.SWITCHBOARD_NATIVE_FIXTURES = '1';
app.on('browser-window-created', (_event, window) => { window.setBounds({ x: -20000, y: -20000, width: 1420, height: 900 }); window.webContents.setAudioMuted(true); window.webContents.setBackgroundThrottling(false); });
shell.showItemInFolder = () => undefined;
dialog.showSaveDialog = async () => ({ canceled: false, filePath: join(profile, 'export.mp4') });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(root, 'design-qa/clip-editor-upgrades/render/music.wav')] });
const report = { profile, screenshots: [], checks: [], errors: [] };
let window;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = expression => window.webContents.executeJavaScript(expression, true);
async function waitFor(test, label, timeout = 15000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await test()) return; await delay(80); } throw Error(`Timed out: ${label}`); }
async function viewport(width,height) { window.setMinimumSize(1,1); window.setContentSize(width,height); const [ow,oh]=window.getSize(); const [cw,ch]=window.getContentSize(); window.setSize(ow+width-cw,oh+height-ch); await waitFor(()=>evaluate(`innerWidth===${width}&&innerHeight===${height}`),'exact viewport'); }
const selector = value => waitFor(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(value)}))`), value);
const textButton = text => evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(text)}&&!item.disabled); if(!button) throw Error('Missing button '+${JSON.stringify(text)}); button.click(); })()`);
const ariaButton = label => evaluate(`(() => { const button=document.querySelector('button[aria-label=${JSON.stringify(label)}]'); if(!button) throw Error('Missing '+${JSON.stringify(label)}); button.click(); })()`);
async function setInput(label, value) { await evaluate(`(() => {const input=document.querySelector('input[aria-label=${JSON.stringify(label)}]'); if(!input) throw Error('Missing input '+${JSON.stringify(label)}); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,${JSON.stringify(String(value))}); input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); })()`); await delay(120); }
async function choose(label, text) {
  const rect = await evaluate(`(() => {const node=document.querySelector('[aria-label=${JSON.stringify(label)}]'); if(!node) throw Error('Missing selector'); node.scrollIntoView({block:'nearest'}); const r=node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (const type of ['mouseDown', 'mouseUp']) window.webContents.sendInputEvent({ type, x: Math.round(rect.x), y: Math.round(rect.y), button: 'left', clickCount: 1 });
  await selector('[role="option"]');
  const option = await evaluate(`(() => {const node=[...document.querySelectorAll('[role="option"]')].find(item=>item.textContent===${JSON.stringify(text)}); if(!node) throw Error('Missing option '+${JSON.stringify(text)}); const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for(const type of ['mouseMove','mouseDown','mouseUp']) window.webContents.sendInputEvent({type,x:Math.round(option.x),y:Math.round(option.y),button:'left',clickCount:1});
  await waitFor(()=>evaluate(`!document.querySelector('[role=\"option\"]')`),'selection closed'); await delay(100);
}
async function drag(selector, dx, dy) {
  const rect=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  window.webContents.sendInputEvent({type:'mouseDown',x:Math.round(rect.x),y:Math.round(rect.y),button:'left',clickCount:1});
  window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(rect.x+dx),y:Math.round(rect.y+dy),button:'left',movementX:dx,movementY:dy});
  window.webContents.sendInputEvent({type:'mouseUp',x:Math.round(rect.x+dx),y:Math.round(rect.y+dy),button:'left',clickCount:1}); await delay(150);
}
async function seekFraction(fraction) {
  const rect=await evaluate(`(()=>{const r=document.querySelector('.montage-v2-ruler').getBoundingClientRect();return {x:r.x+r.width*${fraction},y:r.y+8};})()`);
  for(const type of ['mouseDown','mouseUp']) window.webContents.sendInputEvent({type,x:Math.round(rect.x),y:Math.round(rect.y),button:'left',clickCount:1});
  await delay(150); await selector('.montage-v2-preview[data-state="ready"]');
}
async function capture(name) { for(let pass=0;pass<3;pass++){await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}); await delay(100);} await writeFile(join(output, `${name}.png`), (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); report.screenshots.push({name,inner:await evaluate('({width:innerWidth,height:innerHeight})'),bounds:window.getContentBounds(),geometry:await evaluate(`['.montage-v2-layout','.montage-v2-workspace','.montage-v2-inspector','.montage-v2-inspector__content'].map(selector=>{const element=document.querySelector(selector);return element?{selector,x:element.getBoundingClientRect().x,width:element.getBoundingClientRect().width,right:element.getBoundingClientRect().right,basis:getComputedStyle(element).flexBasis}:null})`)}); }
async function savedDraft() { await delay(60); await waitFor(() => evaluate(`document.querySelector('.montage-v2-header__identity [data-state]')?.dataset.state==='saved'`), 'draft saved'); return evaluate(`window.switchboard.listMontageDrafts().then(drafts=>drafts.find(draft=>draft.sourceClipId==='clip-upgrades-qa'))`); }
async function openEditor() { await waitFor(() => evaluate(`[...document.querySelectorAll('button')].some(item=>item.textContent.trim()==='Capture')`), 'navigation'); await textButton('Capture'); await selector('[data-clip-id="clip-upgrades-qa"]'); await ariaButton('Open Editor verification fixture'); await selector('.montage-v2-preview[data-state="ready"]'); }
function assert(value, message) { if (!value) throw Error(message); report.checks.push(message); }

await import('../out/main/index.js');
void app.whenReady().then(async () => {
  await waitFor(async () => { window = BrowserWindow.getAllWindows().find(item => !item.isDestroyed()); return Boolean(window); }, 'window');
  window.webContents.on('console-message', event => { if (event.level === 'error' && !event.message.includes('rename')) report.errors.push(event.message); });
  await openEditor();
  await choose('Clip canvas', '9:16 vertical');
  await setInput('Horizontal position', 20); await setInput('Zoom %', 120);
  const frameDraft = await savedDraft();
  assert(frameDraft.canvasSize === '9:16' && frameDraft.segments[0].videoEdits.framing.keyframes[0].zoom === 1.2, 'Framing and layout persist through main');
  await drag('.edited-video-frame', -35, 0);
  assert((await savedDraft()).segments[0].videoEdits.framing.keyframes[0].x > 0.2, 'Dragging preview updates the persisted framing point');
  for (const [width, height] of [[1080, 720], [1420, 900], [1920, 1080]]) {
    await viewport(width, height); await delay(150); await capture(`${width}x${height}-framing`);
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth && !!document.querySelector('.edited-video-frame canvas')?.width`), `${width}x${height} canvas without page overflow`);
  }
  await viewport(1420, 900);
  await choose('Edit tool', 'Speed & freezes'); await setInput('Speed at playhead', 0.5); await textButton('Freeze frame at playhead');
  let draft = await savedDraft(); assert(draft.segments[0].videoEdits.freezes.length === 1 && draft.durationMs > 5000, 'Speed and freeze change canonical duration');
  await capture('timing');
  await ariaButton('Back to start'); await textButton('Play'); await delay(150); await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}); await delay(50);
  const frozenA=await evaluate(`({source:document.querySelector('video[data-active=true]').currentTime,time:document.querySelector('[aria-label="Montage playhead"]').getAttribute('aria-valuenow')})`);
  await delay(250); await window.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}); await delay(50);
  const frozenB=await evaluate(`({source:document.querySelector('video[data-active=true]').currentTime,time:document.querySelector('[aria-label="Montage playhead"]').getAttribute('aria-valuenow')})`);
  assert(frozenA.source < 0.04 && frozenB.source < 0.04 && Number(frozenB.time)>Number(frozenA.time), 'Freeze playback advances the edit clock while holding the source frame');
  await textButton('Pause'); await ariaButton('Back to start');
  await choose('Edit tool', 'Text & privacy'); await textButton('Add text'); await textButton('Add blur'); await textButton('Add pixelation');
  draft = await savedDraft(); assert(draft.segments[0].videoEdits.overlays.length === 3, 'Multiple text and privacy overlays persist'); await capture('overlays');
  const originalWidth=draft.segments[0].videoEdits.overlays[2].width;
  await drag('.edited-overlay-selection > span', 25, 10); draft=await savedDraft();
  assert(draft.segments[0].videoEdits.overlays[2].width>originalWidth, 'Dragging the privacy handle resizes the persisted mask');
  await choose('Edit tool', 'Audio automation'); await textButton('Add volume point'); await textButton('Mute interval at playhead');
  draft = await savedDraft(); assert(draft.segments[0].videoEdits.audioAutomation[0].mutes.length === 1, 'Audio automation and mute interval persist'); await capture('audio');
  await ariaButton('Undo'); draft = await savedDraft(); assert(!draft.segments[0].videoEdits.audioAutomation[0].mutes.length, 'Undo restores the prior audio lane');
  await ariaButton('Redo'); draft = await savedDraft(); assert(draft.segments[0].videoEdits.audioAutomation[0].mutes.length === 1, 'Redo restores the muted interval');
  await setInput('Audio in', 0.2); await evaluate(`document.querySelector('input[aria-label="Audio in"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`); draft=await savedDraft(); assert(draft.segments[0].audioTrackTrims[0].startMs===200, 'Per-track source trimming remains available');
  await textButton('Add music'); await waitFor(()=>evaluate(`!!document.querySelector('.montage-v2-music-clip')`),'imported music'); await savedDraft(); await textButton('Music settings'); await selector('.advanced-music-automation');
  await evaluate(`document.querySelector('.advanced-music-automation').open=true`);
  await ariaButton('Duck music under voice'); draft=await savedDraft(); assert(draft.music.ducking.enabled, 'Imported music and microphone ducking persist'); await capture('music');
  await seekFraction(0.33); await ariaButton('Split at playhead'); await savedDraft();
  await seekFraction(0.67); await ariaButton('Split at playhead'); draft=await savedDraft(); assert(draft.segments.length===3,'Two splits isolate a middle section');
  await evaluate(`document.querySelectorAll('.montage-v2-segment')[1].click()`); await delay(150); await ariaButton('Remove segment');
  const removed=await savedDraft(); assert(removed.segments.length===2 && removed.durationMs<draft.durationMs,'Removing the middle section closes the sequence without changing source media');
  await ariaButton('Undo'); await savedDraft(); await ariaButton('Redo'); await savedDraft(); await capture('split-edit');
  // Native reload must recover from main-owned storage, with no renderer-local draft.
  window.webContents.reload(); await delay(600); await openEditor();
  draft = await savedDraft(); assert(draft.segments[0].videoEdits.overlays.length === 3 && draft.segments[0].videoEdits.freezes.length === 1, 'Reload restores the complete clip draft');
  const manifest=join(profile,'montage-v2','manifest.json'); const prior=await savedDraft();
  await rename(manifest,`${manifest}.qa-backup`); await mkdir(manifest);
  await choose('Edit tool', 'Framing'); await setInput('Zoom %', 130);
  await waitFor(() => evaluate(`document.querySelector('.montage-v2-header__identity [data-state]')?.dataset.state==='error'`), 'failed save'); await capture('save-error');
  const persisted=await evaluate(`window.switchboard.listMontageDrafts().then(drafts=>drafts.find(draft=>draft.sourceClipId==='clip-upgrades-qa'))`);
  assert(persisted.segments[0].videoEdits.framing.keyframes[0].zoom===prior.segments[0].videoEdits.framing.keyframes[0].zoom,'Failed disk write does not replace the last confirmed draft');
  await rmdir(manifest); await rename(`${manifest}.qa-backup`,manifest);
  await textButton('Retry save'); await savedDraft(); assert(true, 'Retry save recovers the retained edit after a real disk failure');
  await ariaButton('Mute preview'); await ariaButton('Unmute preview');
  assert(await evaluate(`[...document.querySelectorAll('.montage-v2-preview > video')].every(video=>video.muted)`),'Preview unmute keeps original embedded audio silent to avoid duplicate playback');
  await setInput('Clip edit name','Fixture with multiple words'); await evaluate(`document.querySelector('input[aria-label="Clip edit name"]').dispatchEvent(new FocusEvent('focusout',{bubbles:true}))`);
  assert((await savedDraft()).name==='Fixture with multiple words','Draft names accept spaces and persist on blur');
  for(const label of ['16:9 widescreen','1:1 square','4:5 portrait']) {
    // Use the native menu's label from its available options, without changing persisted values directly.
    const choice=label.split(' ')[0];
    const optionText=await evaluate(`(()=>{const text={ '16:9':'16:9 landscape','1:1':'1:1 square','4:5':'4:5 portrait' };return text[${JSON.stringify(choice)}];})()`);
    await choose('Clip canvas',optionText); await savedDraft();
  }
  await choose('Frame scale','Fit whole frame'); await choose('Frame background','Blurred video');
  await setInput('Zoom %',100); await savedDraft(); await capture('fit-blur');
  await textButton('Share'); await ariaButton('Original'); await textButton('Prepare clip');
  await selector('[data-share-state="ready"]');
  assert((await stat(join(profile,'export.mp4'))).size>1000,'Native share flow renders a real MP4 with clip effects and music');
  assert(await evaluate(`(()=>{const preview=document.querySelector('[data-share-clip-dialog] canvas');const source=document.querySelector('.edited-video-frame canvas');return !!preview && !!source && preview.width===source.width && preview.height===source.height && preview.width>0;})()`),'Share preview initializes from the edited canvas after the dialog mounts'); await capture('export-ready');
  await textButton('Done');
  // Cancel through the public preload while FFmpeg is running, preserving the previous export.
  const beforeExport=await readFile(join(profile,'export.mp4'));
  const cancelled=await evaluate(`(async()=>{const project=(await window.switchboard.listMontageDrafts())[0];const exportId=crypto.randomUUID();const result=window.switchboard.exportMontageV2({exportId,project,preset:'original'});await new Promise(resolve=>setTimeout(resolve,80));await window.switchboard.cancelMontageV2Export(exportId);return await result;})()`);
  assert(cancelled===null && beforeExport.equals(await readFile(join(profile,'export.mp4'))),'Cancelling native export leaves the previous destination intact');
  window.webContents.debugger.attach('1.3'); await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await viewport(1080,720); await capture('1080x720-reduced-motion');
  await evaluate(`document.querySelector('[aria-label="Montage playhead"]').focus()`);
  const keyboardBefore=await evaluate(`Number(document.querySelector('[aria-label="Montage playhead"]').getAttribute('aria-valuenow'))`);
  for(const type of ['keyDown','keyUp']) window.webContents.sendInputEvent({type,keyCode:'Right'}); await delay(150);
  assert(await evaluate(`Number(document.querySelector('[aria-label="Montage playhead"]').getAttribute('aria-valuenow'))>${keyboardBefore}`),'Keyboard arrows seek through the edited timeline');
  await capture('keyboard-focus');
  assert(!window.isVisible(), 'Native verification stayed hidden');
  // Discard immediately after an edit: the debounce must not recreate the draft.
  await setInput('Zoom %',105); await ariaButton('Discard montage draft'); await delay(800);
  assert(await evaluate(`window.switchboard.listMontageDrafts().then(drafts=>drafts.length===0)`),'Discard cancels pending autosave and does not resurrect the draft');
  await capture('empty-drafts');
  const missing={...draft,id:crypto.randomUUID(),name:'Missing source recovery',sourceClipId:clip.id,segments:draft.segments.map(segment=>({...segment,clipId:'missing-source'}))};
  await evaluate(`window.switchboard.saveMontageDraft(${JSON.stringify(missing)})`);
  await textButton('Capture'); await ariaButton('Open Editor verification fixture'); await selector('.montage-v2-preview[data-state="error"]');
  assert(await evaluate(`!document.querySelector('.advanced-video-controls') && document.body.innerText.includes('missing')`),'Missing media retains the draft and exposes an unavailable editor state'); await capture('missing-source');
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); app.exit(0);
}).catch(async error => { if(window) { console.error(await evaluate('document.body.innerText.slice(0,5000)').catch(()=>'')); await capture('failure').catch(()=>{}); } console.error(error); await writeFile(join(output, 'failure.json'), JSON.stringify({ ...report, error: error.message }, null, 2)); app.exit(1); });
