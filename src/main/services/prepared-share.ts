import { existsSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { app, shell } from 'electron';
import type { PreparedShareFile } from '../../shared/contracts';

type PreparedShareRecord = PreparedShareFile & {
  path: string;
  iconPath?: string;
  temporary: boolean;
};

export class PreparedShareService {
  private readonly records = new Map<string, PreparedShareRecord>();
  private readonly sessionDirectory = join(app.getPath('temp'), 'Switchboard', 'Share', String(process.pid));

  public async allocate(id: string, fileName: string): Promise<string> {
    const safeName = basename(fileName);
    if (!safeName || safeName !== fileName) throw new Error('The prepared share file name is invalid.');
    const directory = join(this.sessionDirectory, id);
    await mkdir(directory, { recursive: true });
    return join(directory, safeName);
  }

  public async register(id: string, path: string, name: string, options: { iconPath?: string; temporary: boolean }): Promise<PreparedShareFile> {
    const resolvedPath = resolve(path);
    const file = await stat(resolvedPath);
    if (!file.isFile()) throw new Error('The prepared share output is not a file.');
    const result: PreparedShareFile = { id, name: basename(name), fileSize: file.size };
    this.records.set(id, {
      ...result,
      path: resolvedPath,
      ...(options.iconPath ? { iconPath: options.iconPath } : {}),
      temporary: options.temporary,
    });
    return result;
  }

  public resolve(id: string): PreparedShareRecord | null {
    const record = this.records.get(id);
    if (!record || !existsSync(record.path)) return null;
    return record;
  }

  public reveal(id: string): void {
    const record = this.resolve(id);
    if (!record) throw new Error('The prepared share file is no longer available. Prepare it again.');
    shell.showItemInFolder(record.path);
  }

  public async discard(id: string): Promise<void> {
    this.records.delete(id);
    await rm(join(this.sessionDirectory, id), { recursive: true, force: true });
  }

  public async dispose(): Promise<void> {
    this.records.clear();
    await rm(this.sessionDirectory, { recursive: true, force: true });
  }
}

let preparedShareService: PreparedShareService | null = null;

export function getPreparedShareService(): PreparedShareService {
  preparedShareService ??= new PreparedShareService();
  return preparedShareService;
}

export async function disposePreparedShareService(): Promise<void> {
  await preparedShareService?.dispose();
  preparedShareService = null;
}
