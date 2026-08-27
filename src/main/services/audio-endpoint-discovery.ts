import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import {
  audioEndpointFormFactorSchema,
  type AudioDevice,
} from '../../shared/contracts';

const discoveredEndpointSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  flow: z.enum(['render', 'capture']),
  isDefault: z.boolean(),
  formFactor: audioEndpointFormFactorSchema.nullable(),
  interfaceName: z.string().nullable(),
  volume: z.number(),
  muted: z.boolean(),
  isSwitchboard: z.boolean().default(false),
});

const discoveredEndpointsSchema = z.array(discoveredEndpointSchema);
const virtualDevicePattern = /\bvirtual(?: audio)? device\b/i;
const maximumOutputBytes = 2 * 1024 * 1024;

type DiscoveryOptions = {
  appPath: string;
  isPackaged: boolean;
  resourcesPath: string;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
};

export class AudioEndpointDiscovery {
  public constructor(private readonly options: DiscoveryOptions) {}

  public async list(): Promise<AudioDevice[]> {
    if ((this.options.platform ?? process.platform) !== 'win32') return [];

    const { command, arguments: commandArguments, cwd } = this.resolveCommand();
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    const stdout = await run(command, commandArguments, cwd, environment, this.options.timeoutMs ?? 15_000);
    const endpoints = discoveredEndpointsSchema.parse(JSON.parse(stdout));

    return endpoints.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      direction: endpoint.flow === 'render' ? 'output' : 'input',
      isDefault: endpoint.isDefault,
      available: true,
      formFactor: endpoint.formFactor,
      isVirtual: virtualDevicePattern.test(endpoint.interfaceName ?? endpoint.name),
      isSwitchboard: endpoint.isSwitchboard,
    }));
  }

  private resolveCommand(): { command: string; arguments: string[]; cwd: string } {
    if (this.options.isPackaged) {
      const directory = join(this.options.resourcesPath, 'audio-host');
      return {
        command: join(directory, 'Audio.Host.exe'),
        arguments: ['--list-endpoints'],
        cwd: directory,
      };
    }

    if (process.env.SWITCHBOARD_NATIVE_REVIEW === '1') {
      const reviewExecutable = process.env.SWITCHBOARD_NATIVE_REVIEW_AUDIO_HOST;
      if (reviewExecutable && existsSync(reviewExecutable)) {
        return {
          command: reviewExecutable,
          arguments: ['--list-endpoints'],
          cwd: dirname(reviewExecutable),
        };
      }
      const directory = join(this.options.appPath, 'engines', 'audio-host', 'bin', 'Debug', 'net10.0-windows');
      const executable = join(directory, 'Audio.Host.exe');
      if (existsSync(executable)) {
        return { command: executable, arguments: ['--list-endpoints'], cwd: directory };
      }
    }

    return {
      command: 'dotnet',
      arguments: [
        'run',
        '--project',
        join(this.options.appPath, 'engines', 'audio-host', 'Audio.Host.csproj'),
        '--no-launch-profile',
        '--',
        '--list-endpoints',
      ],
      cwd: this.options.appPath,
    };
  }
}

function run(
  command: string,
  commandArguments: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArguments, {
      cwd,
      env: environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(stdout.trim());
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error('Windows audio endpoint discovery timed out.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.length > maximumOutputBytes) {
        child.kill();
        finish(new Error('Windows audio endpoint discovery returned too much data.'));
      }
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length <= maximumOutputBytes) stderr += String(chunk);
    });
    child.once('error', (error) => finish(error));
    child.once('close', (code) => {
      if (code === 0) finish();
      else finish(new Error(`Windows audio endpoint discovery exited with code ${code}: ${stderr.trim()}`));
    });
  });
}
