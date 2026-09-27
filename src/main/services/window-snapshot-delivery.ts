import type { SystemSnapshot } from '../../shared/contracts';
import { SnapshotPublisher, type SnapshotFrame } from '../../shared/snapshot-stream';

type WindowLifecycle = {
  isVisible(): boolean;
  isMinimized(): boolean;
  on(event: string, listener: () => void): unknown;
  prependListener(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
};

/** A hidden window retains one latest snapshot, never a queue of missed frames. */
export class WindowSnapshotDelivery {
  private readonly publisher = new SnapshotPublisher();
  private pending: SystemSnapshot | null = null;
  private active: boolean;
  private disposed = false;
  private readonly pause = (): void => { this.active = false; };
  private readonly resume = (): void => {
    this.active = !this.window.isMinimized() && (this.window.isVisible() || this.hiddenReview);
    if (this.active && this.pending) {
      const snapshot = this.pending;
      this.pending = null;
      this.send(this.publisher.next(snapshot));
    }
  };

  constructor(
    private readonly window: WindowLifecycle,
    private readonly send: (frame: SnapshotFrame) => void,
    private readonly hiddenReview = false,
  ) {
    this.active = !window.isMinimized() && (window.isVisible() || hiddenReview);
    // Pause before controller listeners can publish the visibility transition.
    window.prependListener('hide', this.pause);
    window.prependListener('minimize', this.pause);
    window.on('show', this.resume);
    window.on('restore', this.resume);
  }

  publish(snapshot: SystemSnapshot, baseline = false): void {
    if (this.disposed) return;
    // Explicit subscriptions/reloads always receive their requested baseline.
    if (!this.active && !baseline) { this.pending = snapshot; return; }
    this.pending = null;
    this.send(this.publisher.next(snapshot, baseline));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null;
    this.window.removeListener('hide', this.pause);
    this.window.removeListener('minimize', this.pause);
    this.window.removeListener('show', this.resume);
    this.window.removeListener('restore', this.resume);
  }
}
