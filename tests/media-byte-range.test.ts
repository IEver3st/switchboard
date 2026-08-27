import { describe, expect, test } from 'bun:test';
import { parseByteRange } from '../src/main/media-byte-range';

describe('clip media byte ranges', () => {
  test('parses bounded and open-ended ranges', () => {
    expect(parseByteRange('bytes=100-299', 1_000)).toEqual({ start: 100, end: 299 });
    expect(parseByteRange('bytes=800-', 1_000)).toEqual({ start: 800, end: 999 });
  });

  test('parses suffix ranges and clamps them to the file', () => {
    expect(parseByteRange('bytes=-200', 1_000)).toEqual({ start: 800, end: 999 });
    expect(parseByteRange('bytes=-2000', 1_000)).toEqual({ start: 0, end: 999 });
  });

  test('rejects malformed, multiple, reversed, and unsatisfiable ranges', () => {
    expect(parseByteRange('bytes=0-1,4-5', 1_000)).toBeNull();
    expect(parseByteRange('bytes=400-200', 1_000)).toBeNull();
    expect(parseByteRange('bytes=1000-', 1_000)).toBeNull();
    expect(parseByteRange('items=0-10', 1_000)).toBeNull();
  });
});
