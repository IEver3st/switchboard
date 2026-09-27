import {app,BrowserWindow,screen} from 'electron';
import {createServer} from 'node:http';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),dir=import.meta.dirname;
app.setName('switchboard-marketing-demo');app.setAppPath(root);app.setPath('userData',resolve(dir,'profile'));
process.env.SWITCHBOARD_NATIVE_REVIEW='1';process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN='1';process.env.SWITCHBOARD_NATIVE_FIXTURES='1';delete process.env.ELECTRON_RENDERER_URL;
app.commandLine.appendSwitch('force-device-scale-factor','1');
let w;
app.on('browser-window-created',(_,win)=>{win.setFocusable(false);win.setPosition(-20000,-20000);win.webContents.setBackgroundThrottling(false);win.webContents.setAudioMuted(true);});
await import('../../out/main/index.js');
void app.whenReady().then(async()=>{
await mkdir(resolve(dir,'raw'),{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
while(!(w=BrowserWindow.getAllWindows()[0])||w.webContents.isLoading())await delay(100);
w.setMinimumSize(1,1);w.setContentSize(1420,900);
const secondary=screen.getAllDisplays().find(d=>d.id!==screen.getPrimaryDisplay().id);
if(!secondary)throw Error('No secondary display');
const b=secondary.workArea;w.setBounds({x:b.x+40,y:b.y+40,width:1420,height:900});
w.setTitle('Switchboard - Customization demo');w.setFocusable(false);w.setPosition(-20000,-20000);for(let i=0;i<4;i++){const [ow,oh]=w.getSize(),[cw,ch]=w.getContentSize();w.setSize(ow+1420-cw,oh+900-ch);}let recording=null,busy=false;setInterval(async()=>{if(!recording||busy)return;busy=true;const rec=recording;try{const time=Date.now();const img=await w.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});const file=resolve(rec.dir,String(rec.frames.length).padStart(5,'0')+'.png');await writeFile(file,img.toPNG());rec.frames.push({file,time});}finally{busy=false}},67);
const server=createServer(async(req,res)=>{try{let body='';for await(const c of req)body+=c;const q=JSON.parse(body||'{}');let value;
if(q.action==='record-start'){const d=resolve(dir,'frames',q.name);await mkdir(d,{recursive:true});recording={dir:d,frames:[],started:Date.now()};value=true;}else if(q.action==='record-stop'){const rec=recording;recording=null;while(busy)await delay(20);await writeFile(resolve(rec.dir,'frames.json'),JSON.stringify(rec));value={frames:rec.frames.length,duration:(Date.now()-rec.started)/1000,dir:rec.dir};}else if(q.action==='js')value=await w.webContents.executeJavaScript(q.code);
else if(q.action==='capture'){await delay(350);const img=await w.webContents.capturePage();await writeFile(resolve(dir,'raw',q.name+'.png'),img.toPNG());value={size:img.getSize()};}
else if(q.action==='input'){w.webContents.sendInputEvent(q.event);value=true;}
else if(q.action==='info')value={bounds:w.getBounds(),native:w.getNativeWindowHandle().readUInt32LE(),secondary:b,visible:w.isVisible(),pid:process.pid};
else if(q.action==='quit'){res.end('{}');server.close();app.exit();return;}
res.setHeader('Content-Type','application/json');res.end(JSON.stringify({value}));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}});
server.listen(47839,'127.0.0.1',()=>console.log('CAPTURE_READY 47839'));

}).catch(e=>{console.error(e);app.exit(1)});


