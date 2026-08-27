import { describe, expect, test } from 'bun:test';
import { sonyFrameType } from '../src/main/modules/sony/common/protocol/frame';
import { parseXm6Event, xm6EqualizerBands, xm6ListeningMode, xm6NoiseControl } from '../src/main/modules/sony/wh1000xm6/protocol';

describe('WH-1000XM6 protocol', () => {
  test('encodes verified noise control and ten-band EQ layouts', () => {
    expect([...xm6NoiseControl('ambient', 20, true)]).toEqual([0x68, 0x19, 1, 1, 1, 1, 20, 0, 0]);
    expect([...xm6EqualizerBands([-6, -5, -4, -3, -2, -1, 0, 1, 5, 6])]).toEqual([0x58, 0, 0xa0, 10, 0, 1, 2, 3, 4, 5, 6, 7, 11, 12]);
  });
  test('preserves the duplicate background-room write required by XM6 firmware', () => {
    expect(xm6ListeningMode('background-music', 'cafe').map((value) => [...value])).toEqual([
      [0xe8, 0x04, 1], [0xe8, 0x09, 0, 2], [0xe8, 0x09, 0, 2],
    ]);
  });
  test('parses live ANC and EQ notifications', () => {
    expect(parseXm6Event({ type: sonyFrameType.dataMdr, sequence: 0, payload: Uint8Array.from([0x69, 0x19, 1, 1, 1, 1, 12, 0, 0]) })).toEqual({
      type: 'noise-control', mode: 'ambient', ambientLevel: 12, focusOnVoice: true,
    });
    expect(parseXm6Event({ type: sonyFrameType.dataMdr, sequence: 1, payload: Uint8Array.from([0x59, 0x04, 0xa0, 10, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6]) })).toEqual({
      type: 'equalizer', presetId: 'custom', gainsDb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });
});
