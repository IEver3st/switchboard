import { describe, expect, test } from 'bun:test';
import { parsePnpUtilHidDevices } from '../src/main/services/windows-hid-enumerator';

const header = 'InstanceId,DeviceDescription,ClassName,ClassGuid,ManufacturerName,Status,ProblemCode,ProblemStatus,DriverName,ExtensionDriverNames,HardwareIds,CompatibleIds,Interface,Status';

describe('Windows HID enumeration', () => {
  test('maps connected PnP HID interfaces without interrogating device string descriptors', () => {
    const csv = [
      header,
      '"HID\\VID_1532&PID_0266&MI_03\\a&1b9da499&0&0000","Razer Huntsman V2 Analog","HIDClass","{745a17a0-74d3-11d0-b6fe-00a0c90f57da}","Razer Inc","Started","","","oem60.inf","","HID\\VID_1532&PID_0266&REV_0200&MI_03;HID\\VID_1532&UP:000C_U:0001;HID_DEVICE",""',
      '"HID\\VID_1532&PID_0266&MI_03\\a&1b9da499&0&0000","","","","","","","","","","","","\\\\?\\HID#VID_1532&PID_0266&MI_03#a&1b9da499&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}","Enabled"',
      '"HID\\VID_046D&PID_C547&MI_02&Col02\\a&2b02543b&0&0001","HID-compliant vendor-defined device","HIDClass","{745a17a0-74d3-11d0-b6fe-00a0c90f57da}","Microsoft","Started","","","input.inf","","HID\\VID_046D&PID_C547&REV_0402&MI_02&Col02;HID\\VID_046D&UP:FF00_U:0002;HID_DEVICE",""',
      '"HID\\VID_046D&PID_C547&MI_02&Col02\\a&2b02543b&0&0001","","","","","","","","","","","","\\\\?\\HID#VID_046D&PID_C547&MI_02&Col02#a&2b02543b&0&0001#{4d1e55b2-f16f-11cf-88cb-001111000030}","Enabled"',
      '"HID\\VID_046D&PID_C547&MI_02&Col02\\a&2b02543b&0&0001","","","","","","","","","","","","\\\\?\\HID#VID_046D&PID_C547&MI_02&Col02#a&2b02543b&0&0001#{4afa3d53-74a7-11d0-be5e-00a0c9062857}","Enabled"',
    ].join('\r\n');

    expect(parsePnpUtilHidDevices(csv)).toEqual([
      {
        vendorId: 0x1532,
        productId: 0x0266,
        path: '\\\\?\\HID#VID_1532&PID_0266&MI_03#a&1b9da499&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}',
        manufacturer: 'Razer Inc',
        product: 'Razer Huntsman V2 Analog',
        release: 0x0200,
        interface: 3,
        usagePage: 0x000c,
        usage: 0x0001,
      },
      {
        vendorId: 0x046d,
        productId: 0xc547,
        path: '\\\\?\\HID#VID_046D&PID_C547&MI_02&Col02#a&2b02543b&0&0001#{4d1e55b2-f16f-11cf-88cb-001111000030}',
        manufacturer: 'Microsoft',
        product: 'HID-compliant vendor-defined device',
        release: 0x0402,
        interface: 2,
        usagePage: 0xff00,
        usage: 0x0002,
      },
    ]);
  });
});
