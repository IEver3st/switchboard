import { resolve, join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { createMontageMusicTrack, createMontageProjectV2, normalizeMontageProject } from '../src/renderer/src/components/capture/montage-v2-model';
import { renderMontageV2 } from '../src/main/services/montage-v2-renderer';
import { clipSchema } from '../src/shared/contracts';
const root=resolve('design-qa/editor-tools');
const downloads=join(process.env.USERPROFILE!, 'Downloads');
const mp3=(await readdir(downloads)).find(name=>name.toLowerCase().endsWith('.mp3'));
if(!mp3) throw Error('Requested music file missing. No test tones will be used.');
const musicPath=join(downloads,mp3);
const run=async(args:string[])=>{const p=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err);return out;};
process.env.SWITCHBOARD_FFMPEG='ffmpeg'; process.env.SWITCHBOARD_FFPROBE='ffprobe';
const path=join(root,'music-source.mp4');
await run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x15364a:s=1280x720:r=30:d=4','-stream_loop','-1','-i',musicPath,'-t','4','-c:v','libx264','-preset','ultrafast','-c:a','aac','-y',path]);
const clip=clipSchema.parse({id:'render-clip',path,name:'Render QA',createdAt:0,durationMs:4000,fileSize:(await stat(path)).size,width:1280,height:720,fps:30});
let project=createMontageProjectV2([clip,clip,clip]);
project=normalizeMontageProject({...project,segments:project.segments.map((segment,index)=>({...segment,trimStartMs:1000,trimEndMs:index===2?2000:3000,videoEdits:{speed:[0.5,2,0.25][index],flipHorizontal:index===1,brightness:0.1,contrast:1.1,saturation:0.8,text:{content:"Clean: 100% [test] 'title'",startMs:1000,endMs:2000,position:'bottom',size:'medium'}}}))});
const meta=JSON.parse(await run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',musicPath]));
project=normalizeMontageProject({...project,music:{...createMontageMusicTrack({id:crypto.randomUUID(),name:'Downloaded music',originalName:mp3,durationMs:Math.round(Number(meta.format.duration)*1000),fileSize:(await stat(musicPath)).size,createdAt:0}),sourceStartMs:1000,sourceEndMs:3500,fadeInMs:300,fadeOutMs:500,volume:0.2}});
const progress:number[]=[]; const destination=join(root,'speed-title-music.mp4');
const start=performance.now();
await renderMontageV2({project,entries:project.segments.map(segment=>({segment,clip})),musicPath,destination,preset:'original',targetSizeMb:5,encoder:'h264_nvenc',onProgress:f=>progress.push(f)});
const seconds=(performance.now()-start)/1000;
const probe=JSON.parse(await run(['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_type,width,height:stream_tags=encoder','-of','json',destination]));
if(Math.abs(Number(probe.format.duration)-project.durationMs/1000)>0.15) throw Error('Speed duration mismatch '+probe.format.duration);
if(Number(probe.format.size)>5*1048576)throw Error('Exceeded size cap');
if(!progress.some(f=>f>0&&f<0.9)) throw Error('Missing progress');
await run(['ffmpeg','-hide_banner','-loglevel','error','-ss','1','-i',destination,'-frames:v','1','-y',join(root,'title-visible.png')]);
await run(['ffmpeg','-hide_banner','-loglevel','error','-ss','3','-i',destination,'-frames:v','1','-y',join(root,'title-ended.png')]);
// Long sequence with a runtime-based target; no playback or sound device is opened.
let longProject=createMontageProjectV2(Array.from({length:12},()=>clip));
longProject=normalizeMontageProject({...longProject,segments:longProject.segments.map(segment=>({...segment,videoEdits:{speed:0.25}}))});
const cancel=new AbortController();let cancelStarted=0;let cancelled=false;
try {await renderMontageV2({project:longProject,entries:longProject.segments.map(segment=>({segment,clip})),destination:join(root,'cancelled.mp4'),preset:'original',signal:cancel.signal,onProgress:f=>{if(f>0&&!cancel.signal.aborted){cancelStarted=performance.now();cancel.abort();}}});}
catch(error){if((error as Error).name!=='AbortError')throw error;cancelled=true;}
if(!cancelled)throw Error('Cancel did not stop render');
const cancellationMs=performance.now()-cancelStarted;if(cancellationMs>2000)throw Error('Cancel took too long');
await Bun.write(join(root,'render-report.json'),JSON.stringify({seconds,projectDurationMs:project.durationMs,probe,progressSamples:progress.length,cancellationMs,audioSource:mp3},null,2));
console.log({seconds,duration:probe.format.duration,bytes:probe.format.size,progressSamples:progress.length,cancellationMs});
