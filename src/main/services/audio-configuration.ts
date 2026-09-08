import { audioStateSchema, type AudioHostSnapshot, type AudioState } from '../../shared/contracts';
import { microphoneDspConfigurationApplied, microphoneInputApplied, microphoneMonitoringApplied } from '../../shared/microphone-runtime';

const preferenceKeys = [
  'outputDevice', 'microphoneDevice', 'mixes', 'chatMix', 'monitoring',
  'monitoringEnabled', 'monitoringDeviceId', 'buses', 'micProcessors',
  'channelProcessing', 'pathPresets', 'activePresetIds',
] as const satisfies readonly (keyof AudioState)[];

export function applyAudioPreferenceChanges(current: AudioState, before: AudioState, next: AudioState): void {
  for (const key of preferenceKeys) {
    if (JSON.stringify(before[key]) === JSON.stringify(next[key])) continue;
    // Runtime inventory, host capabilities and engine lifecycle remain main-owned.
    if (key === 'buses') {
      current.buses = next.buses.map(bus => ({
        ...bus, appCount: current.buses.find(item => item.id === bus.id)?.appCount ?? 0,
      }));
    } else Object.assign(current, { [key]: structuredClone(next[key]) });
  }
}

type Dependencies = {
  read: () => AudioState;
  configure: (audio: AudioState) => Promise<AudioHostSnapshot>;
  commit: (before: AudioState, next: AudioState) => void;
  publish: (host: AudioHostSnapshot) => void;
};

// No second state store: each queued intent reads the latest canonical snapshot.
// Failed requests never persist their desired values, and later edits still run.
export class AudioConfiguration {
  private tail: Promise<unknown> = Promise.resolve();
  public constructor(private readonly dependencies: Dependencies) {}

  public run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }

  public update(change: (audio: AudioState) => void): Promise<void> {
    return this.run(async () => {
      const before = this.dependencies.read();
      const draft = structuredClone(before);
      change(draft);
      const next = audioStateSchema.parse(draft);
      let host: AudioHostSnapshot | undefined;
      const changesHost = preferenceKeys.some(key => key !== 'pathPresets' && key !== 'activePresetIds'
        && JSON.stringify(before[key]) !== JSON.stringify(next[key]));
      if (before.enabled && changesHost) {
        try {
          host = await this.dependencies.configure(next);
          assertAudioConfigurationApplied(before, next, host);
        } catch (error) {
          // The host may have partially opened a device before reporting failure.
          // Reconcile to current confirmed preferences without undoing other work.
          try { this.dependencies.publish(await this.dependencies.configure(this.dependencies.read())); }
          catch { /* Host exit recovery owns unavailable runtime state. */ }
          throw error;
        }
      }
      this.dependencies.commit(before, next);
      if (host) this.dependencies.publish(host);
    });
  }
}

export function assertAudioConfigurationApplied(before: AudioState, next: AudioState, host: AudioHostSnapshot): void {
  if (!host.running) throw new Error('The audio engine stopped before accepting the change.');
  const applied = { ...next, host };
  if (JSON.stringify(before.mixes) !== JSON.stringify(next.mixes)
    && JSON.stringify(next.mixes) !== JSON.stringify(host.mixes)) {
    throw new Error('The audio engine did not accept the mix levels.');
  }
  const inputChanged = before.buses.find(bus => bus.id === 'mic')?.deviceId !== next.buses.find(bus => bus.id === 'mic')?.deviceId;
  if (inputChanged && !microphoneInputApplied(applied)) {
    throw new Error(host.microphone?.error ?? 'The selected microphone could not start.');
  }
  if (JSON.stringify(before.micProcessors) !== JSON.stringify(next.micProcessors)
    && (!microphoneDspConfigurationApplied(applied) || host.capabilities.microphoneDsp !== 'available')) {
    throw new Error(host.microphone?.error ?? 'The microphone did not accept its processing settings.');
  }
  const monitoringChanged = before.monitoringEnabled !== next.monitoringEnabled
    || before.monitoringDeviceId !== next.monitoringDeviceId || before.monitoring !== next.monitoring;
  if (monitoringChanged && !microphoneMonitoringApplied(applied)) {
    throw new Error(host.microphone?.error ?? 'The monitoring output did not accept the change.');
  }
  if (before.capabilities.virtualChannels === 'available' && host.capabilities.virtualChannels !== 'available') {
    throw new Error(host.error ?? 'The audio route could not accept the change.');
  }
}
