import { devicesAsync } from 'node-hid';
import { writeFile } from 'node:fs/promises';
import { HidppLongTransport } from '../../src/main/modules/logitech/hidpp-long-transport';
const endpoint = (await devicesAsync()).find(d => d.vendorId === 0x046d && d.productId === 0xc547 && d.usagePage === 0xff00 && d.usage === 2)!;
const transport = await HidppLongTransport.open(endpoint.path!);
const features = new Map<number, string>();
for (const [id, name] of [[0x2201,'dpi'],[0x8110,'buttons'],[0x8100,'profile'],[0x8071,'rgb'],[0x8081,'zones']] as const) {
  const index = await transport.getFeatureIndex(1,id);
  if(index !== null) features.set(index,name);
}
const events: unknown[] = [];
const start = Date.now();
transport.subscribe(report => {
  const feature = features.get(report[2]!);
  if (!feature || report[1] !== 1) return;
  // Record control acknowledgements and button bitmaps, never profile sectors.
  const fn = report[3]! >> 4;
  const event = {ms:Date.now()-start,feature,fn,software:report[3]! & 15,
    payload: feature === 'profile' && fn === 5 ? [] : [...report.subarray(4,8)]};
  events.push(event);
  console.log(JSON.stringify(event));
});
console.log('TRACE READY: 40 seconds, no lighting or DPI writes from this observer');
await Bun.sleep(40_000);
await transport.close();
await writeFile(import.meta.dir + '/activity-trace.json', JSON.stringify(events,null,2));
