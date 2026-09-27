import WebSocket from 'ws';
const [target] = await (await fetch('http://127.0.0.1:9229/json/list')).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
const response = new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Inspector request timed out')),10000);
  ws.on('message',data=>{const reply=JSON.parse(data);if(reply.id===1){clearTimeout(timer);resolve(reply);}});
});
ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:process.argv[2],returnByValue:true,awaitPromise:true}}));
console.log(JSON.stringify(await response));
ws.close();
