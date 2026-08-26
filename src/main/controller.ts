import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, shell } from 'electron';
import { z } from 'zod';
import {
  captureConfigSchema,
  type CaptureConfig,
  type EngineStatus,
  type SetAudioBusGainInput,
  type SetDeviceSettingInput,
  type SetMicProcessorInput,
  type SetModuleStateInput,
  type SystemSnapshot,
  type UpdateSettingsInput,
} from '../shared/contracts';
import { EngineSupervisor } from './services/engine-supervisor';
import { StateStore } from './services/state-store';

const workerSavedClipSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  durationSeconds: z.number().positive(),
  sizeMb: z.number().nonnegative(),
  createdAt: z.string().min(1),
  prototype: z.boolean().optional(),
});

type WorkerSavedClip = z.infer<typeof workerSavedClipSchema>;

export class AppController {
  private readonly store: StateStore;
  private readonly engines: EngineSupervisor;

  public constructor() {
    this.store = new StateStore(join(app.getPath('userData'), 'switchboard-state.json'));
    this.engines = new EngineSupervisor((status) => this.applyEngineStatus(status));
  }

  public async initialize(): Promise<void> {
    await this.store.load();
    const snapshot = this.store.get();
    this.applyLoginItemSetting(snapshot.settings.launchAtStartup);

    const starts: Promise<unknown>[] = [];
    if (snapshot.audio.enabled) starts.push(this.startAudioEngine());
    if (snapshot.capture.config.enabled) starts.push(this.startCaptureEngine());
    const results = await Promise.allSettled(starts);
    for (const result of results) {
      if (result.status === 'rejected') console.error('Failed to restore an enabled engine.', result.reason);
    }
  }

  public getSnapshot(): SystemSnapshot {
    return this.store.get();
  }

  public subscribe(listener: (snapshot: SystemSnapshot) => void): () => void {
    return this.store.subscribe(listener);
  }

  public setRendererActive(active: boolean): SystemSnapshot {
    return this.store.setRendererActive(active);
  }

  public async setModuleState(input: SetModuleStateInput): Promise<SystemSnapshot> {
    const module = this.store.get().modules.find((candidate) => candidate.id === input.moduleId);
    if (!module) throw new Error(`Unknown module: ${input.moduleId}`);

    if (module.kind === 'capture') return this.setCaptureConfig({ enabled: input.enabled });
    if (module.kind === 'audio') return this.setAudioEnabled(input.enabled);

    return this.store.update((draft) => {
      const target = draft.modules.find((candidate) => candidate.id === input.moduleId);
      if (!target) throw new Error(`Unknown module: ${input.moduleId}`);
      target.installed = target.installed || input.enabled;
      target.enabled = input.enabled;
    });
  }

  public setDeviceSetting(input: SetDeviceSettingInput): SystemSnapshot {
    return this.store.update((draft) => {
      const device = draft.devices.find((candidate) => candidate.id === input.deviceId);
      if (!device) throw new Error(`Unknown device: ${input.deviceId}`);
      if (!Object.hasOwn(device.settings, input.key)) {
        throw new Error(`Unsupported setting for ${device.name}: ${input.key}`);
      }
      device.settings[input.key] = input.value;
    });
  }

  public async setAudioEnabled(enabled: boolean): Promise<SystemSnapshot> {
    const current = this.store.get().audio.enabled;
    if (current === enabled) return this.store.get();

    if (enabled) await this.startAudioEngine();
    else await this.engines.stop('audio');

    return this.store.update((draft) => {
      draft.audio.enabled = enabled;
      const module = draft.modules.find((candidate) => candidate.id === 'capability.audio-router');
      if (module) {
        module.installed = true;
        module.enabled = enabled;
      }
    });
  }

  public setAudioBusGain(input: SetAudioBusGainInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const bus = draft.audio.buses.find((candidate) => candidate.id === input.busId);
      if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);
      bus.gain = input.gain;
    });
    this.engines.send('audio', 'setBusGain', input);
    return snapshot;
  }

  public setChatMix(value: number): SystemSnapshot {
    const normalized = Math.max(-1, Math.min(1, value));
    const snapshot = this.store.update((draft) => {
      draft.audio.chatMix = normalized;
      const game = draft.audio.buses.find((bus) => bus.id === 'game');
      const chat = draft.audio.buses.find((bus) => bus.id === 'chat');
      if (game && chat) {
        game.gain = Math.max(0.2, Math.min(1.2, 0.85 - normalized * 0.35));
        chat.gain = Math.max(0.2, Math.min(1.2, 0.85 + normalized * 0.35));
      }
    });
    this.engines.send('audio', 'setChatMix', { value: normalized });
    return snapshot;
  }

  public setMicProcessor(input: SetMicProcessorInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      const processor = draft.audio.micProcessors.find((candidate) => candidate.id === input.processorId);
      if (!processor) throw new Error(`Unknown microphone processor: ${input.processorId}`);
      processor.enabled = input.enabled;
    });
    this.engines.send('audio', 'setMicProcessor', input);
    return snapshot;
  }

  public async setCaptureConfig(input: Partial<CaptureConfig>): Promise<SystemSnapshot> {
    const before = this.store.get();
    const nextConfig = captureConfigSchema.parse({ ...before.capture.config, ...input });

    if (!before.capture.config.enabled && nextConfig.enabled) await this.startCaptureEngine();
    if (before.capture.config.enabled && !nextConfig.enabled) await this.engines.stop('capture');

    const snapshot = this.store.update((draft) => {
      draft.capture.config = nextConfig;
      const module = draft.modules.find((candidate) => candidate.id === 'capability.replay');
      if (module) {
        module.installed = true;
        module.enabled = nextConfig.enabled;
      }
    });

    if (nextConfig.enabled) this.engines.send('capture', 'configure', nextConfig);
    return snapshot;
  }

  public async saveReplay(): Promise<SystemSnapshot> {
    const snapshot = this.store.get();
    if (!snapshot.capture.config.enabled) {
      throw new Error('Enable Instant Replay before saving a clip.');
    }

    const clipDirectory = join(app.getPath('videos'), 'Switchboard Clips');
    const response = await this.engines.request<WorkerSavedClip>('capture', 'saveReplay', {
      directory: clipDirectory,
      replaySeconds: snapshot.capture.config.replaySeconds,
    });
    const result = workerSavedClipSchema.parse(response);

    return this.store.update((draft) => {
      draft.capture.runtime.lastSavedAt = result.createdAt;
      draft.clips.unshift({
        id: randomUUID(),
        name: result.name,
        game: 'Active game',
        durationSeconds: result.durationSeconds,
        sizeMb: result.sizeMb,
        createdAt: result.createdAt,
        path: result.path,
        prototype: result.prototype ?? true,
      });
      draft.clips = draft.clips.slice(0, 12);
    });
  }

  public updateSettings(input: UpdateSettingsInput): SystemSnapshot {
    const snapshot = this.store.update((draft) => {
      draft.settings = { ...draft.settings, ...input };
    });

    if (typeof input.launchAtStartup === 'boolean') {
      this.applyLoginItemSetting(input.launchAtStartup);
    }
    return snapshot;
  }

  public async revealClip(path: string): Promise<void> {
    const knownClip = this.store.get().clips.find((clip) => clip.path === path);
    if (!knownClip) throw new Error('Rejected an unknown clip path.');
    if (!existsSync(knownClip.path)) throw new Error('The clip file no longer exists.');
    shell.showItemInFolder(knownClip.path);
  }

  public async dispose(): Promise<void> {
    await this.engines.dispose();
    await this.store.flush();
  }

  private async startAudioEngine(): Promise<void> {
    await this.engines.start('audio');
    this.engines.send('audio', 'configure', this.store.get().audio);
  }

  private async startCaptureEngine(): Promise<void> {
    await this.engines.start('capture');
    this.engines.send('capture', 'configure', this.store.get().capture.config);
  }

  private applyLoginItemSetting(enabled: boolean): void {
    if (!['win32', 'darwin'].includes(process.platform)) return;
    try {
      app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
    } catch (error) {
      console.warn('Failed to update launch-at-startup state.', error);
    }
  }

  private applyEngineStatus(status: EngineStatus): void {
    this.store.update(
      (draft) => {
        const index = draft.engines.findIndex((engine) => engine.kind === status.kind);
        if (index >= 0) draft.engines[index] = status;
        else draft.engines.push(status);

        if (status.kind === 'capture' && status.state === 'running') {
          const progress = Math.min(draft.capture.config.replaySeconds, Math.floor(status.uptimeSeconds));
          draft.capture.runtime.bufferedSeconds = progress;
          draft.capture.runtime.segmentCount = Math.ceil(progress / 2);
          draft.capture.runtime.estimatedDiskMb = Math.round(progress * 3.75);
        }

        if (status.kind === 'capture' && status.state !== 'running') {
          draft.capture.runtime.bufferedSeconds = 0;
          draft.capture.runtime.segmentCount = 0;
          draft.capture.runtime.estimatedDiskMb = 0;
        }
      },
      { persist: false },
    );
  }
}
