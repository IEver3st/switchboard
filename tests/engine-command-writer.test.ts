import { expect, test } from 'bun:test';
import { Writable } from 'node:stream';
import { EngineCommandWriter } from '../src/main/services/engine-command-writer';

class SlowPipe extends Writable {
  readonly commands: string[] = [];
  complete: (error?: Error | null) => void = () => {};
  constructor() { super({ highWaterMark: 1 }); }
  override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.commands.push(JSON.parse(chunk.toString()).command);
    this.complete = callback;
  }
}

test('backpressure sends each accepted command once and preserves configure/start/shutdown order', () => {
  const pipe = new SlowPipe();
  const errors: Error[] = [];
  const writer = new EngineCommandWriter(pipe, error => errors.push(error));
  writer.send({ command: 'configure', payload: 'x'.repeat(64 * 1024) });
  writer.send({ command: 'start' });
  writer.send({ command: 'shutdown' });
  expect(pipe.commands).toEqual(['configure']);
  pipe.complete();
  expect(pipe.commands).toEqual(['configure', 'start']);
  pipe.complete();
  expect(pipe.commands).toEqual(['configure', 'start', 'shutdown']);
  pipe.complete();
  expect(errors).toEqual([]);
  writer.dispose();
  expect(pipe.listenerCount('drain')).toBe(0);
  expect(pipe.listenerCount('close')).toBe(0);
});

test('expired requests are removed before drain and a stalled host cannot grow an unbounded queue', () => {
  const pipe = new SlowPipe();
  const writer = new EngineCommandWriter(pipe, () => {}, 180);
  writer.send({ command: 'configure' });
  const cancel = writer.send({ command: 'expired' });
  expect(() => writer.send({ command: 'oversized', payload: 'x'.repeat(180) })).toThrow('queue is full');
  cancel(); cancel();
  writer.send({ command: 'shutdown' });
  pipe.complete();
  expect(pipe.commands).toEqual(['configure', 'shutdown']);
  pipe.complete();
  writer.dispose();
  writer.dispose();
  expect(() => writer.send({ command: 'start' })).toThrow('closed');
});

test('pipe errors and close fail once, discard queued commands and detach drain listeners', async () => {
  for (const fail of [true, false]) {
    const pipe = new SlowPipe();
    const errors: Error[] = [];
    const writer = new EngineCommandWriter(pipe, error => errors.push(error));
    writer.send({ command: 'configure' });
    writer.send({ command: 'start' });
    pipe.destroy(fail ? new Error('broken pipe') : undefined);
    await new Promise(resolve => setImmediate(resolve));
    expect(errors).toHaveLength(1);
    expect(pipe.commands).toEqual(['configure']);
    expect(pipe.listenerCount('drain')).toBe(0);
    expect(pipe.listenerCount('close')).toBe(0);
    expect(() => writer.send({ command: 'start' })).toThrow('closed');
  }
});
