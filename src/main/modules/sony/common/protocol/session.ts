import { encodeSonyFrame, SonyFrameDecoder, sonyFrameType, type SonyFrame } from './frame';
import type { SonyHeadphonesHost } from '../transport/host';

export class SonyMdrSession {
  private readonly decoder = new SonyFrameDecoder();
  private sequence: 0 | 1 = 0;
  private queue = Promise.resolve();
  private ack: (() => void) | null = null;
  private removeData: () => void;

  public constructor(
    private readonly host: SonyHeadphonesHost,
    public readonly token: string,
    private readonly onFrame: (frame: SonyFrame) => void,
  ) {
    this.removeData = host.onData((token, bytes) => {
      if (token !== this.token) return;
      for (const frame of this.decoder.feed(bytes)) void this.receive(frame);
    });
  }

  public get malformedFrameCount(): number { return this.decoder.malformedFrameCount; }
  public send(payload: Uint8Array): Promise<void> {
    const operation = this.queue.then(() => this.sendOne(payload));
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  public dispose(): void { this.removeData(); this.ack = null; }

  private async sendOne(payload: Uint8Array): Promise<void> {
    const acknowledged = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.ack = null; reject(new Error('Sony headphones did not acknowledge the command.')); }, 1_200);
      timer.unref();
      this.ack = () => { clearTimeout(timer); this.ack = null; resolve(); };
    });
    try {
      await this.host.send(this.token, encodeSonyFrame({ type: sonyFrameType.dataMdr, sequence: this.sequence, payload }));
      await acknowledged;
    } catch (error) {
      this.ack = null;
      throw error;
    }
    this.sequence = this.sequence === 0 ? 1 : 0;
  }

  private async receive(frame: SonyFrame): Promise<void> {
    if (frame.type === sonyFrameType.ack) { this.ack?.(); return; }
    await this.host.send(this.token, encodeSonyFrame({ type: sonyFrameType.ack, sequence: frame.sequence === 0 ? 1 : 0, payload: new Uint8Array() }));
    this.onFrame(frame);
  }
}
