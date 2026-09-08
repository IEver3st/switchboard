import { randomUUID } from 'node:crypto';
import { saveSceneInputSchema, type SaveSceneInput, type SceneValues, type SystemSnapshot } from '../../shared/contracts';
import { sceneDeviceCommands, sceneRestoreValues, snapshotSceneValues } from '../../shared/setup-scenes';
import type { StateStore } from './state-store';

type SceneIo = {
  audio(value: NonNullable<SceneValues['audio']>): Promise<void>;
  capture(value: NonNullable<SceneValues['capture']>): Promise<void>;
  device(id: string, change: ReturnType<typeof sceneDeviceCommands>[number]): Promise<void>;
};

export class SetupScenes {
  private busy = false;
  private idle: Promise<void> = Promise.resolve();
  private finish: (() => void) | undefined;
  private disposed = false;
  private running: string[] = [];
  private suppressed = new Set<string>();
  constructor(private readonly store: StateStore, private readonly io: SceneIo) {}

  save(raw: SaveSceneInput): SystemSnapshot {
    if (this.busy) throw new Error('Wait for the current scene to finish.');
    const input = saveSceneInputSchema.parse(raw);
    const snapshot = this.store.get();
    const previous = snapshot.setup.scenes.find(scene => scene.id === input.id);
    if (input.id && !previous) throw new Error('This scene no longer exists.');
    if (!previous && snapshot.setup.scenes.length >= 32) throw new Error('You can save up to 32 scenes.');
    if (input.automatic && !input.executable) throw new Error('Choose an executable for automatic switching.');
    if (input.automatic && snapshot.setup.scenes.some(scene => scene.id !== input.id && scene.automatic
      && scene.executable.toLowerCase() === input.executable.toLowerCase())) throw new Error('That application already has an automatic scene.');
    if (input.includeAudio && snapshot.settings.developerMode !== true && (input.captureCurrent || !previous))
      throw new Error('Enable Developer mode before including Audio in a scene.');
    const values = input.captureCurrent || !previous ? snapshotSceneValues(snapshot, input) : previous.values;
    if (!values.audio && !values.capture && !values.devices.length) throw new Error('Include at least one available part of your setup.');
    return this.store.update(draft => {
      const scene = { id: previous?.id ?? randomUUID(), name: input.name, executable: input.executable,
        automatic: input.automatic, restoreOnExit: input.restoreOnExit, values };
      if (previous) draft.setup.scenes[draft.setup.scenes.findIndex(item => item.id === previous.id)] = scene;
      else draft.setup.scenes.push(scene);
    });
  }

  delete(id: string): SystemSnapshot {
    if (this.busy) throw new Error('Wait for the current scene to finish.');
    if (this.store.get().setup.runtime.activeSceneId === id) throw new Error('Restore your previous setup before deleting the active scene.');
    return this.store.update(draft => { draft.setup.scenes = draft.setup.scenes.filter(scene => scene.id !== id); });
  }

  async apply(id: string, automatic = false): Promise<SystemSnapshot> {
    if (this.busy || this.disposed) throw new Error('A scene is already changing.');
    const scene = this.store.get().setup.scenes.find(item => item.id === id);
    if (!scene) throw new Error('This scene no longer exists.');
    this.busy = true;
    this.idle = new Promise(resolve => { this.finish = resolve; });
    if (!automatic) for (const exe of this.running) this.suppressed.add(exe);
    try {
      // Preserve the original setup across scene-to-scene switches.
      const original = this.store.get().setup.restore?.before ?? snapshotSceneValues(this.store.get());
      this.store.update(draft => {
        draft.setup.runtime.state = 'applying'; draft.setup.runtime.issues = [];
        draft.setup.restore = { before: original, applied: snapshotSceneValues(draft), automatic,
          executable: scene.executable.toLowerCase(), restoreOnExit: scene.restoreOnExit };
      });
      const issues = await this.applyValues(scene.values);
      return this.store.update(draft => {
        draft.setup.runtime.activeSceneId = scene.id;
        draft.setup.runtime.state = issues.length ? 'partial' : 'active'; draft.setup.runtime.issues = issues;
        if (draft.setup.restore) draft.setup.restore.applied = snapshotSceneValues(draft);
      });
    } finally { this.busy = false; this.finish?.(); this.finish = undefined; }
  }

  async restore(automatic = false): Promise<SystemSnapshot> {
    if (this.busy || this.disposed) throw new Error('A scene is already changing.');
    const saved = this.store.get().setup.restore;
    if (!saved) return this.store.get();
    this.busy = true;
    this.idle = new Promise(resolve => { this.finish = resolve; });
    if (!automatic) for (const exe of this.running) this.suppressed.add(exe);
    try {
      const values = sceneRestoreValues(saved.before, saved.applied, snapshotSceneValues(this.store.get()), automatic);
      this.store.update(draft => { draft.setup.runtime.state = 'restoring'; draft.setup.runtime.issues = []; });
      const issues = await this.applyValues(values);
      return this.store.update(draft => {
        draft.setup.runtime.state = issues.length ? 'partial' : 'idle'; draft.setup.runtime.issues = issues;
        if (!issues.length) { draft.setup.restore = null; draft.setup.runtime.activeSceneId = null; }
      });
    } finally { this.busy = false; this.finish?.(); this.finish = undefined; }
  }

  async runningApplications(executables: string[]): Promise<void> {
    this.running = executables.map(exe => exe.toLowerCase());
    for (const exe of this.suppressed) if (!this.running.includes(exe)) this.suppressed.delete(exe);
    if (this.busy || this.disposed) return;
    const setup = this.store.get().setup;
    const previous = setup.restore;
    if (previous?.automatic && !this.running.includes(previous.executable)) {
      if (previous.restoreOnExit) await this.restore(true);
      else this.store.update(draft => { if (draft.setup.restore) draft.setup.restore.automatic = false; });
    }
    if (this.store.get().setup.restore?.automatic) return;
    const match = this.store.get().setup.scenes.find(scene => scene.automatic && this.running.includes(scene.executable.toLowerCase())
      && !this.suppressed.has(scene.executable.toLowerCase()));
    if (match) {
      this.suppressed.add(match.executable.toLowerCase());
      await this.apply(match.id, true);
    }
  }

  async dispose(): Promise<void> { this.disposed = true; await this.idle; }

  private async applyValues(values: SceneValues): Promise<string[]> {
    const issues: string[] = [];
    const attempt = async (label: string, action: () => Promise<void>) => {
      if (this.disposed) { issues.push('Switchboard is shutting down.'); return; }
      try { await action(); } catch (error) { issues.push(`${label}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2048)); }
    };
    if (values.audio) await attempt('Audio', () => this.io.audio(values.audio!));
    for (const target of values.devices) {
      await attempt(target.name, async () => {
        const device = this.store.get().devices.find(item => item.id === target.deviceId);
        if (!device?.connected) throw new Error('Device is disconnected.');
        for (const change of sceneDeviceCommands(target, device)) await this.io.device(target.deviceId, change);
      });
    }
    if (values.capture) await attempt('Capture', () => this.io.capture(values.capture!));
    return issues.slice(0, 64);
  }
}
