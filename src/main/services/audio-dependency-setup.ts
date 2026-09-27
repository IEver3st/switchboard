import { z } from 'zod';
import { audioDependencyStateSchema, type AudioDependencyState } from '../../shared/contracts';

export const audioSetupInventorySchema = z.object({
  cable: z.boolean(), microphone: z.boolean(), microphoneRateReady: z.boolean(), bootTimeMs: z.number().finite(),
  defaults: z.array(z.object({ flow: z.enum(['Render', 'Capture']), role: z.number().int().min(0).max(2), id: z.string().min(1).max(512) })).max(6),
  registered: z.object({ cable: z.boolean(), microphone: z.boolean() }),
});
export type AudioSetupInventory = z.infer<typeof audioSetupInventorySchema>;
export type AudioDependency = 'cable' | 'microphone';
export class AudioSetupCancelled extends Error {
  constructor() { super('Windows administrator approval was cancelled. Nothing was installed; retry when ready.'); }
}
export interface AudioSetupBackend {
  inspect(): Promise<AudioSetupInventory>;
  receipt(): Promise<number | null>;
  record(bootTimeMs: number | null): Promise<void>;
  acquire(): Promise<() => Promise<void>>;
  download(kind: AudioDependency, signal: AbortSignal, progress: (percent: number) => void): Promise<string>;
  install(kind: AudioDependency, directory: string, before: AudioSetupInventory): Promise<void>;
  configure(before: AudioSetupInventory): Promise<AudioSetupInventory>;
}

/** Explicit user action only. No startup downloads, idle polling or audio engine. */
export class AudioDependencySetup {
  private state = audioDependencyStateSchema.parse({});
  private pending: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private disposed = false;
  constructor(private readonly backend: AudioSetupBackend, private readonly publish: (state: AudioDependencyState) => void) {}
  private update(patch: Partial<AudioDependencyState>) {
    this.state = audioDependencyStateSchema.parse({ ...this.state, ...patch });
    if (!this.disposed) this.publish(this.state);
  }
  start(install: boolean): void {
    if (this.disposed) throw new Error('Audio setup is shutting down.');
    if (this.pending) throw new Error('Audio setup is already running.');
    this.abort = new AbortController();
    this.update({ phase: 'checking', current: null, progress: null, error: null });
    this.pending = this.run(install, this.abort.signal).catch(error => {
      this.update({ phase: 'error', current: null, progress: null, error: String(error instanceof Error ? error.message : error).slice(0, 1000) });
    }).finally(() => { this.pending = null; this.abort = null; });
  }
  async settled(): Promise<void> { await this.pending; }
  cancel(): void {
    if (this.state.phase === 'installing') throw new Error('Close the Windows installer to cancel installation.');
    this.abort?.abort(new Error('Audio setup cancelled. You can retry whenever you are ready.'));
  }
  dispose(): void {
    this.disposed = true;
    // An elevated vendor installer finishes independently, including default restoration.
    this.abort?.abort(new Error('Audio setup stopped because Switchboard closed.'));
  }
  private async run(install: boolean, signal: AbortSignal) {
    let release: (() => Promise<void>) | undefined;
    try {
      if (install) release = await this.backend.acquire();
      let inventory = audioSetupInventorySchema.parse(await this.backend.inspect());
      signal.throwIfAborted();
      this.update({ cable: inventory.cable, microphone: inventory.microphone });
      const receipt = await this.backend.receipt();
      let restart = receipt !== null && Math.abs(receipt - inventory.bootTimeMs) < 60_000;
      if (install && !restart) {
        for (const kind of ['cable', 'microphone'] as const) {
          if (inventory[kind]) continue;
          if (inventory.registered[kind]) throw new Error(`${kind === 'cable' ? 'VB-CABLE' : 'Hi-Fi Cable'} is already installed but its audio devices are unavailable. Enable its devices in Windows Sound settings and restart Windows before trying again.`);
          this.update({ phase: 'downloading', current: kind, progress: 0 });
          const directory = await this.backend.download(kind, signal, progress => this.update({ progress }));
          signal.throwIfAborted();
          // A durable boot marker survives app closure while the external installer runs.
          await this.backend.record(inventory.bootTimeMs);
          this.update({ phase: 'installing', current: kind, progress: null });
          try { await this.backend.install(kind, directory, inventory); }
          catch (error) {
            if (error instanceof AudioSetupCancelled) await this.backend.record(restart ? inventory.bootTimeMs : receipt);
            throw error;
          }
          signal.throwIfAborted();
          inventory = audioSetupInventorySchema.parse(await this.backend.inspect());
          this.update({ cable: inventory.cable, microphone: inventory.microphone });
          if (!inventory[kind] && !inventory.registered[kind]) {
            await this.backend.record(restart ? inventory.bootTimeMs : receipt);
            throw new Error('The audio driver was not installed. Reopen setup and complete the Install step in the Windows installer.');
          }
          restart = true;
          if (!inventory[kind]) {
            this.update({ phase: 'restart-required', current: null });
            return; // It may be installed but not enumerable until reboot. Never launch twice.
          }
        }
        inventory = audioSetupInventorySchema.parse(await this.backend.configure(inventory));
      }
      this.update({ cable: inventory.cable, microphone: inventory.microphone, current: null, progress: null,
        phase: restart ? 'restart-required' : inventory.cable && inventory.microphone && inventory.microphoneRateReady ? 'ready' : 'idle' });
    } finally { await release?.(); }
  }
}
