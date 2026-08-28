import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BrowserWindow, session } from 'electron';
import type { Device as HidDevice } from 'node-hid';
import { z } from 'zod';
import type {
  AddonProjectManifest,
  Device,
  ModuleRuntimeStatus,
} from '../../shared/contracts';
import { resolveProductAsset } from '../../shared/product-assets';
import type { DeviceDiscoveryContext, DeviceModule } from './device-module';

const detectionTimeoutMs = 2_500;
const initializationTimeoutMs = 4_000;

const detectedDeviceSchema = z.object({
  deviceKey: z.string().min(1).max(96),
  displayName: z.string().trim().min(1).max(120),
  kind: z.enum(['mouse', 'microphone', 'keyboard', 'headset', 'unknown']),
  identity: z.object({
    manufacturer: z.string().trim().min(1).max(80).optional(),
    productFamily: z.string().trim().min(1).max(120).optional(),
    model: z.string().trim().min(1).max(120).optional(),
    variant: z.string().trim().min(1).max(120).optional(),
    colorway: z.string().trim().min(1).max(80).optional(),
    connection: z.enum(['usb', 'wireless', 'bluetooth', 'unknown']).optional(),
    connectionLabel: z.string().trim().min(1).max(80).optional(),
    hardwareRevision: z.string().trim().min(1).max(80).optional(),
  }),
});

const detectedDevicesSchema = z.array(detectedDeviceSchema).max(32);

type RuntimeStateListener = (
  moduleId: string,
  status: Extract<ModuleRuntimeStatus, 'ready' | 'active' | 'runtime-error'>,
  message?: string,
) => void;

export class SandboxedDeviceAddon implements DeviceModule {
  public readonly id: string;
  private host: BrowserWindow | null = null;
  private hostInitialization: Promise<BrowserWindow> | null = null;
  private readonly intentionalHostClosures = new WeakSet<BrowserWindow>();
  private disposed = false;

  public constructor(
    private readonly manifest: AddonProjectManifest,
    private readonly entrypointPath: string,
    private readonly onRuntimeState: RuntimeStateListener,
  ) {
    this.id = manifest.id;
  }

  public async discover(context: DeviceDiscoveryContext): Promise<Device[]> {
    if (this.disposed) return [];
    try {
      const allowedDevices = context.hidDevices
        .filter((device) => this.isPermitted(device))
        .map((device) => toAddonHidDevice(this.id, device));
      if (allowedDevices.length === 0) {
        this.onRuntimeState(this.id, 'ready');
        return [];
      }

      const host = await this.ensureHost();
      const raw = await withTimeout(
        host.webContents.executeJavaScript(
          `globalThis.__switchboardModuleHost.detect(${JSON.stringify({
            apiVersion: 1,
            platform: normalizePlatform(process.platform),
            hidDevices: allowedDevices,
          })})`,
          true,
        ),
        detectionTimeoutMs,
        `${this.manifest.name} discovery timed out.`,
      );
      const detected = detectedDevicesSchema.parse(raw);
      const byKey = new Map(allowedDevices.map((device) => [device.deviceKey, device]));
      const publishedKeys = new Set<string>();
      const devices = detected.map((candidate): Device => {
        const source = byKey.get(candidate.deviceKey);
        if (!source) throw new Error(`${this.manifest.name} returned a device outside its HID permission.`);
        if (publishedKeys.has(candidate.deviceKey)) throw new Error(`${this.manifest.name} returned the same device more than once.`);
        publishedKeys.add(candidate.deviceKey);
        const identity = {
          ...candidate.identity,
          manufacturer: candidate.identity.manufacturer ?? source.manufacturer,
          model: candidate.identity.model ?? source.product,
          connection: candidate.identity.connection ?? 'usb' as const,
          connectionLabel: candidate.identity.connectionLabel ?? 'USB',
          vendorId: source.vendorId,
          productId: source.productId,
          serialNumber: source.serialNumber,
          productString: source.product,
        };
        return {
          id: `addon:${this.id}:${candidate.deviceKey}`,
          moduleId: this.id,
          displayName: candidate.displayName,
          kind: candidate.kind,
          connected: true,
          identity,
          variantResolution: {
            confidence: 'module-metadata',
            source: this.id,
            evidence: `Sandboxed add-on matched ${hex(source.vendorId)}:${hex(source.productId)}.`,
          },
          asset: resolveProductAsset(identity, candidate.kind),
          capabilities: {},
          settings: {},
        };
      });
      this.onRuntimeState(this.id, 'active');
      return devices;
    } catch (error) {
      await this.closeHost();
      this.onRuntimeState(this.id, 'runtime-error', errorMessage(error));
      return [];
    }
  }

  public async deactivate(): Promise<void> {
    await this.closeHost();
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    await this.closeHost();
  }

  private async ensureHost(): Promise<BrowserWindow> {
    if (this.disposed) throw new Error(`${this.manifest.name} is disposed.`);
    if (this.host && !this.host.isDestroyed()) return this.host;
    this.hostInitialization ??= withTimeout(this.createHost(), initializationTimeoutMs, `${this.manifest.name} sandbox did not start.`)
      .finally(() => { this.hostInitialization = null; });
    return this.hostInitialization;
  }

  private async createHost(): Promise<BrowserWindow> {
    const partitionName = `switchboard-addon-${randomUUID()}`;
    const isolatedSession = session.fromPartition(partitionName, { cache: false });
    isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    isolatedSession.setPermissionCheckHandler(() => false);
    isolatedSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (_details, callback) => callback({ cancel: true }));

    const host = new BrowserWindow({
      show: false,
      webPreferences: {
        partition: partitionName,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
      },
    });
    this.host = host;
    host.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    host.webContents.on('will-attach-webview', (event) => event.preventDefault());
    host.webContents.on('render-process-gone', (_event, details) => {
      if (this.disposed || this.intentionalHostClosures.has(host)) return;
      this.host = null;
      this.onRuntimeState(this.id, 'runtime-error', `The sandbox exited (${details.reason}).`);
    });

    await host.loadURL(moduleHostDocument());
    host.webContents.on('will-navigate', (event) => event.preventDefault());
    const source = await readFile(this.entrypointPath, 'utf8');
    await host.webContents.executeJavaScript(
      `globalThis.__switchboardModuleHost.load(${JSON.stringify(source)})`,
      true,
    );
    return host;
  }

  private async closeHost(): Promise<void> {
    const initialization = this.hostInitialization;
    this.hostInitialization = null;
    if (initialization) await initialization.catch(() => undefined);
    const host = this.host;
    this.host = null;
    if (host && !host.isDestroyed()) {
      this.intentionalHostClosures.add(host);
      host.destroy();
    }
  }

  private isPermitted(device: HidDevice): boolean {
    return this.manifest.permissions.hid.some((permission) => (
      Number.parseInt(permission.vendorId, 16) === device.vendorId
      && permission.productIds.some((productId) => Number.parseInt(productId, 16) === device.productId)
    ));
  }
}

function toAddonHidDevice(moduleId: string, device: HidDevice) {
  const source = [moduleId, device.path, device.vendorId, device.productId, device.serialNumber, device.usagePage, device.usage]
    .map((part) => part ?? '')
    .join('\u0000');
  return {
    deviceKey: createHash('sha256').update(source).digest('hex').slice(0, 24),
    vendorId: device.vendorId,
    productId: device.productId,
    usagePage: device.usagePage,
    usage: device.usage,
    manufacturer: cleanOptional(device.manufacturer),
    product: cleanOptional(device.product),
    serialNumber: cleanOptional(device.serialNumber),
  };
}

function moduleHostDocument(): string {
  const bootstrap = `
    (() => {
      let addon = null;
      const api = {
        async load(source) {
          const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          try {
            const namespace = await import(url);
            if (!namespace.default || typeof namespace.default.detect !== 'function') {
              throw new Error('The default export must provide a detect(context) function.');
            }
            addon = namespace.default;
            return true;
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        async detect(context) {
          if (!addon) throw new Error('The add-on has not been loaded.');
          return await addon.detect(structuredClone(context));
        },
      };
      Object.defineProperty(globalThis, '__switchboardModuleHost', {
        value: Object.freeze(api),
        configurable: false,
        enumerable: false,
        writable: false,
      });
    })();
  `;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; connect-src 'none'; img-src 'none'; style-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script>${bootstrap}</script></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function normalizePlatform(platform: NodeJS.Platform): 'win32' | 'darwin' | 'linux' {
  if (platform === 'darwin' || platform === 'linux') return platform;
  return 'win32';
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 160) : undefined;
}

function hex(value: number): string {
  return value.toString(16).padStart(4, '0');
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
