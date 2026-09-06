import { z } from 'zod';
import type { CaptureConfig, SystemSnapshot } from '../../shared/contracts';
import { redactDiagnosticText } from './developer-diagnostics';

export function captureDiagnosticSettings(config: CaptureConfig) {
  return {
    enabled: config.enabled, source: config.source, sourceSelected: Boolean(config.sourceId),
    displayIndex: config.displayIndex, encoder: config.encoder, codec: config.codec,
    resolution: config.resolution, fps: config.fps, quality: config.quality, replaySeconds: config.replaySeconds,
    includeSystemAudio: config.includeSystemAudio, includeMic: config.includeMic,
    includeChatAudio: config.includeChatAudio, includeCursor: config.includeCursor,
  };
}

const gpuDeviceSchema = z.object({
  active: z.boolean().optional(), vendorId: z.number().optional(), deviceId: z.number().optional(),
  vendorString: z.string().optional(), deviceString: z.string().optional(),
  driverVendor: z.string().optional(), driverVersion: z.string().optional(),
});
const gpuInfoSchema = z.object({
  gpuDevice: z.array(gpuDeviceSchema).max(16).optional(),
  auxAttributes: z.object({
    directRenderingVersion: z.string().optional(), glRenderer: z.string().optional(), glVersion: z.string().optional(),
    glVendor: z.string().optional(), displayType: z.string().optional(), optimus: z.boolean().optional(),
    amdSwitchable: z.boolean().optional(), sandboxed: z.boolean().optional(),
  }).optional(),
});

export function diagnosticGpuInfo(input: unknown) {
  const parsed = gpuInfoSchema.safeParse(input);
  if (!parsed.success) return { unavailable: 'GPU metadata did not match the supported fields.' };
  // Pick fields above; never include arbitrary driver metadata or device identifiers.
  return JSON.parse(JSON.stringify(parsed.data, (_key, value: unknown) =>
    typeof value === 'string' ? redactDiagnosticText(value) : value)) as z.infer<typeof gpuInfoSchema>;
}

export function captureDiagnosticContext(snapshot: SystemSnapshot) {
  const { config, runtime, capabilities, sources, storage } = snapshot.capture;
  return {
    settings: captureDiagnosticSettings(config),
    runtime: {
      state: runtime.state, backend: runtime.backendLabel, encoder: runtime.encoderLabel,
      encodedFrames: runtime.encodedFrames, droppedFrames: runtime.droppedFrames,
      bufferedSeconds: runtime.bufferedSeconds, segmentCount: runtime.segmentCount,
      saveQueueDepth: runtime.saveQueueDepth, observedBitrateBps: runtime.observedBitrateBps,
      error: runtime.error ? redactDiagnosticText(runtime.error) : null,
      warning: runtime.warning ? redactDiagnosticText(runtime.warning) : null,
      activeSourceType: runtime.activeSource?.type ?? null,
      activeSourceAvailable: runtime.activeSource?.available ?? null,
    },
    capabilities,
    sources: { displays: sources.filter(source => source.type === 'display').length,
      windows: sources.filter(source => source.type === 'window').length,
      available: sources.filter(source => source.available).length },
    storage: { availableBytes: storage.availableBytes, replayCacheBytes: storage.replayCacheBytes,
      lowSpace: storage.lowSpace, criticalSpace: storage.criticalSpace },
    engines: snapshot.engines.map(engine => ({
      kind: engine.kind, state: engine.state, pid: engine.pid,
      message: engine.message ? redactDiagnosticText(engine.message) : null,
      processes: engine.processes,
    })),
  };
}
