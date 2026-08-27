export const sonyFrameType = { ack: 0x01, dataMdr: 0x0c } as const;
const start = 0x3e;
const end = 0x3c;
const escape = 0x3d;
const maximumPayloadLength = 64 * 1024;

export interface SonyFrame {
  type: number;
  sequence: 0 | 1;
  payload: Uint8Array;
}

export function encodeSonyFrame(frame: SonyFrame): Uint8Array {
  const inner = new Uint8Array(7 + frame.payload.length);
  inner[0] = frame.type;
  inner[1] = frame.sequence;
  new DataView(inner.buffer).setUint32(2, frame.payload.length, false);
  inner.set(frame.payload, 6);
  inner[inner.length - 1] = checksum(inner.subarray(0, -1));
  const encoded: number[] = [start];
  for (const value of inner) {
    if (value === start || value === end || value === escape) encoded.push(escape, value - 0x10);
    else encoded.push(value);
  }
  encoded.push(end);
  return Uint8Array.from(encoded);
}

export class SonyFrameDecoder {
  public malformedFrameCount = 0;
  private frame: number[] | null = null;
  private escaped = false;

  public feed(bytes: Uint8Array): SonyFrame[] {
    const frames: SonyFrame[] = [];
    for (const byte of bytes) {
      if (byte === start) {
        this.frame = [];
        this.escaped = false;
        continue;
      }
      if (!this.frame) continue;
      if (this.escaped) {
        this.frame.push((byte + 0x10) & 0xff);
        this.escaped = false;
      } else if (byte === escape) {
        this.escaped = true;
      } else if (byte === end) {
        const decoded = this.decode(Uint8Array.from(this.frame));
        if (decoded) frames.push(decoded);
        else this.malformedFrameCount += 1;
        this.frame = null;
      } else {
        this.frame.push(byte);
        if (this.frame.length > maximumPayloadLength + 7) {
          this.malformedFrameCount += 1;
          this.frame = null;
        }
      }
    }
    return frames;
  }

  private decode(inner: Uint8Array): SonyFrame | null {
    if (inner.length < 7 || checksum(inner.subarray(0, -1)) !== inner.at(-1)) return null;
    const payloadLength = new DataView(inner.buffer, inner.byteOffset, inner.byteLength).getUint32(2, false);
    if (payloadLength > maximumPayloadLength || inner.length !== payloadLength + 7) return null;
    const sequence = inner[1];
    if (sequence !== 0 && sequence !== 1) return null;
    return { type: inner[0]!, sequence, payload: inner.slice(6, -1) };
  }
}

function checksum(bytes: Uint8Array): number {
  let result = 0;
  for (const byte of bytes) result = (result + byte) & 0xff;
  return result;
}
