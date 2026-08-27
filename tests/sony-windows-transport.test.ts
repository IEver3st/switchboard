import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('Sony Windows RFCOMM transport', () => {
  test('uses the packed native endpoint with service lookup semantics', () => {
    const source = readFileSync(new URL('../engines/sony-headphones-host/Program.cs', import.meta.url), 'utf8');
    expect(source).toContain('ConnectService(ulong address, Guid service, int timeoutMilliseconds) => Connect(address, service, 0, timeoutMilliseconds)');
    expect(source).toContain('ConnectChannel(target.Address, 9, 8_000)');
    expect(source).toContain('[StructLayout(LayoutKind.Sequential, Pack = 1)]');
    expect(source).not.toContain('Port = uint.MaxValue');
  });

  test('bounds a non-blocking connection attempt and requests authenticated encryption', () => {
    const source = readFileSync(new URL('../engines/sony-headphones-host/Program.cs', import.meta.url), 'utf8');
    expect(source).toContain('WSAPoll(ref descriptor, 1, timeoutMilliseconds)');
    expect(source).toContain('0x80000001');
    expect(source).toContain('0x00000002');
  });
});
