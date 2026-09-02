import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, parse, resolve } from 'node:path';
import { app, dialog } from 'electron';
import { z } from 'zod';
import type { Clip, ClipExportPreset } from '../../shared/contracts';
import {
  montageAudioAssetSchema,
  montageProjectV2Schema,
  type MontageAudioAsset,
  type MontageAudioWaveform,
  type MontageProjectV2,
} from '../../shared/montage-v2';
import {
  probeMontageAudio,
  readMontageAudioWaveform,
  renderMontageV2,
} from './montage-v2-renderer';

const supportedAudioExtensions = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus']);
const maximumImportedAudioBytes = 4 * 1_024 * 1_024 * 1_024;
const maximumDrafts = 20;

const managedAssetSchema = montageAudioAssetSchema.extend({
  fileName: z.string().regex(/^[0-9a-f-]+\.[a-z0-9]+$/i),
});
type ManagedAsset = z.infer<typeof managedAssetSchema>;

const montageManifestSchema = z.object({
  schemaVersion: z.literal(1),
  assets: z.array(managedAssetSchema).max(1_000),
  drafts: z.array(montageProjectV2Schema).max(maximumDrafts),
});
type MontageManifest = z.infer<typeof montageManifestSchema>;

export class MontageV2Service {
  private readonly activeExports = new Map<string, AbortController>();
  private readonly waveformCache = new Map<string, Promise<MontageAudioWaveform>>();
  private manifest: MontageManifest = { schemaVersion: 1, assets: [], drafts: [] };
  private loadPromise: Promise<void> | null = null;
  private disposed = false;

  public async importAudio(): Promise<MontageAudioAsset | null> {
    this.assertActive();
    await this.ensureLoaded();
    const selection = await dialog.showOpenDialog({
      title: 'Add music to montage',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'] }],
    });
    const sourcePath = selection.filePaths[0];
    if (selection.canceled || !sourcePath) return null;
    const extension = extname(sourcePath).toLocaleLowerCase();
    if (!supportedAudioExtensions.has(extension)) {
      throw new Error('Choose an MP3, WAV, M4A, AAC, FLAC, OGG, or Opus file.');
    }

    const [file, media] = await Promise.all([stat(sourcePath), probeMontageAudio(sourcePath)]);
    if (!file.isFile()) throw new Error('The selected music source is not a file.');
    if (file.size > maximumImportedAudioBytes) throw new Error('Music files must be smaller than 4 GB.');
    if (media.durationMs > 6 * 60 * 60 * 1_000) throw new Error('Music files must be shorter than six hours.');

    const id = randomUUID();
    const fileName = `${id}${extension}`;
    const destination = join(this.assetDirectory(), fileName);
    await mkdir(this.assetDirectory(), { recursive: true });
    await copyFile(sourcePath, destination);
    const asset: ManagedAsset = managedAssetSchema.parse({
      id,
      fileName,
      name: parse(sourcePath).name,
      originalName: basename(sourcePath),
      durationMs: media.durationMs,
      fileSize: file.size,
      ...(media.codec ? { codec: media.codec } : {}),
      createdAt: Date.now(),
    });

    this.manifest.assets.push(asset);
    try {
      await this.persist();
    } catch (error) {
      this.manifest.assets = this.manifest.assets.filter((candidate) => candidate.id !== id);
      await rm(destination, { force: true });
      throw error;
    }
    return publicAsset(asset);
  }

  public async loadAudioWaveform(assetId: string): Promise<MontageAudioWaveform> {
    this.assertActive();
    await this.ensureLoaded();
    const asset = this.manifest.assets.find((candidate) => candidate.id === assetId);
    if (!asset) throw new Error('The imported music asset no longer exists.');
    const cached = this.waveformCache.get(assetId);
    if (cached) return cached;
    const path = this.assetPath(asset);
    if (!existsSync(path)) throw new Error('The imported music file is missing. Replace it before exporting.');
    const pending = readMontageAudioWaveform(path, asset.durationMs)
      .then((samples) => ({ assetId, samples }))
      .catch((error) => {
        this.waveformCache.delete(assetId);
        throw error;
      });
    this.waveformCache.set(assetId, pending);
    return pending;
  }

  public async listDrafts(): Promise<MontageProjectV2[]> {
    this.assertActive();
    await this.ensureLoaded();
    return structuredClone([...this.manifest.drafts].sort((left, right) => right.updatedAt - left.updatedAt));
  }

  public async saveDraft(input: MontageProjectV2): Promise<MontageProjectV2> {
    this.assertActive();
    await this.ensureLoaded();
    const project = this.canonicalizeProject(input);
    const saved = montageProjectV2Schema.parse({ ...project, updatedAt: Date.now() });
    const existingIndex = this.manifest.drafts.findIndex((candidate) => candidate.id === saved.id);
    if (existingIndex >= 0) this.manifest.drafts.splice(existingIndex, 1);
    this.manifest.drafts.unshift(saved);
    this.manifest.drafts = this.manifest.drafts
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, maximumDrafts);
    await this.persist();
    return structuredClone(saved);
  }

  public async deleteDraft(projectId: string): Promise<void> {
    this.assertActive();
    await this.ensureLoaded();
    const previousLength = this.manifest.drafts.length;
    this.manifest.drafts = this.manifest.drafts.filter((candidate) => candidate.id !== projectId);
    if (this.manifest.drafts.length !== previousLength) await this.persist();
  }

  public async export(
    input: { exportId: string; project: MontageProjectV2; preset: ClipExportPreset },
    clips: readonly Clip[],
  ): Promise<boolean> {
    this.assertActive();
    await this.ensureLoaded();
    const project = this.canonicalizeProject(input.project);
    const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
    const entries = project.segments.map((segment) => ({ segment, clip: clipsById.get(segment.clipId) }));
    const missing = entries.filter((entry) => !entry.clip || !existsSync(entry.clip.path));
    if (missing.length > 0) {
      const names = missing.slice(0, 3).map((entry) => entry.clip?.name ?? entry.segment.clipId).join(', ');
      throw new Error(`Montage source unavailable: ${names}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''}. Remove or restore it before exporting.`);
    }
    for (const entry of entries) {
      const clip = entry.clip;
      if (!clip) continue;
      if (entry.segment.sourceDurationMs !== clip.durationMs) {
        throw new Error(`${clip.name} changed after this montage was opened. Reopen the draft to refresh its media metadata.`);
      }
    }

    const musicAsset = project.music
      ? this.manifest.assets.find((candidate) => candidate.id === project.music?.asset.id)
      : undefined;
    const musicPath = musicAsset ? this.assetPath(musicAsset) : undefined;
    if (project.music && (!musicPath || !existsSync(musicPath))) {
      throw new Error('The imported music file is missing. Replace it or remove the music track before exporting.');
    }

    const suffix = input.preset === 'original' ? '' : `-${input.preset}`;
    const canvasSuffix = project.canvasSize === '9:16' ? '-9x16' : '';
    const selection = await dialog.showSaveDialog({
      title: 'Export montage',
      defaultPath: join(app.getPath('videos'), `${sanitizeFileBase(project.name)}${canvasSuffix}${suffix}.mp4`),
      filters: [{ name: 'Video', extensions: ['mp4'] }],
    });
    if (selection.canceled || !selection.filePath) return false;
    const destination = resolve(selection.filePath);
    const destinationKey = destination.toLocaleLowerCase();
    if (entries.some((entry) => entry.clip && resolve(entry.clip.path).toLocaleLowerCase() === destinationKey)) {
      throw new Error('Choose a different file name so every source clip stays intact.');
    }
    if (musicPath && resolve(musicPath).toLocaleLowerCase() === destinationKey) {
      throw new Error('Choose a different file name so the imported music stays intact.');
    }

    const proportionalSourceBytes = entries.reduce((total, entry) => {
      if (!entry.clip) return total;
      const duration = entry.segment.trimEndMs - entry.segment.trimStartMs;
      return total + entry.clip.fileSize * duration / Math.max(1, entry.clip.durationMs);
    }, 0);
    const finalBytes = input.preset === 'original'
      ? proportionalSourceBytes
      : presetTargetBytes(input.preset);
    await Promise.all([
      ensureDiskSpace(dirname(destination), Math.ceil(finalBytes + 96 * 1_024 * 1_024), 'destination'),
      ensureDiskSpace(tmpdir(), Math.ceil(proportionalSourceBytes * 1.35 + 192 * 1_024 * 1_024), 'temporary export'),
    ]);

    const controller = new AbortController();
    this.activeExports.set(input.exportId, controller);
    try {
      await this.saveDraft(project);
      await renderMontageV2({
        project,
        entries: entries.map((entry) => ({ clip: entry.clip!, segment: entry.segment })),
        ...(musicPath ? { musicPath } : {}),
        destination,
        preset: input.preset,
        signal: controller.signal,
      });
    } catch (error) {
      await rm(destination, { force: true });
      if (controller.signal.aborted) return false;
      throw error;
    } finally {
      this.activeExports.delete(input.exportId);
    }
    return true;
  }

  public cancelExport(exportId: string): void {
    this.activeExports.get(exportId)?.abort();
  }

  public async resolveAssetPath(assetId: string): Promise<string | null> {
    if (this.disposed) return null;
    await this.ensureLoaded();
    const asset = this.manifest.assets.find((candidate) => candidate.id === assetId);
    if (!asset) return null;
    const path = this.assetPath(asset);
    return existsSync(path) ? path : null;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.activeExports.values()) controller.abort();
    this.activeExports.clear();
    this.waveformCache.clear();
  }

  private canonicalizeProject(input: MontageProjectV2): MontageProjectV2 {
    const parsed = montageProjectV2Schema.parse(input);
    if (!parsed.music) return parsed;
    const managed = this.manifest.assets.find((candidate) => candidate.id === parsed.music?.asset.id);
    if (!managed) throw new Error('The montage references an imported music asset that no longer exists.');
    return montageProjectV2Schema.parse({
      ...parsed,
      music: { ...parsed.music, asset: publicAsset(managed) },
    });
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.load();
    return this.loadPromise;
  }

  private async load(): Promise<void> {
    await Promise.all([
      mkdir(this.rootDirectory(), { recursive: true }),
      mkdir(this.assetDirectory(), { recursive: true }),
    ]);
    try {
      const source = await readFile(this.manifestPath(), 'utf8');
      this.manifest = montageManifestSchema.parse(JSON.parse(source));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'ENOENT') {
        const backup = `${this.manifestPath()}.invalid-${Date.now()}`;
        try { await rename(this.manifestPath(), backup); } catch { }
        console.warn('Montage v2 state was invalid and has been preserved for recovery.', error);
      }
      this.manifest = { schemaVersion: 1, assets: [], drafts: [] };
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    const parsed = montageManifestSchema.parse(this.manifest);
    const temporary = `${this.manifestPath()}.${randomUUID()}.tmp`;
    await mkdir(this.rootDirectory(), { recursive: true });
    try {
      await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
      await rename(temporary, this.manifestPath());
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private rootDirectory(): string {
    return join(app.getPath('userData'), 'montage-v2');
  }

  private assetDirectory(): string {
    return join(this.rootDirectory(), 'audio');
  }

  private manifestPath(): string {
    return join(this.rootDirectory(), 'manifest.json');
  }

  private assetPath(asset: ManagedAsset): string {
    return join(this.assetDirectory(), asset.fileName);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Montage service is shutting down.');
  }
}

let montageV2Service: MontageV2Service | null = null;

export function getMontageV2Service(): MontageV2Service {
  montageV2Service ??= new MontageV2Service();
  return montageV2Service;
}

export function disposeMontageV2Service(): void {
  montageV2Service?.dispose();
  montageV2Service = null;
}

function publicAsset(asset: ManagedAsset): MontageAudioAsset {
  const { fileName: _fileName, ...publicFields } = asset;
  return publicFields;
}

function sanitizeFileBase(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100);
  return sanitized || 'Switchboard montage';
}

function presetTargetBytes(preset: Exclude<ClipExportPreset, 'original'>): number {
  if (preset === '10mb') return 10 * 1_024 * 1_024;
  if (preset === '25mb') return 25 * 1_024 * 1_024;
  return 50 * 1_024 * 1_024;
}

async function ensureDiskSpace(path: string, requiredBytes: number, label: string): Promise<void> {
  const volume = await statfs(path);
  const availableBytes = Number(volume.bavail) * Number(volume.bsize);
  if (availableBytes < requiredBytes) {
    throw new Error(`Not enough free space on the ${label} drive. Free at least ${formatBytes(requiredBytes - availableBytes)} and try again.`);
  }
}

function formatBytes(bytes: number): string {
  const value = Math.max(0, bytes);
  if (value >= 1_024 ** 3) return `${Math.ceil(value / 1_024 ** 3 * 10) / 10} GB`;
  return `${Math.ceil(value / 1_024 ** 2)} MB`;
}
