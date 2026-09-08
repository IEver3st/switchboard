import type { SystemSnapshot } from '../../shared/contracts';

export class StatusLighting {
  private initialized = false;
  private lastSave: string | undefined;
  private pulse = false;
  private timer: NodeJS.Timeout | null = null;
  private snapshot: SystemSnapshot | null = null;
  private signature = '';
  private generation = 0;
  private applied = new Map<string, string | null>();
  private chain: Promise<void> = Promise.resolve();
  private closed = false;
  constructor(private readonly io: {
    apply(id: string, color: string | null): Promise<void>;
    status(state: 'idle' | 'acknowledged' | 'error', message: string): void;
  }) {}

  update(snapshot: SystemSnapshot): void {
    if (this.closed) return;
    this.snapshot = snapshot;
    const policy = snapshot.setup.preferences.lighting;
    const save = snapshot.capture.runtime.lastSavedAt;
    if (this.initialized && save && save !== this.lastSave && policy.enabled && policy.clipSaved) {
      this.pulse = true;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.timer = null; this.pulse = false; if (this.snapshot) this.update(this.snapshot); }, 1_500);
      this.timer.unref();
    }
    this.initialized = true; this.lastSave = save;
    if (!policy.enabled || !policy.clipSaved) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null; this.pulse = false;
    }
    const muted = snapshot.devices.some(device => device.connected && device.capabilities.muteState?.muted === true)
      || (snapshot.audio.enabled && snapshot.audio.buses.some(bus => bus.id === 'mic' && !bus.enabled));
    const color = !policy.enabled ? null
      : policy.captureError && snapshot.capture.config.enabled && snapshot.capture.runtime.state === 'error' ? '#ff3b30'
      : this.pulse ? '#36d978'
      : policy.microphoneMuted && muted ? '#ffb347' : null;
    const targets = policy.enabled ? snapshot.devices.filter(device => policy.deviceIds.includes(device.id) && device.connected
      && device.capabilities.lighting?.statusLightingSupported
      && snapshot.modules.some(module => module.id === device.moduleId && module.enabled)).map(device => device.id) : [];
    const signature = JSON.stringify([targets, color]);
    if (signature === this.signature) return;
    this.signature = signature;
    const generation = ++this.generation;
    this.chain = this.chain.catch(() => undefined).then(async () => {
      if (generation !== this.generation || this.closed) return;
      const errors: string[] = [];
      for (const id of new Set([...this.applied.keys(), ...targets])) {
        const next = targets.includes(id) ? color : null;
        if (this.applied.has(id) && this.applied.get(id) === next) { if (!targets.includes(id)) this.applied.delete(id); continue; }
        try {
          // Remember partial writes too, so disable/shutdown still attempts restoration.
          this.applied.set(id, next);
          await this.io.apply(id, next);
          if (!targets.includes(id)) this.applied.delete(id);
        } catch (error) { errors.push(`${snapshot.devices.find(device => device.id === id)?.displayName ?? 'Device'}: ${String(error)}`); }
      }
      if (generation !== this.generation || this.closed) return;
      this.io.status(errors.length ? 'error' : color && targets.length ? 'acknowledged' : 'idle',
        errors.join(' ').slice(0, 2048) || (color && targets.length
          ? 'Status cue acknowledged. Battery warnings and cutoff take priority; physical light output is unverified.' : ''));
    });
  }

  async dispose(): Promise<void> {
    this.closed = true; this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.chain;
    for (const id of this.applied.keys()) await this.io.apply(id, null).catch(() => undefined);
    this.applied.clear();
  }
}
