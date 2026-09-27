import { devicesAsync } from 'node-hid';
import { writeFile } from 'node:fs/promises';
import { HidppLongTransport } from '../../src/main/modules/logitech/hidpp-long-transport';
import { LogitechRgbEffectsController } from '../../src/main/modules/logitech/rgb-effects';
const endpoint = (await devicesAsync()).find(d => d.vendorId === 0x046d && d.productId === 0xc547 && d.usagePage === 0xff00 && d.usage === 2)!;
const transport = await HidppLongTransport.open(endpoint.path!);
try {
  const rgb = (await transport.getFeatureIndex(1,0x8071))!;
  const zones = await transport.getFeatureIndex(1,0x8081);
  const controller = (await LogitechRgbEffectsController.probe(transport,1,rgb,zones))!;
  const start = performance.now();
  await controller.setEnabled(false);
  const acknowledgedMs = Math.round(performance.now()-start);
  const samples = [];
  for (let i=0; i<6; i++) {
    samples.push({ms:Math.round(performance.now()-start),power:(await transport.request(1,rgb,8,[0,0,0]))[5]});
    if(i<5) await Bun.sleep(1000);
  }
  const result = {acknowledgedMs,samples,physicalEffectVerified:false};
  console.log(JSON.stringify(result));
  await writeFile(import.meta.dir+'/manual-off.json',JSON.stringify(result,null,2));
} finally { await transport.close(); }
