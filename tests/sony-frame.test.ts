import { describe, expect, test } from 'bun:test';
import { encodeSonyFrame, SonyFrameDecoder, sonyFrameType } from '../src/main/modules/sony/common/protocol/frame';

describe('Sony MDR-v2 frame codec', () => {
  test('round trips reserved bytes across fragmented input', () => {
    const encoded = encodeSonyFrame({ type: sonyFrameType.dataMdr, sequence: 1, payload: Uint8Array.from([0x3c, 0x3d, 0x3e, 0x19]) });
    const decoder = new SonyFrameDecoder();
    expect(decoder.feed(encoded.slice(0, 4))).toEqual([]);
    expect(decoder.feed(encoded.slice(4))).toEqual([{ type: sonyFrameType.dataMdr, sequence: 1, payload: Uint8Array.from([0x3c, 0x3d, 0x3e, 0x19]) }]);
  });
  test('rejects a malformed checksum', () => {
    const encoded = encodeSonyFrame({ type: sonyFrameType.dataMdr, sequence: 0, payload: Uint8Array.from([0x22, 0]) });
    encoded[3] = encoded[3]! ^ 1;
    const decoder = new SonyFrameDecoder();
    expect(decoder.feed(encoded)).toEqual([]);
    expect(decoder.malformedFrameCount).toBe(1);
  });
});
