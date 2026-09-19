import { spawn } from 'node:child_process';
import { audioSyncMeasurementSchema, type AudioCalibrationState, type AudioSyncMeasurement } from '../../shared/contracts';

export interface CalibrationRoute {
  microphoneDeviceId: string | null;
  outputDeviceId: string | null;
}

export function measureAudioSync(executable: string, route: CalibrationRoute, signal: AbortSignal): Promise<AudioSyncMeasurement> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--calibrate-audio'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let failure: Error | null = null;
    const stop = (error: Error) => { failure ??= error; child.kill(); };
    const abort = () => stop(new Error('Calibration cancelled.'));
    const timeout = setTimeout(() => stop(new Error('Calibration timed out. Check your audio devices and retry.')), 20_000);
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => { stdout += String(chunk); if (stdout.length > 16_384) stop(new Error('Invalid calibration response.')); });
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-1000); });
    child.on('error', error => { failure ??= error; });
    child.stdin.on('error', () => { /* close/error owns the outcome */ });
    child.on('close', code => {
      clearTimeout(timeout); signal.removeEventListener('abort', abort);
      if (failure || code !== 0) { reject(failure ?? new Error(stderr.trim() || 'Audio calibration failed.')); return; }
      try { resolve(audioSyncMeasurementSchema.parse(JSON.parse(stdout))); } catch { reject(new Error('Invalid calibration result.')); }
    });
    if (signal.aborted) abort();
    else child.stdin.write(`${JSON.stringify(route)}\n`); // Keep stdin open; EOF cancels the native helper.
  });
}

/** Owns one cancellable measurement; candidates never replace saved settings. */
export class AudioSyncCalibration {
  private abort: AbortController | null = null;
  private pending: Promise<void> | null = null;
  private candidate: { measurement: AudioSyncMeasurement; signature: string } | null = null;
  private disposed = false;
  constructor(private readonly options: {
    measure(route: CalibrationRoute, signal: AbortSignal): Promise<AudioSyncMeasurement>;
    publish(state: AudioCalibrationState): void;
  }) {}

  start(route: CalibrationRoute, signature: string, currentSignature: () => string): void {
    if (this.disposed) throw new Error('Capture is shutting down.');
    if (this.pending) throw new Error('Audio calibration is already running.');
    const abort = new AbortController();
    this.abort = abort; this.candidate = null;
    this.options.publish({ status: 'measuring', measurement: null, error: null });
    this.pending = this.options.measure(route, abort.signal).then(raw => {
      if (abort.signal.aborted || this.disposed) return;
      const measurement = audioSyncMeasurementSchema.parse(raw);
      if (signature !== currentSignature()) throw new Error('The audio route changed. Calibrate again.');
      if (route.microphoneDeviceId && route.microphoneDeviceId !== measurement.profile.microphoneDeviceId
        || route.outputDeviceId && route.outputDeviceId !== measurement.profile.outputDeviceId)
        throw new Error('The measurement used different audio devices. Calibrate again.');
      this.candidate = { measurement, signature };
      this.options.publish({ status: 'ready', measurement, error: null });
    }).catch(error => {
      if (!abort.signal.aborted && !this.disposed)
        this.options.publish({ status: 'error', measurement: null, error: String(error instanceof Error ? error.message : error).slice(0, 1000) });
    }).finally(() => { this.pending = null; this.abort = null; });
  }

  take(signature: string): AudioSyncMeasurement {
    if (!this.candidate || this.candidate.signature !== signature) throw new Error('Measure the current audio route before applying a correction.');
    const result = this.candidate.measurement;
    this.candidate = null;
    return result;
  }

  async cancel(): Promise<void> {
    this.abort?.abort(); this.candidate = null;
    await this.pending;
    if (!this.disposed) this.options.publish({ status: 'idle', measurement: null, error: null });
  }
  async dispose(): Promise<void> { this.disposed = true; await this.cancel(); }
}
