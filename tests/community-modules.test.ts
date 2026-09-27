import { afterEach, describe, expect, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommunityModules, normalizeModuleRepository, packageDigest, verifyCommunityPackage } from '../src/main/services/community-modules';
import { StateStore } from '../src/main/services/state-store';

const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
const key = generateKeyPairSync('ed25519');
const manifest = {
  schemaVersion: 1, id: 'device.example.test', name: 'Test device', description: 'Test community device discovery.',
  author: 'Example', version: '1.0.0', minimumCoreVersion: '0.9.0', kind: 'device', entrypoint: 'src/index.js',
  capabilities: ['device-discovery'], permissions: { hid: [{ vendorId: '1234', productIds: ['5678'] }] },
};
function signed(options: { version?: string; source?: string; repository?: string; manifest?: object; key?: typeof key } = {}) {
  const signing = options.key ?? key;
  const payload = Buffer.from(JSON.stringify({ repository: options.repository ?? 'example/module',
    manifest: { ...manifest, version: options.version ?? '1.0.0', ...options.manifest },
    source: options.source ?? 'export default { detect() { return []; } };',
  }));
  return Buffer.from(JSON.stringify({ format: 1, payload: payload.toString('base64'),
    publicKey: signing.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    signature: sign(null, payload, signing.privateKey).toString('base64'),
  }));
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'switchboard-community-test-')); temporary.push(root);
  let bytes = signed();
  let digest: string | undefined;
  const request = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === 'https://api.github.com/repos/example/module/releases/latest') return new Response(JSON.stringify({
      tag_name: 'v1', draft: false, prerelease: false, assets: [{ name: 'switchboard-module.json', size: bytes.length,
        digest: digest ?? `sha256:${packageDigest(bytes)}`, browser_download_url: 'https://github.com/example/module/releases/download/v1/switchboard-module.json' }],
    }));
    if (url === 'https://github.com/example/module/releases/download/v1/switchboard-module.json') return new Response(bytes);
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  const service = new CommunityModules(join(root, 'packages'), '0.9.13', request);
  return { root, service, request, setBytes(value: Buffer) { bytes = value; }, setDigest(value: string) { digest = value; } };
}

describe('community module trust and installation', () => {
  test('author CLI creates a key and a package that passes the installer verifier', async () => {
    const f = await fixture();
    const project = join(f.root, 'project'); await mkdir(join(project, 'src'), { recursive: true });
    await writeFile(join(project, 'switchboard.module.json'), JSON.stringify(manifest));
    await writeFile(join(project, 'src/index.js'), 'export default { detect() { return []; } };');
    const keyPath = join(f.root, 'private.pem'); const output = join(f.root, 'switchboard-module.json');
    const run = async (args: string[]) => {
      const child = Bun.spawn([process.execPath, 'scripts/package-community-module.ts', ...args], { stdout: 'pipe', stderr: 'pipe' });
      const [exit, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      if (exit !== 0) throw new Error(error);
    };
    await run(['keygen', keyPath]);
    await run(['pack', project, 'example/module', keyPath, output]);
    expect(verifyCommunityPackage(await readFile(output), 'example/module').manifest.id).toBe(manifest.id);
    const savedKey = await readFile(keyPath, 'utf8');
    await expect(run(['keygen', keyPath])).rejects.toThrow();
    expect(await readFile(keyPath, 'utf8')).toBe(savedKey);
  });

  test('accepts public repository forms and rejects credentials, ports, paths and other hosts', () => {
    expect(normalizeModuleRepository('https://github.com/Example/Module.git')).toBe('example/module');
    for (const value of ['https://github.com.evil.test/a/b', 'http://github.com/a/b', 'https://a@github.com/a/b', 'https://github.com:443/a/b', 'a/b/tree/main', 'a/..', 'file:///a/b']) {
      expect(() => normalizeModuleRepository(value)).toThrow();
    }
  });

  test('verifies signed bytes and repository binding; rejects tampering and unsupported permissions', () => {
    const bytes = signed();
    expect(verifyCommunityPackage(bytes, 'example/module').manifest.id).toBe(manifest.id);
    expect(() => verifyCommunityPackage(bytes, 'other/repo')).toThrow('different GitHub');
    const altered = JSON.parse(bytes.toString()); altered.payload = Buffer.from('{}').toString('base64');
    expect(() => verifyCommunityPackage(Buffer.from(JSON.stringify(altered)), 'example/module')).toThrow('signature');
    for (const changed of [{ kind: 'audio' }, { entrypoint: '../escape.js' }, { capabilities: ['device-discovery', 'hardware-write'] }]) {
      expect(() => verifyCommunityPackage(signed({ manifest: changed }), 'example/module')).toThrow('device discovery only');
    }
  });

  test('rejects digest mismatch before installation', async () => {
    const f = await fixture(); f.setDigest(`sha256:${'0'.repeat(64)}`);
    await expect(f.service.inspect('example/module', [])).rejects.toThrow('does not match');
  });

  test('validates source and core compatibility before review', async () => {
    const f = await fixture();
    f.setBytes(signed({ source: 'import "https://example.com/code.js"; export default {}' }));
    await expect(f.service.inspect('example/module', [])).rejects.toThrow('imports');
    f.setBytes(signed({ manifest: { minimumCoreVersion: '999.0.0' } }));
    await expect(f.service.inspect('example/module', [])).rejects.toThrow('requires Switchboard');
  });

  test('installs the reviewed bytes disabled, persists provenance, and detects source changes', async () => {
    const f = await fixture(); const review = await f.service.inspect('example/module', []);
    f.setBytes(signed({ version: '9.0.0' })); // Release changes after review cannot replace reviewed bytes.
    const installed = await f.service.install(review.reviewId, []);
    expect(installed.version).toBe('1.0.0'); expect(installed.enabled).toBeFalse(); expect(installed.source).toBe('community');
    await expect(f.service.install(review.reviewId, [installed])).rejects.toThrow('expired');
    const storePath = join(f.root, 'state.json');
    const first = new StateStore(storePath); await first.load(); first.update(draft => { draft.modules.push(installed); }); await first.flush();
    const second = new StateStore(storePath); await second.load();
    expect(second.read('modules').find(module => module.id === installed.id)?.distribution).toEqual(installed.distribution);
    await writeFile(join(installed.development!.projectPath, 'src/index.js'), 'export default {};');
    await expect(f.service.load(installed.distribution!)).rejects.toThrow('no longer match');
  });

  test('updates only the same source and key and keeps a verified rollback version', async () => {
    const f = await fixture(); const first = await f.service.install((await f.service.inspect('example/module', [])).reviewId, []);
    await expect(f.service.inspect('example/module', [first])).rejects.toThrow('already installed');
    f.setBytes(signed({ version: '2.0.0', key: generateKeyPairSync('ed25519') }));
    await expect(f.service.inspect('example/module', [first])).rejects.toThrow('key changed');
    f.setBytes(signed({ version: '2.0.0' }));
    const second = await f.service.install((await f.service.inspect('example/module', [first])).reviewId, [first]);
    expect(second.distribution?.previous?.digest).toBe(first.distribution?.digest);
    expect((await f.service.load(second.distribution!.previous!)).validation.manifest?.version).toBe('1.0.0');
    expect(second.enabled).toBeFalse();
    await expect(f.service.inspect('example/module', [{ ...first, source: 'local' }])).rejects.toThrow('already owned');
  });

  test('rejects stale reviews when another installation changed the current version', async () => {
    const f = await fixture(); const review = await f.service.inspect('example/module', []);
    const installed = await f.service.install(review.reviewId, []);
    f.setBytes(signed({ version: '2.0.0' }));
    const next = await f.service.inspect('example/module', [installed]);
    await expect(f.service.install(next.reviewId, [])).rejects.toThrow('installed module changed');
  });

  test('publisher revocation survives a service restart and blocks loading, rollback and reviews', async () => {
    const f = await fixture(); const installed = await f.service.install((await f.service.inspect('example/module', [])).reviewId, []);
    await f.service.blockPublisher(installed.distribution!.publisher);
    const restarted = new CommunityModules(join(f.root, 'packages'), '0.9.13', f.request);
    await expect(restarted.load(installed.distribution!)).rejects.toThrow('blocked');
    await expect(restarted.inspect('example/module', [])).rejects.toThrow('blocked');
  });

  test('corrupt cached packages fail closed and do not change the installed version', async () => {
    const f = await fixture(); const installed = await f.service.install((await f.service.inspect('example/module', [])).reviewId, []);
    const path = join(installed.development!.projectPath, 'switchboard-module.json');
    const original = await readFile(path); await writeFile(path, '{}');
    await expect(f.service.load(installed.distribution!)).rejects.toThrow('hash changed');
    await writeFile(path, original);
    expect((await f.service.load(installed.distribution!)).validation.status).toBe('ready');
    f.service.dispose(); await expect(f.service.load(installed.distribution!)).rejects.toThrow('stopped');
  });

  test('rejects redirects outside GitHub and bounds streamed response bytes', async () => {
    const f = await fixture();
    const redirect = new CommunityModules(join(f.root, 'redirect'), '0.9.13', (async () => new Response(null, { status: 302, headers: { location: 'https://localhost/private' } })) as typeof fetch);
    await expect(redirect.inspect('example/module', [])).rejects.toThrow('outside GitHub');
    const oversized = new CommunityModules(join(f.root, 'large'), '0.9.13', (async () => new Response('x'.repeat(256 * 1024 + 1))) as typeof fetch);
    await expect(oversized.inspect('example/module', [])).rejects.toThrow('size limit');
  });
});
