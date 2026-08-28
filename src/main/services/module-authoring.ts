import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import {
  addonProjectManifestSchema,
  type AddonProjectManifest,
  type CreateModuleProjectInput,
  type ModuleManifest,
  type ModuleRuntimeStatus,
  type ModuleValidationIssue,
} from '../../shared/contracts';

export const moduleManifestFilename = 'switchboard.module.json';
export const moduleApiVersion = 1 as const;
export const maximumModuleSourceBytes = 512 * 1024;

export interface ModuleProjectValidation {
  manifest?: AddonProjectManifest;
  entrypointPath?: string;
  issues: ModuleValidationIssue[];
  status: Extract<ModuleRuntimeStatus, 'ready' | 'invalid' | 'incompatible' | 'missing'>;
  sizeMb: number;
}

export async function createModuleProject(
  parentDirectory: string,
  input: CreateModuleProjectInput,
  coreVersion: string,
): Promise<string> {
  const parent = resolve(parentDirectory);
  const target = resolve(parent, projectFolderName(input.id));
  assertChildPath(parent, target);

  await mkdir(target, { recursive: false });
  try {
    await mkdir(resolve(target, 'src'));
    await mkdir(resolve(target, 'test'));
    const manifest = createManifest(input, coreVersion);
    const files = scaffoldFiles(input, manifest);
    await Promise.all(Object.entries(files).map(([file, contents]) => {
      const destination = resolve(target, file);
      assertChildPath(target, destination);
      return writeFile(destination, contents, 'utf8');
    }));
    return target;
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

export async function validateModuleProject(
  projectDirectory: string,
  coreVersion: string,
): Promise<ModuleProjectValidation> {
  const projectPath = resolve(projectDirectory);
  const issues: ModuleValidationIssue[] = [];
  const manifestPath = resolve(projectPath, moduleManifestFilename);
  let manifestSource: string;

  try {
    const projectStat = await stat(projectPath);
    if (!projectStat.isDirectory()) throw new Error('The selected path is not a directory.');
    manifestSource = await readFile(manifestPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    issues.push({
      severity: 'error',
      code: code === 'ENOENT' ? 'manifest-missing' : 'project-unreadable',
      message: code === 'ENOENT'
        ? `${moduleManifestFilename} was not found in this project.`
        : `The project could not be read: ${errorMessage(error)}`,
      file: moduleManifestFilename,
    });
    return { issues, status: 'missing', sizeMb: 0 };
  }

  if (Buffer.byteLength(manifestSource, 'utf8') > 128 * 1024) {
    issues.push({
      severity: 'error',
      code: 'manifest-too-large',
      message: 'The manifest exceeds the 128 KB authoring limit.',
      file: moduleManifestFilename,
    });
    return { issues, status: 'invalid', sizeMb: 0 };
  }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(manifestSource);
  } catch (error) {
    issues.push({
      severity: 'error',
      code: 'manifest-json',
      message: `The manifest is not valid JSON: ${errorMessage(error)}`,
      file: moduleManifestFilename,
    });
    return { issues, status: 'invalid', sizeMb: 0 };
  }

  const parsed = addonProjectManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 32)) {
      issues.push({
        severity: 'error',
        code: 'manifest-schema',
        message: `${issue.path.join('.') || 'manifest'}: ${issue.message}`,
        file: moduleManifestFilename,
      });
    }
    return { issues, status: 'invalid', sizeMb: 0 };
  }

  const manifest = parsed.data;
  if (manifest.kind !== 'device') {
    issues.push({
      severity: 'error',
      code: 'api-kind-unavailable',
      message: `Module Host API v1 runs device-discovery add-ons only; ${manifest.kind} hooks are not available yet.`,
      file: moduleManifestFilename,
    });
  }
  if (!manifest.capabilities.includes('device-discovery')) {
    issues.push({
      severity: 'error',
      code: 'capability-required',
      message: 'API v1 requires the device-discovery capability.',
      file: moduleManifestFilename,
    });
  }
  const unsupportedCapabilities = manifest.capabilities.filter((capability) => capability !== 'device-discovery');
  if (unsupportedCapabilities.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'capability-not-brokered',
      message: `These capabilities are descriptive only in API v1: ${unsupportedCapabilities.join(', ')}.`,
      file: moduleManifestFilename,
    });
  }
  if (compareVersions(manifest.minimumCoreVersion, coreVersion) > 0) {
    issues.push({
      severity: 'error',
      code: 'core-version',
      message: `This project requires Switchboard ${manifest.minimumCoreVersion}; the current core is ${coreVersion}.`,
      file: moduleManifestFilename,
    });
  }

  const entrypointPath = resolve(projectPath, manifest.entrypoint);
  const entrypointRelative = relative(projectPath, entrypointPath);
  if (isAbsolute(manifest.entrypoint) || entrypointRelative.startsWith('..') || isAbsolute(entrypointRelative)) {
    issues.push({
      severity: 'error',
      code: 'entrypoint-outside-project',
      message: 'The entrypoint must stay inside the module project directory.',
      file: moduleManifestFilename,
    });
    return finishValidation(manifest, undefined, issues, 0);
  }
  if (!['.js', '.mjs'].includes(extname(entrypointPath).toLocaleLowerCase())) {
    issues.push({
      severity: 'error',
      code: 'entrypoint-format',
      message: 'The sandbox entrypoint must be a JavaScript .js or .mjs file.',
      file: manifest.entrypoint,
    });
    return finishValidation(manifest, undefined, issues, 0);
  }

  let entrypointSource: string;
  let entrypointBytes = 0;
  try {
    const entrypointStat = await stat(entrypointPath);
    if (!entrypointStat.isFile()) throw new Error('The entrypoint is not a file.');
    entrypointBytes = entrypointStat.size;
    if (entrypointBytes > maximumModuleSourceBytes) {
      throw new Error(`The entrypoint exceeds the ${maximumModuleSourceBytes / 1024} KB limit.`);
    }
    entrypointSource = await readFile(entrypointPath, 'utf8');
  } catch (error) {
    issues.push({
      severity: 'error',
      code: 'entrypoint-unreadable',
      message: `The entrypoint could not be loaded: ${errorMessage(error)}`,
      file: manifest.entrypoint,
    });
    return finishValidation(manifest, undefined, issues, entrypointBytes);
  }

  if (containsModuleImport(entrypointSource)) {
    issues.push({
      severity: 'error',
      code: 'entrypoint-import',
      message: 'Module Host API v1 uses a single-file entrypoint; static and dynamic imports are not allowed.',
      file: manifest.entrypoint,
    });
  }
  if (!/\bexport\s+default\b/.test(entrypointSource)) {
    issues.push({
      severity: 'error',
      code: 'entrypoint-export',
      message: 'The entrypoint must export one add-on object as its default export.',
      file: manifest.entrypoint,
    });
  }

  const permissionKeys = new Set<string>();
  for (const permission of manifest.permissions.hid) {
    for (const productId of permission.productIds) {
      const key = `${permission.vendorId.toLocaleLowerCase()}:${productId.toLocaleLowerCase()}`;
      if (permissionKeys.has(key)) {
        issues.push({
          severity: 'warning',
          code: 'permission-duplicate',
          message: `HID permission ${key} is declared more than once.`,
          file: moduleManifestFilename,
        });
      }
      permissionKeys.add(key);
    }
  }

  return finishValidation(manifest, entrypointPath, issues, entrypointBytes + Buffer.byteLength(manifestSource, 'utf8'));
}

export function moduleManifestFromProject(
  projectPath: string,
  validation: ModuleProjectValidation,
  enabled: boolean,
): ModuleManifest {
  if (!validation.manifest) throw new Error('A valid manifest is required before the project can be linked.');
  const manifest = validation.manifest;
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    kind: manifest.kind,
    sizeMb: validation.sizeMb,
    installed: true,
    enabled,
    official: false,
    restartRequired: false,
    capabilities: [...manifest.capabilities],
    vendors: manifest.permissions.hid.map((permission) => permission.vendorId.toLocaleLowerCase()),
    source: 'local',
    author: manifest.author,
    development: {
      projectPath: resolve(projectPath),
      sdkVersion: moduleApiVersion,
      status: validation.status,
      lastValidatedAt: new Date().toISOString(),
      issues: validation.issues,
    },
  };
}

export function scaffoldFiles(
  input: CreateModuleProjectInput,
  manifest: AddonProjectManifest,
): Record<string, string> {
  const manifestJson = `${JSON.stringify({
    $schema: './switchboard-module.schema.json',
    ...manifest,
  }, null, 2)}\n`;
  const entrypoint = `const MODULE_ID = ${JSON.stringify(input.id)};
const MATCH_VENDOR_ID = 0x${input.vendorId.toLocaleLowerCase()};
const MATCH_PRODUCT_ID = 0x${input.productId.toLocaleLowerCase()};

export default {
  async detect(context) {
    return context.hidDevices
      .filter((device) => device.vendorId === MATCH_VENDOR_ID && device.productId === MATCH_PRODUCT_ID)
      .map((device) => ({
        deviceKey: device.deviceKey,
        displayName: ${JSON.stringify(input.model)},
        kind: ${JSON.stringify(input.deviceKind)},
        identity: {
          manufacturer: device.manufacturer || ${JSON.stringify(input.manufacturer)},
          model: ${JSON.stringify(input.model)},
          connection: 'usb',
          connectionLabel: 'USB',
        },
      }));
  },
};

// ${input.name} runs in Module Host API v${moduleApiVersion}. It cannot access Node,
// Electron, the filesystem, the network, raw IPC, or devices outside the
// VID/PID pairs declared in switchboard.module.json.
void MODULE_ID;
`;
  const packageJson = `${JSON.stringify({
    name: input.id,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      check: 'node --check ./src/index.js',
      test: 'node --test ./test/module.test.js',
    },
  }, null, 2)}\n`;
  const importKeyword = 'import';
  const test = `${importKeyword} test from 'node:test';
${importKeyword} assert from 'node:assert/strict';
${importKeyword} addon from '../src/index.js';

test('detects only the declared device', async () => {
  const devices = await addon.detect({
    apiVersion: 1,
    platform: 'win32',
    hidDevices: [
      { deviceKey: 'match', vendorId: 0x${input.vendorId.toLocaleLowerCase()}, productId: 0x${input.productId.toLocaleLowerCase()} },
      { deviceKey: 'other', vendorId: 0xffff, productId: 0xffff },
    ],
  });
  assert.equal(devices.length, 1);
  assert.equal(devices[0].deviceKey, 'match');
  assert.equal(devices[0].displayName, ${JSON.stringify(input.model)});
});
`;
  const readme = `# ${input.name}

${input.description}

This is a Switchboard local device-discovery add-on for Module Host API v${moduleApiVersion}.

## Develop

1. Edit \`src/index.js\`.
2. Run \`npm test\` or \`bun test\` in this directory.
3. In Switchboard, open **Settings > Modules**, select **Validate** on this linked project, then enable it.
4. Use **Refresh devices** from the Devices workspace after connecting matching hardware.

The starter matches USB HID \`${input.vendorId.toLocaleUpperCase()}:${input.productId.toLocaleUpperCase()}\` and reports identity only. The host validates every result and builds the canonical Switchboard device object itself.

## Security and capability boundary

The entrypoint runs in a hidden sandboxed Chromium renderer with Node integration disabled. Network requests, navigation, popups, permissions, filesystem access, process execution, Electron APIs, and raw IPC are unavailable. Discovery receives only HID metadata matching the manifest permission.

API v1 intentionally does not broker HID writes or custom renderer surfaces. Writable controls require a reviewed core capability adapter so acknowledgement and hardware readback can preserve the last confirmed value.
`;

  return {
    [moduleManifestFilename]: manifestJson,
    'switchboard-module.schema.json': `${JSON.stringify(moduleJsonSchema(), null, 2)}\n`,
    'package.json': packageJson,
    'src/index.js': entrypoint,
    'test/module.test.js': test,
    'README.md': readme,
    '.gitignore': 'node_modules/\n.DS_Store\n',
  };
}

function createManifest(input: CreateModuleProjectInput, coreVersion: string): AddonProjectManifest {
  return {
    schemaVersion: moduleApiVersion,
    id: input.id,
    name: input.name,
    description: input.description,
    author: input.author,
    version: '0.1.0',
    minimumCoreVersion: normalizeCoreVersion(coreVersion),
    kind: 'device',
    entrypoint: 'src/index.js',
    capabilities: ['device-discovery'],
    permissions: {
      hid: [{
        vendorId: input.vendorId.toLocaleLowerCase(),
        productIds: [input.productId.toLocaleLowerCase()],
      }],
    },
  };
}

function finishValidation(
  manifest: AddonProjectManifest,
  entrypointPath: string | undefined,
  issues: ModuleValidationIssue[],
  bytes: number,
): ModuleProjectValidation {
  const incompatible = issues.some((issue) => issue.code === 'api-kind-unavailable' || issue.code === 'core-version');
  const invalid = issues.some((issue) => issue.severity === 'error');
  return {
    manifest,
    entrypointPath,
    issues,
    status: incompatible ? 'incompatible' : invalid ? 'invalid' : 'ready',
    sizeMb: Math.round((bytes / (1024 * 1024)) * 100) / 100,
  };
}

function containsModuleImport(source: string): boolean {
  return /(^|\n)\s*import\s*(?:[\w{*]|['"])/m.test(source)
    || /(^|\n)\s*export\s+[^\n;]+\s+from\s*['"]/m.test(source)
    || /\bimport\s*\(/.test(source);
}

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value.split('-', 1)[0]!.split('.').map((part) => Number(part));
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function normalizeCoreVersion(version: string): string {
  const match = version.match(/^\d+\.\d+\.\d+/);
  return match?.[0] ?? '0.1.0';
}

function projectFolderName(moduleId: string): string {
  return moduleId.replace(/[^a-z0-9.-]+/gi, '-').replace(/^[.-]+|[.-]+$/g, '');
}

function assertChildPath(parent: string, child: string): void {
  const childRelative = relative(parent, child);
  if (!childRelative || childRelative.startsWith('..') || isAbsolute(childRelative)) {
    throw new Error('The module project must be created inside the selected directory.');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function moduleJsonSchema(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Switchboard Module Manifest',
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'id', 'name', 'description', 'author', 'version', 'minimumCoreVersion', 'kind', 'entrypoint', 'capabilities', 'permissions'],
    properties: {
      $schema: { type: 'string' },
      schemaVersion: { const: 1 },
      id: { type: 'string', pattern: '^[a-z0-9]+(?:[.-][a-z0-9]+)+$' },
      name: { type: 'string', minLength: 2, maxLength: 80 },
      description: { type: 'string', minLength: 12, maxLength: 240 },
      author: { type: 'string', minLength: 2, maxLength: 120 },
      version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$' },
      minimumCoreVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$' },
      kind: { enum: ['device', 'capture', 'audio', 'integration'] },
      entrypoint: { type: 'string', minLength: 1, maxLength: 200 },
      capabilities: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string' } },
      permissions: {
        type: 'object',
        additionalProperties: false,
        required: ['hid'],
        properties: {
          hid: {
            type: 'array',
            minItems: 1,
            maxItems: 16,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['vendorId', 'productIds'],
              properties: {
                vendorId: { type: 'string', pattern: '^[0-9a-fA-F]{4}$' },
                productIds: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 32,
                  items: { type: 'string', pattern: '^[0-9a-fA-F]{4}$' },
                },
              },
            },
          },
        },
      },
    },
  };
}
