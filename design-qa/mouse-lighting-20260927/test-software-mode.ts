import { devicesAsync } from 'node-hid';
import { HidppLongTransport } from '../../src/main/modules/logitech/hidpp-long-transport';
import { LogitechRgbEffectsController } from '../../src/main/modules/logitech/rgb-effects';
const endpoint = (await devicesAsync()).find(d => d.vendorId === 0x046d && d.productId === 0xc547 && d.usagePage === 0xff00 && d.usage === 2)!;
const transport = await HidppLongTransport.open(endpoint.path!);
const profile = (await transport.getFeatureIndex(1,0x8100))!;
const dpi = (await transport.getFeatureIndex(1,0x2201))!;
const rgb = (await transport.getFeatureIndex(1,0x8071))!;
const zones = (await transport.getFeatureIndex(1,0x8081))!;
const originalMode = (await transport.request(1,profile,2))[4]!;
const originalDpi = (await transport.request(1,dpi,2,[0])).readUInt16BE(5);
const lighting = (await LogitechRgbEffectsController.probe(transport,1,rgb,zones))!;
try {
  await transport.request(1,profile,1,[2]);
  const currentDpi = (await transport.request(1,dpi,2,[0])).readUInt16BE(5);
  if (currentDpi !== originalDpi) await transport.request(1,dpi,3,[0,originalDpi>>>8,originalDpi&255]);
  await lighting.setEnabled(false);
  console.log(JSON.stringify({ready:true,mode:(await transport.request(1,profile,2))[4],dpi:originalDpi,durationSeconds:60}));
  await Bun.sleep(60_000);
} finally {
  await transport.request(1,profile,1,[originalMode]);
  await lighting.setEnabled(false);
  console.log(JSON.stringify({restoredMode:(await transport.request(1,profile,2))[4]}));
  await transport.close();
}
