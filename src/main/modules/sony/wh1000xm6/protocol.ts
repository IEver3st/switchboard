import type {
  SonyBackgroundRoom,
  SonyListeningMode,
  SonyNoiseControlMode,
} from '../../../../shared/contracts';
import type { SonyFrame } from '../common/protocol/frame';
import { sonyFrameType } from '../common/protocol/frame';

export const xm6InitialQueries = [
  [0x00, 0x00], [0x06, 0x00], [0x22, 0x00],
  [0x66, 0x19], [0x66, 0x15], [0x66, 0x17],
  [0x56, 0x04], [0x56, 0x00],
  [0xe6, 0x01], [0xf6, 0x0c], [0xe6, 0x09], [0xe6, 0x04],
].map((payload) => Uint8Array.from(payload));

export const xm6EqualizerFrequencies = [31, 63, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000] as const;
export const xm6EqualizerPresets = [
  ['off', 0x00, 'Off'], ['heavy', 0x30, 'Heavy'], ['clear', 0x31, 'Clear'],
  ['hard', 0x32, 'Hard'], ['soft', 0x33, 'Soft'], ['custom', 0xa0, 'Custom'],
  ['user-1', 0xa1, 'User 1'], ['user-2', 0xa2, 'User 2'], ['user-3', 0xa3, 'User 3'],
  ['user-4', 0xa4, 'User 4'], ['user-5', 0xa5, 'User 5'],
] as const;

export type Xm6Event =
  | { type: 'battery'; percentage: number; charging: boolean }
  | { type: 'noise-control'; mode: SonyNoiseControlMode; ambientLevel: number; focusOnVoice: boolean; subtype: number; hasWindNoiseByte: boolean }
  | { type: 'equalizer'; presetId: string; gainsDb: number[]; subtype: number }
  | { type: 'dsee'; enabled: boolean }
  | { type: 'speak-to-chat'; enabled: boolean }
  | { type: 'background-music'; enabled: boolean; room: SonyBackgroundRoom | null }
  | { type: 'cinema'; enabled: boolean };

export function xm6NoiseControl(mode: SonyNoiseControlMode, ambientLevel: number, focusOnVoice: boolean, subtype = 0x19): Uint8Array {
  const level = Math.max(1, Math.min(20, Math.round(ambientLevel)));
  const on = mode === 'off' ? 0 : 1;
  const ambient = mode === 'ambient' ? 1 : 0;
  const focus = mode === 'ambient' && focusOnVoice ? 1 : 0;
  if (subtype === 0x17) return Uint8Array.from([0x68, subtype, 1, on, ambient, 2, focus, level]);
  if (subtype === 0x15 || subtype === 0x22) return Uint8Array.from([0x68, subtype, 1, on, ambient, focus, level]);
  return Uint8Array.from([0x68, 0x19, 1, on, ambient, focus, level, 0, 0]);
}

export function xm6EqualizerPreset(presetId: string, subtype = 0x00): Uint8Array[] {
  const preset = xm6EqualizerPresets.find(([id]) => id === presetId);
  if (!preset) throw new Error('Unsupported WH-1000XM6 equalizer preset.');
  return [Uint8Array.from([0x58, subtype, preset[1], 0x00]), Uint8Array.from([0x56, subtype])];
}

export function xm6EqualizerBands(gainsDb: number[], subtype = 0x00): Uint8Array {
  if (gainsDb.length !== 10) throw new Error('WH-1000XM6 equalizer requires ten bands.');
  return Uint8Array.from([0x58, subtype, 0xa0, 10, ...gainsDb.map((gain) => Math.max(0, Math.min(12, Math.round(gain) + 6)))]);
}

export const xm6Dsee = (enabled: boolean) => Uint8Array.from([0xe8, 0x01, enabled ? 1 : 0]);
export const xm6SpeakToChat = (enabled: boolean) => Uint8Array.from([0xf8, 0x0c, enabled ? 0 : 1, 1]);

export function xm6ListeningMode(mode: SonyListeningMode, room: SonyBackgroundRoom = 'my-room'): Uint8Array[] {
  const roomByte = room === 'living-room' ? 1 : room === 'cafe' ? 2 : 0;
  if (mode === 'standard') return [Uint8Array.from([0xe8, 0x09, 1, roomByte]), Uint8Array.from([0xe8, 0x04, 1])];
  if (mode === 'cinema') return [Uint8Array.from([0xe8, 0x09, 1, roomByte]), Uint8Array.from([0xe8, 0x04, 0])];
  return [Uint8Array.from([0xe8, 0x04, 1]), Uint8Array.from([0xe8, 0x09, 0, roomByte]), Uint8Array.from([0xe8, 0x09, 0, roomByte])];
}

export function parseXm6Event(frame: SonyFrame): Xm6Event | null {
  if (frame.type !== sonyFrameType.dataMdr || frame.payload.length < 2) return null;
  const p = frame.payload;
  const command = `${p[0]!.toString(16)}:${p[1]!.toString(16)}`;
  if ((command === '23:0' || command === '25:0') && p.length >= 3) {
    return { type: 'battery', percentage: Math.max(0, Math.min(100, p[2]!)), charging: p.length >= 4 && p[3] !== 0 };
  }
  if ((command === '67:19' || command === '69:19') && p.length >= 8) {
    const offset = p.length >= 9 ? 3 : 2;
    const totalEffect = p[offset];
    const mode = totalEffect === 0 ? 'off' : p[offset + 1] === 1 ? 'ambient' : 'noise-cancelling';
    return { type: 'noise-control', mode, focusOnVoice: p[offset + 2] === 1, ambientLevel: Math.max(1, Math.min(20, p[offset + 3]!)), subtype: 0x19, hasWindNoiseByte: false };
  }
  if ((p[0] === 0x67 || p[0] === 0x69) && (p[1] === 0x15 || p[1] === 0x17 || p[1] === 0x22) && p.length >= 6 && p.length <= 8) {
    const subtype = p[1]!;
    const hasWindNoiseByte = subtype === 0x17 && p.length > 7;
    const windReduction = hasWindNoiseByte && (p[5] === 0x03 || p[5] === 0x05);
    const mode = p[3] === 0 ? 'off' : subtype === 0x22 || (!windReduction && p[4] === 1) ? 'ambient' : 'noise-cancelling';
    const tail = p.length - 2;
    return { type: 'noise-control', mode, focusOnVoice: p[tail] === 1, ambientLevel: Math.max(1, Math.min(20, p[tail + 1]!)), subtype, hasWindNoiseByte };
  }
  if ((p[0] === 0x57 || p[0] === 0x59) && (p[1] === 0x00 || p[1] === 0x02 || p[1] === 0x04) && p.length >= 4) {
    const count = p[3]!;
    const preset = xm6EqualizerPresets.find(([, code]) => code === p[2]);
    const gainsDb = count > 0 && p.length >= 4 + count ? [...p.slice(4, 4 + count)].map((value) => value - (count === 10 ? 6 : 10)) : [];
    return { type: 'equalizer', presetId: preset?.[0] ?? `unknown-${p[2]!.toString(16)}`, gainsDb, subtype: p[1]! };
  }
  if ((command === 'e7:1' || command === 'e9:1') && p.length >= 3) return { type: 'dsee', enabled: p[2] === 1 };
  if ((command === 'f7:c' || command === 'f9:c') && p.length >= 3) return { type: 'speak-to-chat', enabled: p[2] === 0 };
  if ((command === 'e7:9' || command === 'e9:9') && p.length >= 3) {
    const room = p[3] === 1 ? 'living-room' : p[3] === 2 ? 'cafe' : p.length >= 4 ? 'my-room' : null;
    return { type: 'background-music', enabled: p[2] === 0, room };
  }
  if ((command === 'e7:4' || command === 'e9:4') && p.length >= 3) return { type: 'cinema', enabled: p[2] === 0 };
  return null;
}
