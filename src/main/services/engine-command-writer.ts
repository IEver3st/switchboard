import type { Writable } from 'node:stream';

type QueuedCommand = { data: string; bytes: number };

/** One bounded FIFO per host. A false write has already accepted the command. */
export class EngineCommandWriter {
  private readonly queue: QueuedCommand[] = [];
  private queuedBytes = 0;
  private blocked = false;
  private closed = false;

  constructor(
    private readonly stream: Writable,
    private readonly onError: (error: Error) => void,
    private readonly maxBufferedBytes = 1024 * 1024,
  ) {
    stream.on('drain', this.onDrain);
    stream.on('error', this.onStreamError);
    stream.on('close', this.onClose);
  }

  send(message: Record<string, unknown>): () => void {
    if (this.closed || this.stream.destroyed || this.stream.writableEnded) {
      throw new Error('Engine command pipe is closed.');
    }
    const data = `${JSON.stringify(message)}\n`;
    const entry = { data, bytes: Buffer.byteLength(data) };
    if (this.queuedBytes + this.stream.writableLength + entry.bytes > this.maxBufferedBytes) {
      throw new Error('Engine command queue is full; the host is not consuming commands.');
    }
    this.queue.push(entry);
    this.queuedBytes += entry.bytes;
    this.flush();
    // A request that expires before drain must never be applied later.
    return () => {
      const index = this.queue.indexOf(entry);
      if (index < 0) return;
      this.queue.splice(index, 1);
      this.queuedBytes -= entry.bytes;
    };
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.stream.removeListener('drain', this.onDrain);
    this.stream.removeListener('error', this.onStreamError);
    this.stream.removeListener('close', this.onClose);
  }

  private flush(): void {
    while (!this.closed && !this.blocked && this.queue.length) {
      const entry = this.queue.shift()!;
      this.queuedBytes -= entry.bytes;
      try {
        this.blocked = !this.stream.write(entry.data, 'utf8');
      } catch (error) {
        this.onStreamError(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
  }

  private readonly onDrain = (): void => {
    this.blocked = false;
    try { this.flush(); } catch { /* onStreamError already failed the host requests. */ }
  };

  private readonly onStreamError = (error: Error): void => {
    if (this.closed) return;
    this.dispose();
    this.onError(error);
  };

  private readonly onClose = (): void => this.onStreamError(new Error('Engine command pipe closed.'));
}
