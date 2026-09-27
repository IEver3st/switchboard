import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import {
  addonProjectManifestSchema, type CommunityModuleReview, type CommunityModuleVersion,
  type ModuleManifest,
} from '../../shared/contracts';
import { moduleManifestFromProject, validateModuleProject } from './module-authoring';

export const communityPackageFilename = 'switchboard-module.json';
export const maximumCommunityPackageBytes = 1024 * 1024;
const envelopeSchema = z.object({
  format: z.literal(1), payload: z.string().min(1).max(950_000),
  publicKey: z.string().min(1).max(128), signature: z.string().min(1).max(128),
}).strict();
const payloadSchema = z.object({
  repository: z.string().min(3).max(200),
  manifest: addonProjectManifestSchema,
  source: z.string().min(1).max(512 * 1024),
}).strict();
const releaseSchema = z.object({
  tag_name: z.string().min(1).max(200), draft: z.literal(false), prerelease: z.literal(false),
  assets: z.array(z.object({
    name: z.string(), browser_download_url: z.string(), size: z.number().int().positive(),
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable().optional(),
  })).max(100),
});
const blockedSchema = z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(1000);

export function normalizeModuleRepository(value: string): string {
  const match = /^(?:https:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(value.trim());
  if (!match || /^\.+$/.test(match[2]!)) throw new Error('Enter a public GitHub repository URL or owner/repository.');
  const name = match[2]!.replace(/\.git$/, '');
  if (!name || /^\.+$/.test(name)) throw new Error('Enter a public GitHub repository URL or owner/repository.');
  return `${match[1]}/${name}`.toLowerCase();
}

export function packageDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Signatures authenticate bytes and continuity of a key, not an author's real identity. */
export function verifyCommunityPackage(bytes: Uint8Array, repository: string) {
  if (bytes.byteLength > maximumCommunityPackageBytes) throw new Error('The module package exceeds 1 MB.');
  const envelope = envelopeSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')));
  const publicKey = createPublicKey({ key: Buffer.from(envelope.publicKey, 'base64'), format: 'der', type: 'spki' });
  if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('Module packages require an Ed25519 signing key.');
  const payloadBytes = Buffer.from(envelope.payload, 'base64');
  if (!verify(null, payloadBytes, publicKey, Buffer.from(envelope.signature, 'base64'))) {
    throw new Error('The module package signature is invalid.');
  }
  const payload = payloadSchema.parse(JSON.parse(payloadBytes.toString('utf8')));
  if (normalizeModuleRepository(payload.repository) !== normalizeModuleRepository(repository)) {
    throw new Error('The signed package belongs to a different GitHub repository.');
  }
  if (payload.manifest.kind !== 'device' || payload.manifest.entrypoint !== 'src/index.js'
    || payload.manifest.capabilities.length !== 1 || payload.manifest.capabilities[0] !== 'device-discovery') {
    throw new Error('Community packages support device discovery only, with a src/index.js entrypoint.');
  }
  if (Buffer.byteLength(payload.source, 'utf8') > 512 * 1024) throw new Error('Module source exceeds 512 KB.');
  return {
    ...payload,
    publisher: packageDigest(publicKey.export({ format: 'der', type: 'spki' })),
    sourceHash: packageDigest(Buffer.from(payload.source)),
  };
}

export class CommunityModules {
  private readonly reviews = new Map<string, { bytes: Buffer; review: CommunityModuleReview; expires: number; previousDigest?: string }>();
  private readonly abort = new AbortController();
  private inspecting = false;

  constructor(private readonly root: string, private readonly coreVersion: string, private readonly request: typeof fetch = fetch) {}

  async inspect(repositoryInput: string, installed: readonly ModuleManifest[]): Promise<CommunityModuleReview> {
    if (this.inspecting) throw new Error('Another module review is loading. Try again when it finishes.');
    this.inspecting = true;
    try {
      this.assertActive();
      this.pruneReviews();
      const repository = normalizeModuleRepository(repositoryInput);
      const metadata = await this.download(`https://api.github.com/repos/${repository}/releases/latest`, 256 * 1024);
      const release = releaseSchema.parse(JSON.parse(metadata.toString('utf8')));
      const assets = release.assets.filter(asset => asset.name === communityPackageFilename);
      if (assets.length !== 1) throw new Error(`The latest stable release must contain one ${communityPackageFilename} asset.`);
      const asset = assets[0]!;
      if (!asset.digest || asset.size > maximumCommunityPackageBytes) throw new Error('The package needs a GitHub SHA-256 digest and must be at most 1 MB.');
      const url = new URL(asset.browser_download_url);
      if (url.origin !== 'https://github.com' || !url.pathname.toLowerCase().startsWith(`/${repository}/releases/download/`)) {
        throw new Error('The release asset URL does not belong to this repository.');
      }
      const bytes = await this.download(url.href, maximumCommunityPackageBytes);
      const digest = packageDigest(bytes);
      if (asset.digest !== `sha256:${digest}` || asset.size !== bytes.length) throw new Error('The download does not match the GitHub release asset.');
      const payload = verifyCommunityPackage(bytes, repository);
      await this.assertPublisherAllowed(payload.publisher);
      const existing = installed.find(module => module.id === payload.manifest.id);
      this.assertReplacement(existing, repository, payload.publisher, payload.manifest.version, digest);
      const validation = await this.validateBytes(bytes, repository);
      if (validation.status !== 'ready') throw new Error(validation.issues[0]?.message ?? 'Module validation failed.');
      this.assertActive();
      const review: CommunityModuleReview = {
        reviewId: randomUUID(), manifest: payload.manifest, installedVersion: existing?.version,
        distribution: { repository, release: release.tag_name, publisher: payload.publisher, digest },
      };
      this.reviews.set(review.reviewId, { bytes, review, expires: Date.now() + 10 * 60_000, previousDigest: existing?.distribution?.digest });
      return structuredClone(review);
    } catch (error) {
      if (error instanceof z.ZodError) throw new Error('The release has invalid module metadata. Ask the author to publish a compatible package.');
      throw error;
    } finally { this.inspecting = false; }
  }

  async install(reviewId: string, installed: readonly ModuleManifest[]): Promise<ModuleManifest> {
    this.assertActive();
    const entry = this.reviews.get(reviewId);
    if (!entry || entry.expires < Date.now()) throw new Error('This package review expired. Review the repository again.');
    this.reviews.delete(reviewId);
    const { review, bytes } = entry;
    await this.assertPublisherAllowed(review.distribution.publisher);
    const existing = installed.find(module => module.id === review.manifest.id);
    if (existing?.distribution?.digest !== entry.previousDigest) throw new Error('The installed module changed. Review the repository again.');
    this.assertReplacement(existing, review.distribution.repository, review.distribution.publisher, review.manifest.version, review.distribution.digest);
    const path = this.versionPath(review.distribution.digest);
    await mkdir(this.root, { recursive: true });
    const stage = await mkdtemp(resolve(this.root, '.stage-'));
    try {
      await this.writeProject(stage, bytes, review.distribution.repository);
      const validation = await validateModuleProject(stage, this.coreVersion);
      if (validation.status !== 'ready') throw new Error(validation.issues[0]?.message ?? 'Module validation failed.');
      this.assertActive();
      try { await rename(stage, path); }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
        // A cached version is usable only after full signature and source verification below.
        await this.load(review.distribution);
      }
    } finally { await this.removeStage(stage); }
    const { validation } = await this.load(review.distribution);
    const module = moduleManifestFromProject(path, validation, false);
    module.source = 'community';
    module.distribution = { ...review.distribution, previous: existing?.distribution ? versionOnly(existing.distribution) : undefined };
    return module;
  }

  async load(version: CommunityModuleVersion) {
    this.assertActive();
    await this.assertPublisherAllowed(version.publisher);
    const path = this.versionPath(version.digest);
    const bytes = await readFile(resolve(path, communityPackageFilename));
    if (packageDigest(bytes) !== version.digest) throw new Error('The installed package hash changed. Remove it and review the repository again.');
    const payload = verifyCommunityPackage(bytes, version.repository);
    if (payload.publisher !== version.publisher) throw new Error('The installed publisher key changed.');
    const source = await readFile(resolve(path, 'src/index.js'));
    const manifest = await readFile(resolve(path, 'switchboard.module.json'), 'utf8');
    if (packageDigest(source) !== payload.sourceHash || manifest !== JSON.stringify(payload.manifest)) {
      throw new Error('Installed module files no longer match their signed package.');
    }
    const validation = await validateModuleProject(path, this.coreVersion);
    validation.sourceHash = payload.sourceHash;
    return { path, validation, sourceHash: payload.sourceHash };
  }

  async blockPublisher(publisher: string): Promise<void> {
    const blocked = await this.blockedPublishers();
    if (blocked.includes(publisher)) return;
    const next = blockedSchema.parse([...blocked, publisher]);
    await mkdir(this.root, { recursive: true });
    const temporary = resolve(this.root, `blocked-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(next), { flag: 'wx' });
    await rename(temporary, resolve(this.root, 'blocked-publishers.json'));
    this.reviews.clear();
  }

  dispose(): void { this.abort.abort(); this.reviews.clear(); }

  private assertActive(): void { if (this.abort.signal.aborted) throw new Error('Module downloads have stopped.'); }

  private assertReplacement(existing: ModuleManifest | undefined, repository: string, publisher: string, version: string, digest: string) {
    if (!existing) return;
    if (existing.source !== 'community' || existing.distribution?.repository !== repository) throw new Error('This module ID is already owned by another module.');
    if (existing.distribution.publisher !== publisher) throw new Error('The publisher signing key changed. This update cannot be installed.');
    if (existing.version === version || existing.distribution.digest === digest) throw new Error('This module version is already installed.');
  }

  private async blockedPublishers(): Promise<string[]> {
    try { return blockedSchema.parse(JSON.parse(await readFile(resolve(this.root, 'blocked-publishers.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }

  private async assertPublisherAllowed(publisher: string) {
    if ((await this.blockedPublishers()).includes(publisher)) throw new Error('This publisher key is blocked on this installation.');
  }

  private versionPath(digest: string): string {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid package digest.');
    return resolve(this.root, digest);
  }

  private async writeProject(path: string, bytes: Buffer, repository: string) {
    const payload = verifyCommunityPackage(bytes, repository);
    await mkdir(resolve(path, 'src'));
    await Promise.all([
      writeFile(resolve(path, 'switchboard.module.json'), JSON.stringify(payload.manifest), { flag: 'wx' }),
      writeFile(resolve(path, 'src/index.js'), payload.source, { flag: 'wx' }),
      writeFile(resolve(path, communityPackageFilename), bytes, { flag: 'wx' }),
    ]);
  }

  private async validateBytes(bytes: Buffer, repository: string) {
    await mkdir(this.root, { recursive: true });
    const stage = await mkdtemp(resolve(this.root, '.stage-'));
    try { await this.writeProject(stage, bytes, repository); return await validateModuleProject(stage, this.coreVersion); }
    finally { await this.removeStage(stage); }
  }

  private async removeStage(path: string) {
    const child = relative(resolve(this.root), resolve(path));
    if (!child.startsWith('.stage-') || child.includes('/') || child.includes('\\') || isAbsolute(child)) throw new Error('Invalid staging directory.');
    await rm(path, { recursive: true, force: true });
  }

  private pruneReviews() {
    for (const [id, entry] of this.reviews) if (entry.expires < Date.now()) this.reviews.delete(id);
    while (this.reviews.size >= 4) this.reviews.delete(this.reviews.keys().next().value!);
  }

  private async download(initialUrl: string, limit: number): Promise<Buffer> {
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(20_000)]);
    let url = initialUrl;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
        || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname)) {
        throw new Error('The module download redirected outside GitHub.');
      }
      const response = await this.request(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'Switchboard-Modules', Accept: 'application/vnd.github+json' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location) throw new Error('GitHub returned an invalid redirect.');
        url = new URL(location, url).href;
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`GitHub returned ${response.status}. Check that the repository is public and has a stable release; rate limits may require retrying later.`); }
      if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('The GitHub response exceeds the module size limit.'); }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('GitHub returned an empty response.');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const result = await reader.read();
          if (result.done) break;
          size += result.value.byteLength;
          if (size > limit) throw new Error('The GitHub response exceeds the module size limit.');
          chunks.push(result.value);
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      return Buffer.concat(chunks);
    }
    throw new Error('GitHub redirected too many times.');
  }
}

export function versionOnly(version: CommunityModuleVersion): CommunityModuleVersion {
  return { repository: version.repository, release: version.release, publisher: version.publisher, digest: version.digest };
}
