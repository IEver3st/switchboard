import { z } from 'zod';

const counter = z.number().finite().nonnegative();
export const nativeResourceProcessSchema = z.object({
  pid: z.number().int().positive(), startedAt: z.string().max(64), name: z.string().max(160),
  cpuSeconds: counter, privateMb: counter, residentMb: counter, peakResidentMb: counter,
  readBytes: counter.nullable(), writeBytes: counter.nullable(), handles: counter.nullable(),
});
export const nativeResourceSampleSchema = z.object({
  processes: z.array(nativeResourceProcessSchema).max(257),
  requested: counter, inaccessible: counter, durationMs: counter, monitorPid: z.number().int().positive(),
});
export type NativeResourceSample = z.infer<typeof nativeResourceSampleSchema>;
export const resourcePointSchema = z.object({
  at: z.string(), cpuPercent: counter.nullable(), privateMb: counter.nullable(), residentMb: counter.nullable(),
  readBps: counter.nullable(), writeBps: counter.nullable(), processes: counter,
});
export const resourceProcessSchema = nativeResourceProcessSchema.extend({
  role: z.string().max(160), group: z.enum(['desktop', 'capture', 'audio', 'monitor']),
  cpuPercent: counter.nullable(), peakCpuPercent: counter.nullable(), observedCpuSeconds: counter,
  readBps: counter.nullable(), writeBps: counter.nullable(), observedReadBytes: counter, observedWriteBytes: counter,
  samples: counter, active: z.boolean(), sampledAt: z.string(),
});
export const resourceMonitorSchema = z.object({
  runtime: z.object({ mainHeapMb: counter, mainExternalMb: counter, mainArrayBuffersMb: counter,
    activeResources: z.record(z.string(), counter), rendererHeapMb: counter.nullable(), domNodes: counter.nullable(),
    canvases: counter.nullable(), images: counter.nullable(), videos: counter.nullable(), longTasks: counter.nullable(),
  }).optional(),
  events: z.array(z.object({ at: z.string(), source: z.string(), level: z.enum(['debug', 'info', 'warning', 'error']),
    event: z.string(), detail: z.string().max(2048) })).max(60).optional(),
  startedAt: z.string(), sampledAt: z.string(), status: z.enum(['available', 'partial', 'unavailable']), error: z.string().nullable(),
  sampleCount: counter, observedStarts: counter, observedExits: counter, droppedProcesses: counter,
  collectionMs: counter, requested: counter, inaccessible: counter, restarts: counter,
  monitorPid: z.number().int().positive().nullable(), logicalProcessors: counter,
  host: z.object({ power: z.enum(['battery', 'ac', 'unknown']), idleSeconds: counter.nullable(), idleState: z.string(),
    totalMemoryMb: counter, freeMemoryMb: counter, thermal: z.string(), cpuSpeedLimit: counter.nullable() }),
  history: z.array(resourcePointSchema).max(720), processes: z.array(resourceProcessSchema).max(256),
});
export type ResourceMonitorSnapshot = z.infer<typeof resourceMonitorSchema>;
export type ResourceProcess = z.infer<typeof resourceProcessSchema>;
