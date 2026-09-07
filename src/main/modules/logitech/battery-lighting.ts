import type { BatteryCapability, LightingCapability, MouseBatteryLightingPolicy } from '../../../shared/contracts';

type Status = NonNullable<LightingCapability['batteryStatus']>;
type Override = 'red' | 'off' | null;

export interface BatteryLightingIo {
  apply(value: Override): Promise<void>;
  enqueue(task: () => Promise<void>): void;
  now(): number;
  schedule(task: () => void, delay: number): () => void;
}

/** Reuses discovery readings; one cancellable timer advances a three-flash burst. */
export class MouseBatteryLighting {
  public status: Status = 'monitoring';
  public reason: string | undefined;
  private override: Override = null;
  private cancelFlash: (() => void) | undefined;
  private lastFlashAt = Number.NEGATIVE_INFINITY;
  private warningFailure: string | undefined;
  private generation = 0;
  private closed = false;

  public constructor(private readonly io: BatteryLightingIo) {}

  public async update(policy: MouseBatteryLightingPolicy, battery: BatteryCapability | undefined): Promise<void> {
    if (this.closed) return;
    const fresh = battery && this.io.now() - battery.updatedAt <= 15_000 && battery.updatedAt <= this.io.now();
    const status: Status = !policy.flashEnabled && !policy.cutoffEnabled ? 'disabled'
      : !fresh ? 'unavailable'
      : battery.charging || battery.fullyCharged ? 'charging'
      : policy.cutoffEnabled && battery.percentage <= policy.cutoffPercentage ? 'cutoff'
      : policy.flashEnabled && battery.percentage <= policy.warningPercentage ? 'warning'
      : 'monitoring';
    try {
      if (this.status === 'error') await this.restore();
      if (status === 'cutoff') {
        this.clearTimer();
        if (this.override !== 'off') await this.apply('off');
      } else if (status !== 'warning') {
        await this.restore();
      } else if (this.override === 'off' && !this.cancelFlash) {
        await this.restore();
      }
      if (status === 'warning' && this.override === null && this.io.now() - this.lastFlashAt >= policy.flashIntervalMinutes * 60_000) {
        // Rate-limit failed attempts too, so an unavailable mouse is not hammered.
        this.lastFlashAt = this.io.now();
        try {
          await this.apply('red');
          this.warningFailure = undefined;
        } catch (error) {
          this.warningFailure = error instanceof Error ? error.message : 'mouse unavailable';
          throw error;
        }
        this.scheduleFlashStep(++this.generation, 3, true);
      }
      this.status = status;
      this.reason = status === 'unavailable' ? 'Waiting for a fresh mouse battery reading.' : undefined;
      if (status !== 'warning') this.warningFailure = undefined;
      else if (this.warningFailure) this.fail(new Error(this.warningFailure));
    } catch (error) {
      this.fail(error);
      // A partial HID write can change LEDs even when the complete command fails.
      try { await this.restore(); } catch { /* Retry restoration on the next discovery. */ }
    }
  }

  public async restore(): Promise<void> {
    this.clearTimer();
    if (this.override === null) return;
    await this.io.apply(null);
    this.override = null;
  }

  private scheduleFlashStep(generation: number, remaining: number, red: boolean): void {
    this.cancelFlash = this.io.schedule(() => this.io.enqueue(async () => {
      if (this.closed || generation !== this.generation) return;
      this.cancelFlash?.();
      this.cancelFlash = undefined;
      try {
        if (red && remaining === 1) {
          await this.restore();
          return;
        }
        await this.apply(red ? 'off' : 'red');
        this.scheduleFlashStep(generation, red ? remaining - 1 : remaining, !red);
      } catch (error) {
        this.fail(error);
        this.warningFailure = error instanceof Error ? error.message : 'mouse unavailable';
        try { await this.restore(); } catch { /* Retry restoration on discovery. */ }
      }
    }), red ? 2_000 : 500);
  }

  public async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try { await this.restore(); } catch { /* Session shutdown still releases the HID handle. */ }
  }

  private async apply(value: Override): Promise<void> {
    this.override = value;
    await this.io.apply(value);
  }

  private clearTimer(): void {
    this.generation += 1;
    this.cancelFlash?.();
    this.cancelFlash = undefined;
  }

  private fail(error: unknown): void {
    this.status = 'error';
    this.reason = `Battery lighting could not be applied: ${error instanceof Error ? error.message : 'mouse unavailable'}`;
  }
}
