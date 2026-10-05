import { execFile } from 'node:child_process';
import { z } from 'zod';
import { audioEndpointFormFactorSchema, type AudioDevice } from '../../shared/contracts';

const discoveredEndpointSchema = z.object({
  id: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(256),
  flow: z.enum(['render', 'capture']),
  isDefault: z.boolean(),
  // Capture.Host omits null properties. Physical drivers may not expose either.
  formFactor: audioEndpointFormFactorSchema.nullish().transform((value) => value ?? null),
  interfaceName: z.string().max(256).nullish(),
});

const virtualDevicePattern = /\bvirtual(?: audio)? (?:device|cable)\b|VB-Audio/i;

export function parseAudioEndpoints(value: unknown): AudioDevice[] {
  return z.array(discoveredEndpointSchema).max(512).parse(value).map((endpoint) => ({
    id: endpoint.id,
    name: endpoint.name,
    direction: endpoint.flow === 'render' ? 'output' : 'input',
    isDefault: endpoint.isDefault,
    formFactor: endpoint.formFactor,
    isVirtual: virtualDevicePattern.test(endpoint.interfaceName ?? endpoint.name),
  }));
}

/** One-shot, media-free endpoint inventory for the replay audio pickers. */
export function listAudioEndpoints(executable: string, signal?: AbortSignal): Promise<AudioDevice[]> {
  if (process.platform !== 'win32') return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    execFile(executable, ['--list-audio-endpoints'], {
      windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', signal,
    }, (error, stdout) => {
      if (error) { reject(error); return; }
      try { resolve(parseAudioEndpoints(JSON.parse(stdout))); }
      catch (parseError) { reject(parseError); }
    });
  });
}
