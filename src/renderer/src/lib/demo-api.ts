import type {
  ApplyAudioPresetInput,
  AudioMeterFrame,
  CaptureConfig,
  SetAudioBusDeviceInput,
  SetAudioBusEnabledInput,
  SetAudioBusGainInput,
  SetDeviceAppearanceOverrideInput,
  SetDeviceSettingInput,
  SetMicProcessorInput,
  SetModuleStateInput,
  SettingsResetScope,
  SwitchboardApi,
  SystemSnapshot,
  UpdateSettingsInput,
} from '../../../shared/contracts';
import { micProcessorSchema } from '../../../shared/contracts';
import { resolveDeviceVariant } from '../../../shared/device-variant';
import { resolveProductAsset } from '../../../shared/product-assets';
import { createDefaultSnapshot } from '../../../shared/defaults';

let snapshot = createDefaultSnapshot();
const listeners = new Set<(value: SystemSnapshot) => void>();
const audioMeterListeners = new Set<(frame: AudioMeterFrame) => void>();
let engineTimer: number | undefined;
let audioMeterTimer: number | undefined;
let meterSequence = 0;
let meterPhase = 0;

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
    snapshot.capture.runtime.replayCacheBytes = 0;
  }
  recalculate();
  ensureTimer();
  if (kind === 'audio') syncAudioMeterTimer();
}

function syncAudioMeterTimer(): void {
  const shouldRun = snapshot.audio.enabled && audioMeterListeners.size > 0;
  if (!shouldRun && audioMeterTimer !== undefined) {
    window.clearInterval(audioMeterTimer);
    audioMeterTimer = undefined;
    return;
  }
  if (!shouldRun || audioMeterTimer !== undefined) return;

  audioMeterTimer = window.setInterval(() => {
    meterPhase += 0.17;
    const frame: AudioMeterFrame = {
      sequence: meterSequence++,
      timestamp: new Date().toISOString(),
      values: snapshot.audio.buses.map((bus, index) => {
        const movement = 0.52 + Math.sin(meterPhase + index * 1.31) * 0.22 + Math.sin(meterPhase * 0.43 + index) * 0.12;
        const level = bus.enabled && !bus.muted
          ? Math.max(0, Math.min(1, bus.meter * movement * Math.min(1.25, bus.gain + 0.18)))
          : 0;
        const peak = Math.min(1, level + 0.055);
        return { busId: bus.id, level, peak, clipping: peak >= 0.985 };
      }),
    };
    for (const listener of audioMeterListeners) listener(frame);
  }, 50);
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
    snapshot.audio.activePresetId = null;
    return emit();
  },
  async setDeviceAppearanceOverride(input: SetDeviceAppearanceOverrideInput) {
    const device = snapshot.devices.find((candidate) => candidate.id === input.deviceId);
    if (!device) return emit();
    if (input.override) snapshot.settings.deviceAppearanceOverrides[input.deviceId] = input.override;
    else delete snapshot.settings.deviceAppearanceOverrides[input.deviceId];
    if (device.variantResolution.confidence !== 'hardware') {
      const resolved = resolveDeviceVariant(
        { ...device.identity, variant: undefined, colorway: undefined },
        [],
        input.override ?? undefined,
      );
      device.identity = resolved.identity;
      device.variantResolution = resolved.resolution;
      device.asset = resolveProductAsset(resolved.identity, device.kind);
    }
    return emit();
  },
  async setAudioBusEnabled(input: SetAudioBusEnabledInput) {
    const bus = snapshot.audio.buses.find((candidate) => candidate.id === input.busId);
    if (bus) bus.enabled = input.enabled;
    snapshot.audio.activePresetId = null;
    return emit();
  },
  async setAudioBusDevice(input: SetAudioBusDeviceInput) {
    const bus = snapshot.audio.buses.find((candidate) => candidate.id === input.busId);
    const device = snapshot.audio.devices.find((candidate) => candidate.id === input.deviceId);
    if (bus && device) {
      bus.deviceId = device.id;
      if (bus.id === 'mic') snapshot.audio.microphoneDevice = device.name;
      if (bus.id === 'game') snapshot.audio.outputDevice = device.name;
    }
    snapshot.audio.activePresetId = null;
    return emit();
  },
  async applyAudioPreset(input: ApplyAudioPresetInput) {
    const preset = snapshot.audio.presets.find((candidate) => candidate.id === input.presetId);
    if (!preset) return emit();
    for (const presetBus of preset.buses) {
      const bus = snapshot.audio.buses.find((candidate) => candidate.id === presetBus.busId);
      if (!bus) continue;
      bus.enabled = presetBus.enabled;
      bus.gain = presetBus.gain;
      bus.deviceId = presetBus.deviceId;
    }
    for (const presetProcessor of preset.micProcessors) {
      const processor = snapshot.audio.micProcessors.find((candidate) => candidate.id === presetProcessor.processorId);
      if (processor) processor.enabled = presetProcessor.enabled;
    }
    snapshot.audio.chatMix = preset.chatMix;
    snapshot.audio.activePresetId = preset.id;
    const gameBus = snapshot.audio.buses.find((candidate) => candidate.id === 'game');
    const micBus = snapshot.audio.buses.find((candidate) => candidate.id === 'mic');
    const output = gameBus ? snapshot.audio.devices.find((candidate) => candidate.id === gameBus.deviceId) : undefined;
    const microphone = micBus ? snapshot.audio.devices.find((candidate) => candidate.id === micBus.deviceId) : undefined;
    if (output) snapshot.audio.outputDevice = output.name;
    if (microphone) snapshot.audio.microphoneDevice = microphone.name;
    return emit();
  },
  async setChatMix(value: number) {
    snapshot.audio.chatMix = value;
    snapshot.audio.activePresetId = null;
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
    if (processor) {
      const index = snapshot.audio.micProcessors.indexOf(processor);
      snapshot.audio.micProcessors[index] = micProcessorSchema.parse({
        ...processor,
        enabled: input.enabled ?? processor.enabled,
        parameters: { ...processor.parameters, ...input.parameters },
      });
    }
    snapshot.audio.activePresetId = null;
    return emit();
  },
  subscribeAudioMeters(listener) {
    audioMeterListeners.add(listener);
    syncAudioMeterTimer();
    return () => {
      audioMeterListeners.delete(listener);
      syncAudioMeterTimer();
    };
  },
  async setCaptureConfig(input: Partial<CaptureConfig>) {
    if (input.enabled) throw new Error('Instant Replay is available only in the Switchboard desktop application.');
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
    throw new Error('Saving a real replay requires the Switchboard desktop capture host.');
  },
  async chooseClipDirectory() { throw new Error('Folder selection requires the Switchboard desktop application.'); },
  async openClipsDirectory() { throw new Error('Opening the Clips folder requires the Switchboard desktop application.'); },
  async refreshCaptureSources() { return emit(); },
  async updateSettings(input: UpdateSettingsInput) {
    snapshot.settings = { ...snapshot.settings, ...input };
    return emit();
  },
  async resetSettings(scope: SettingsResetScope) {
    const defaults = createDefaultSnapshot();
    if (scope === 'all') snapshot = defaults;
    if (scope === 'general') {
      snapshot.settings.launchAtStartup = defaults.settings.launchAtStartup;
      snapshot.settings.closeToTray = defaults.settings.closeToTray;
      snapshot.settings.destroyRendererInTray = defaults.settings.destroyRendererInTray;
    }
    if (scope === 'audio') snapshot.audio = defaults.audio;
    if (scope === 'capture') snapshot.capture.config = defaults.capture.config;
    if (scope === 'modules') snapshot.settings.automaticModuleUpdates = defaults.settings.automaticModuleUpdates;
    if (scope === 'diagnostics') {
      snapshot.settings.performanceGuard = defaults.settings.performanceGuard;
      snapshot.settings.diagnosticsRetentionDays = defaults.settings.diagnosticsRetentionDays;
      snapshot.settings.deviceAppearanceOverrides = {};
    }
    return emit();
  },
  async revealClip() {},
  async deleteClip() { return emit(); },
  async renameClip() { return emit(); },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const switchboardApi: SwitchboardApi = window.switchboard ?? demoApi;
