import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModuleProjectInputSchema } from '../src/shared/contracts';
import {
  createModuleProject,
  moduleManifestFilename,
  moduleManifestFromProject,
  validateModuleProject,
} from '../src/main/services/module-authoring';
import { StateStore } from '../src/main/services/state-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('module authoring', () => {
  test('creates a zero-dependency starter that passes project validation', async () => {
    const parent = await temporaryDirectory('switchboard-module-create-');
    const input = createModuleProjectInputSchema.parse({
      id: 'device.acme.control-pad',
      name: 'ACME Control Pad',
      description: 'Adds identity and discovery support for the ACME Control Pad.',
      author: 'Switchboard Test',
      manufacturer: 'ACME',
      model: 'Control Pad',
      deviceKind: 'keyboard',
      vendorId: '1a2b',
      productId: '3c4d',
    });

    const projectPath = await createModuleProject(parent, input, '0.5.0');
    const validation = await validateModuleProject(projectPath, '0.5.0');
    const manifest = JSON.parse(await readFile(join(projectPath, moduleManifestFilename), 'utf8'));
    const source = await readFile(join(projectPath, 'src', 'index.js'), 'utf8');

    expect(validation.status).toBe('ready');
    expect(validation.issues).toEqual([]);
    expect(validation.manifest?.id).toBe(input.id);
    expect(manifest.permissions.hid).toEqual([{ vendorId: '1a2b', productIds: ['3c4d'] }]);
    expect(source).toContain('async detect(context)');
    expect(source).not.toContain('node:');
  });

  test('rejects imports because API v1 entrypoints are isolated single files', async () => {
    const { projectPath } = await createValidProject();
    await writeFile(
      join(projectPath, 'src', 'index.js'),
      "import './helper.js';\nexport default { detect() { return []; } };\n",
      'utf8',
    );

    const validation = await validateModuleProject(projectPath, '0.5.0');

    expect(validation.status).toBe('invalid');
    expect(validation.issues.some((issue) => issue.code === 'entrypoint-import')).toBeTrue();
  });

  test('rejects an entrypoint that escapes the selected project', async () => {
    const { projectPath } = await createValidProject();
    const manifestPath = join(projectPath, moduleManifestFilename);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.entrypoint = '../outside.js';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const validation = await validateModuleProject(projectPath, '0.5.0');

    expect(validation.status).toBe('invalid');
    expect(validation.issues.some((issue) => issue.code === 'entrypoint-outside-project')).toBeTrue();
  });

  test('preserves a linked local module across persisted-state hydration', async () => {
    const { projectPath, validation } = await createValidProject();
    const stateDirectory = await temporaryDirectory('switchboard-module-state-');
    const statePath = join(stateDirectory, 'switchboard-state.json');
    const first = new StateStore(statePath);
    await first.load();
    const localModule = moduleManifestFromProject(projectPath, validation, true);
    first.update((draft) => { draft.modules.push(localModule); });
    await first.flush();

    const second = new StateStore(statePath);
    await second.load();
    const hydrated = second.get().modules.find((module) => module.id === localModule.id);

    expect(hydrated?.source).toBe('local');
    expect(hydrated?.enabled).toBeTrue();
    expect(hydrated?.development?.projectPath).toBe(projectPath);
    expect(hydrated?.development?.status).toBe('validating');
  });
});

async function createValidProject() {
  const parent = await temporaryDirectory('switchboard-module-project-');
  const input = createModuleProjectInputSchema.parse({
    id: 'device.example.test-unit',
    name: 'Example Test Unit',
    description: 'Adds identity and discovery support for an example test unit.',
    author: 'Switchboard Test',
    manufacturer: 'Example',
    model: 'Test Unit',
    deviceKind: 'unknown',
    vendorId: '1234',
    productId: 'abcd',
  });
  const projectPath = await createModuleProject(parent, input, '0.5.0');
  const validation = await validateModuleProject(projectPath, '0.5.0');
  return { projectPath, validation };
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}
