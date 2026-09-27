import WebSocket from 'ws';
const [target]=await (await fetch('http://127.0.0.1:9229/json/list')).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
let id=0;const pending=new Map();
ws.on('message',data=>{const r=JSON.parse(data);pending.get(r.id)?.(r.result);pending.delete(r.id);});
const call=(method,params)=>new Promise(resolve=>{const key=++id;pending.set(key,resolve);ws.send(JSON.stringify({id:key,method,params}));});
const get=objectId=>call('Runtime.getProperties',{objectId,ownProperties:true});
let fn=(await call('Runtime.evaluate',{expression:"process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')('electron').ipcMain._invokeHandlers.get('system:get-snapshot')"})).result.objectId;
const props=await get(fn);
const scopes=await get(props.internalProperties.find(p=>p.name==='[[Scopes]]').value.objectId);
let controller;
for(const scope of scopes.result.filter(p=>p.value?.objectId)){
  const properties=await get(scope.value.objectId);
  controller=properties.result.find(p=>p.name==='controller'&&p.value?.objectId)?.value.objectId;
  if(controller)break;
}
if(!controller)throw new Error('Controller scope unavailable');
const result=await call('Runtime.callFunctionOn',{objectId:controller,functionDeclaration:'function(){globalThis.__lightingDebugController=this;return {session:!!this.devices.modules.find(m=>m.id==="device.logitech-hidpp").directSession};}',returnByValue:true});
console.log(JSON.stringify(result));ws.close();
