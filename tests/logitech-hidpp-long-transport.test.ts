import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { HidppLongTransport, resolveHidppSoftwareId } from '../src/main/modules/logitech/hidpp-long-transport';

class DuplicateReplyHandle extends EventEmitter {
  public async write(report: Buffer): Promise<number> {
    const requestedFeature = ((report[4] ?? 0) << 8) | (report[5] ?? 0);
    const featureIndex = requestedFeature === 0x0005 ? 0x03 : 0x06;
    const response = Buffer.alloc(20);
    response.set([0x11, report[1]!, report[2]!, report[3]!, featureIndex]);

    if (requestedFeature === 0x0005) {
      setTimeout(() => this.emit('data', Buffer.from(response)), 0);
      setTimeout(() => this.emit('data', Buffer.from(response)), 2);
    } else {
      setTimeout(() => this.emit('data', Buffer.from(response)), 8);
    }
    return report.length;
  }

  public async close(): Promise<void> {}
}

class EchoReplyHandle extends EventEmitter {
  public lastReport: Buffer | null = null;

  public async write(report: Buffer): Promise<number> {
    this.lastReport = Buffer.from(report);
    setTimeout(() => this.emit('data', Buffer.from(report)), 0);
    return report.length;
  }

  public async close(): Promise<void> {}
}

describe('HID++ long transport', () => {
  test('drains a duplicate reply before starting the next same-address request', async () => {
    const handle = new DuplicateReplyHandle();
    const TransportConstructor = HidppLongTransport as unknown as new (handle: DuplicateReplyHandle) => HidppLongTransport;
    const transport = new TransportConstructor(handle);

    try {
      expect(await transport.getFeatureIndex(1, 0x0005)).toBe(0x03);
      expect(await transport.getFeatureIndex(1, 0x1004)).toBe(0x06);
    } finally {
      await transport.close();
    }
  });

  test('uses a caller-specific software ID so concurrent clients cannot consume each other replies', async () => {
    const handle = new EchoReplyHandle();
    const TransportConstructor = HidppLongTransport as unknown as new (
      handle: EchoReplyHandle,
      softwareId: number,
    ) => HidppLongTransport;
    const transport = new TransportConstructor(handle, 0x0a);

    try {
      await transport.request(1, 0x0b, 5, [0, 1, 0, 0]);
      expect(handle.lastReport?.[3]).toBe(0x5a);
    } finally {
      await transport.close();
    }
  });

  test('separates installed, development, and native-review HID++ clients', () => {
    expect(resolveHidppSoftwareId({})).toBe(0x07);
    expect(resolveHidppSoftwareId({ ELECTRON_RENDERER_URL: 'http://localhost:5173' })).toBe(0x08);
    expect(resolveHidppSoftwareId({ SWITCHBOARD_NATIVE_REVIEW: '1' })).toBe(0x09);
    expect(resolveHidppSoftwareId({ SWITCHBOARD_HIDPP_SOFTWARE_ID: 'a' })).toBe(0x0a);
  });
});
