import type {
  CaptureConfig,
  SetAudioBusGainInput,
  SetDeviceSettingInput,
  SetMicProcessorInput,
  SetModuleStateInput,
  SwitchboardApi,
  SystemSnapshot,
  UpdateSettingsInput,
} from '../../../shared/contracts';
import { createDefaultSnapshot } from '../../../shared/defaults';

let snapshot = createDefaultSnapshot();
const listeners = new Set<(value: SystemSnapshot) => void>();
let engineTimer: number | undefined;

function emit(): SystemSnapshot {
  const value = structuredClone(snapshot);
  for (const listener of listeners) listener(value);
  return value;
}

function recalculate(): void {
  const running = snapshot.engines.filter((engine) => engine.state === 'running');
  const engineMemory = running.reduce((sum, engine) => sum + engine.memoryMb, 0);
  snapshot.performance = {
    ...snapshot.performance,
    totalMemoryMb: 136 + engineMemory,
    totalCpuPercent: 0.3 + running.reduce((sum, engine) => sum + engine.cpuPercent, 0),
    activeProcesses: 2 + running.length,
  };
}

function ensureTimer(): void {
  if (engineTimer !== undefined) return;
  engineTimer = window.setInterval(() => {
    let changed = false;
    for (const engine of snapshot.engines) {
      if (engine.state !== 'running') continue;
      engine.uptimeSeconds += 1;
      engine.cpuPercent = engine.kind === 'capture' ? 0.8 : 0.3;
      engine.memoryMb = engine.kind === 'capture' ? 31 : 24;
      changed = true;
      if (engine.kind === 'capture') {
        snapshot.capture.runtime.bufferedSeconds = Math.min(
          snapshot.capture.config.replaySeconds,
          snapshot.capture.runtime.bufferedSeconds + 1,
        );
        snapshot.capture.runtime.segmentCount = Math.ceil(snapshot.capture.runtime.bufferedSeconds / 2);
        snapshot.capture.runtime.estimatedDiskMb = snapshot.capture.runtime.bufferedSeconds * 3.75;
      }
    }
    if (changed) {
      recalculate();
      emit();
    }
  }, 1000);
}

function setEngine(kind: 'audio' | 'capture', enabled: boolean): void {
  const engine = snapshot.engines.find((candidate) => candidate.kind === kind);
  if (!engine) return;
  engine.state = enabled ? 'running' : 'stopped';
  engine.pid = enabled ? (kind === 'audio' ? 18432 : 18496) : undefined;
  engine.cpuPercent = enabled ? (kind === 'audio' ? 0.3 : 0.8) : 0;
  engine.memoryMb = enabled ? (kind === 'audio' ? 24 : 31) : 0;
  engine.uptimeSeconds = 0;
  engine.message = enabled ? 'Browser preview simulation active' : undefined;
  if (!enabled && kind === 'capture') {
    snapshot.capture.runtime.bufferedSeconds = 0;
    snapshot.capture.runtime.segmentCount = 0;
    snapshot.capture.runtime.estimatedDiskMb = 0;
  }
  recalculate();
  ensureTimer();
}

const demoApi: SwitchboardApi = {
  async getSnapshot() {
    ensureTimer();
    return structuredClone(snapshot);
  },
  async setModuleState(input: SetModuleStateInput) {
    const module = snapshot.modules.find((candidate) => candidate.id === input.moduleId);
    if (module) {
      module.installed = module.installed || input.enabled;
      module.enabled = input.enabled;
      if (module.kind === 'audio') {
        snapshot.audio.enabled = input.enabled;
        setEngine('audio', input.enabled);
      }
      if (module.kind === 'capture') {
        snapshot.capture.config.enabled = input.enabled;
        setEngine('capture', input.enabled);
      }
    }
    return emit();
  },
  async setDeviceSetting(input: SetDeviceSettingInput) {
    const device = snapshot.devices.find((candidate) => candidate.id === input.deviceId);
    if (device) device.settings[input.key] = input.value;
    return emit();
  },
  async setAudioEnabled(enabled: boolean) {
    snapshot.audio.enabled = enabled;
    const module = snapshot.modules.find((candidate) => candidate.id === 'capability.audio-router');
    if (module) {
      module.installed = true;
      module.enabled = enabled;
    }
    setEngine('audio', enabled);
    return emit();
  },
  async setAudioBusGain(input: SetAudioBusGainInput) {
    const bus = snapshot.audio.buses.find((candidate) => candidate.id === input.busId);
    if (bus) bus.gain = input.gain;
    return emit();
  },
  async setChatMix(value: number) {
    snapshot.audio.chatMix = value;
    const game = snapshot.audio.buses.find((bus) => bus.id === 'game');
    const chat = snapshot.audio.buses.find((bus) => bus.id === 'chat');
    if (game && chat) {
      game.gain = Math.max(0.2, Math.min(1.2, 0.85 - value * 0.35));
      chat.gain = Math.max(0.2, Math.min(1.2, 0.85 + value * 0.35));
    }
    return emit();
  },
  async setMicProcessor(input: SetMicProcessorInput) {
    const processor = snapshot.audio.micProcessors.find((candidate) => candidate.id === input.processorId);
    if (processor) processor.enabled = input.enabled;
    return emit();
  },
  async setCaptureConfig(input: Partial<CaptureConfig>) {
    snapshot.capture.config = { ...snapshot.capture.config, ...input };
    if (typeof input.enabled === 'boolean') {
      const module = snapshot.modules.find((candidate) => candidate.id === 'capability.replay');
      if (module) {
        module.installed = true;
        module.enabled = input.enabled;
      }
      setEngine('capture', input.enabled);
    }
    return emit();
  },
  async saveReplay() {
    const createdAt = new Date().toISOString();
    snapshot.capture.runtime.lastSavedAt = createdAt;
    snapshot.clips.unshift({
      id: crypto.randomUUID(),
      name: `Prototype replay · ${snapshot.capture.config.replaySeconds}s`,
      game: 'Active game',
      durationSeconds: snapshot.capture.config.replaySeconds,
      sizeMb: snapshot.capture.config.replaySeconds * 3.75,
      createdAt,
      path: 'Browser preview: no file written',
      prototype: true,
    });
    return emit();
  },
  async updateSettings(input: UpdateSettingsInput) {
    snapshot.settings = { ...snapshot.settings, ...input };
    return emit();
  },
  async revealClip() {},
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const switchboardApi: SwitchboardApi = window.switchboard ?? demoApi;
