import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const base=import.meta.dirname;
const out='C:/Users/User/Desktop/Projects/venture-lab/artifacts/switchboard-demo-20260915';await mkdir(out,{recursive:true});
const filter="pad=1484:1000:32:32:color=0x171a22,drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='SWITCHBOARD  /  CUSTOMIZATION DEMO':fontcolor=0xe4e7ee:fontsize=18:x=32:y=956,drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='Simulated devices - real interface':fontcolor=0xa5adbb:fontsize=17:x=w-tw-32:y=957";
function run(args){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr);}
const shots=['01-mouse-color-picker','02-mouse-customized','03-mouse-lighting-effects','04-microphone-profiles','05-workspace-options','06-keyboard-lighting'];
for(const name of shots){run(['-i',join(base,'raw',name+'.png'),'-vf',filter,'-frames:v','1',join(out,name+'.png')]);console.log('PNG',name);}
for(const name of ['mouse-customization','workspace-customization','microphone-profiles']){
 const frames=JSON.parse(await readFile(join(base,'frames',name,'frames.json'),'utf8')).frames;
 const lines=frames.flatMap((f,i)=>["file '"+f.file.replaceAll('\\','/')+"'",'duration '+((frames[i+1]?.time??f.time+100)-f.time)/1000]);lines.push("file '"+frames.at(-1).file.replaceAll('\\','/')+"'");
 const list=join(base,'frames',name,'concat.txt');await writeFile(list,lines.join('\n'));
 run(['-f','concat','-safe','0','-i',list,'-vf',filter+',fps=30','-c:v','libx264','-crf','19','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart','-an',join(out,name+'.mp4')]);console.log('MP4',name);
 run(['-i',join(out,name+'.mp4'),'-filter_complex','fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3','-loop','0',join(out,name+'.gif')]);console.log('GIF',name);
}
await writeFile(join(out,'export-settings.json'),JSON.stringify({source:'Electron capturePage, isolated native fixture profile',cap:'0.1.0: targets windows empty; window screenshot rejected',filter,shots,video:'H.264 CRF19, 30fps timestamp-preserving resampling',gif:'960px, 12fps, palettegen, looping'},null,2));
