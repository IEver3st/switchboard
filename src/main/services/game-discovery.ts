import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { basename, delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { DetectedGame } from '../../shared/contracts';

const execFileAsync = promisify(execFile);

export type GameDiscoveryOptions = {
  environment?: NodeJS.ProcessEnv;
  steamRoots?: readonly string[];
  epicManifestDirectories?: readonly string[];
  queryRegistry?: boolean;
  extractExecutableIcon?: (executablePath: string) => Promise<string | undefined>;
};

export type GameScanResult = {
  games: DetectedGame[];
  warnings: string[];
};

export class GameDiscoveryService {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly steamRoots?: readonly string[];
  private readonly epicManifestDirectories?: readonly string[];
  private readonly queryRegistry: boolean;
  private readonly extractExecutableIcon?: (executablePath: string) => Promise<string | undefined>;

  public constructor(options: GameDiscoveryOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.steamRoots = options.steamRoots
      ?? readPathList(this.environment.SWITCHBOARD_GAME_SCAN_STEAM_ROOTS);
    this.epicManifestDirectories = options.epicManifestDirectories
      ?? readPathList(this.environment.SWITCHBOARD_GAME_SCAN_EPIC_MANIFESTS);
    this.queryRegistry = options.queryRegistry
      ?? (process.platform === 'win32' && this.environment.SWITCHBOARD_NATIVE_FIXTURES !== '1');
    this.extractExecutableIcon = options.extractExecutableIcon;
  }

  public async scan(): Promise<GameScanResult> {
    const warnings: string[] = [];
    const [steamGames, epicGames] = await Promise.all([
      this.scanSteam(warnings),
      this.scanEpic(warnings),
    ]);
    const games = deduplicateGames([...steamGames, ...epicGames]);
    games.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
    return { games, warnings };
  }

  public async fromExecutable(executablePath: string): Promise<DetectedGame> {
    const resolvedPath = resolve(executablePath);
    if (extname(resolvedPath).toLocaleLowerCase() !== '.exe') {
      throw new Error('Choose a Windows game executable (.exe).');
    }
    const file = await stat(resolvedPath);
    if (!file.isFile()) throw new Error('The selected game executable is not a file.');

    const name = basename(resolvedPath, extname(resolvedPath)).trim();
    if (!name) throw new Error('The selected executable does not have a usable game name.');
    return createGame({
      name,
      source: 'manual',
      installDirectory: dirname(resolvedPath),
      executablePath: resolvedPath,
      launchUri: null,
      iconDataUrl: await this.readExecutableIcon(resolvedPath),
    });
  }

  private async scanSteam(warnings: string[]): Promise<DetectedGame[]> {
    const roots = this.steamRoots
      ? [...this.steamRoots]
      : await this.findSteamRoots();
    const libraries = new Set<string>();

    for (const root of roots) {
      if (!(await directoryExists(root))) continue;
      libraries.add(resolve(root));
      const libraryFile = join(root, 'steamapps', 'libraryfolders.vdf');
      try {
        const contents = await readFile(libraryFile, 'utf8');
        for (const path of parseSteamLibraryPaths(contents)) libraries.add(resolve(path));
      } catch (error) {
        if (!isMissing(error)) warnings.push(`Steam libraries could not be read from ${root}.`);
      }
    }

    const games: DetectedGame[] = [];
    for (const library of libraries) {
      const steamApps = join(library, 'steamapps');
      let manifests: string[];
      try {
        manifests = (await readdir(steamApps))
          .filter((entry) => /^appmanifest_\d+\.acf$/i.test(entry));
      } catch (error) {
        if (!isMissing(error)) warnings.push(`A Steam library could not be scanned at ${library}.`);
        continue;
      }

      for (const manifest of manifests) {
        try {
          const contents = await readFile(join(steamApps, manifest), 'utf8');
          const name = readVdfString(contents, 'name');
          const installFolder = readVdfString(contents, 'installdir');
          const appId = manifest.match(/appmanifest_(\d+)\.acf/i)?.[1];
          if (!name || !installFolder || !appId) continue;
          const installDirectory = join(steamApps, 'common', installFolder);
          if (!(await directoryExists(installDirectory))) continue;
          games.push(createGame({
            name,
            source: 'steam',
            installDirectory,
            executablePath: null,
            launchUri: `steam://rungameid/${appId}`,
            iconDataUrl: await readSteamIconDataUrl([...roots, ...libraries], appId),
          }));
        } catch {
          warnings.push(`A Steam game manifest could not be read at ${join(steamApps, manifest)}.`);
        }
      }
    }
    return games;
  }

  private async scanEpic(warnings: string[]): Promise<DetectedGame[]> {
    const manifestDirectories = this.epicManifestDirectories
      ? [...this.epicManifestDirectories]
      : this.defaultEpicManifestDirectories();
    const games: DetectedGame[] = [];

    for (const manifestDirectory of manifestDirectories) {
      let manifests: string[];
      try {
        manifests = (await readdir(manifestDirectory)).filter((entry) => entry.toLocaleLowerCase().endsWith('.item'));
      } catch (error) {
        if (!isMissing(error)) warnings.push(`Epic Games manifests could not be read from ${manifestDirectory}.`);
        continue;
      }

      for (const manifest of manifests) {
        try {
          const value = JSON.parse(await readFile(join(manifestDirectory, manifest), 'utf8')) as Record<string, unknown>;
          const name = typeof value.DisplayName === 'string' ? value.DisplayName.trim() : '';
          const installDirectory = typeof value.InstallLocation === 'string' ? value.InstallLocation.trim() : '';
          const executable = typeof value.LaunchExecutable === 'string' ? value.LaunchExecutable.trim() : '';
          if (!name || !installDirectory || !(await directoryExists(installDirectory))) continue;
          const executablePath = executable
            ? (isAbsolute(executable) ? executable : join(installDirectory, executable))
            : null;
          const appName = typeof value.AppName === 'string' ? value.AppName.trim() : '';
          games.push(createGame({
            name,
            source: 'epic',
            installDirectory,
            executablePath,
            launchUri: appName ? `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch` : null,
            iconDataUrl: executablePath ? await this.readExecutableIcon(executablePath) : undefined,
          }));
        } catch {
          warnings.push(`An Epic Games manifest could not be read at ${join(manifestDirectory, manifest)}.`);
        }
      }
    }
    return games;
  }

  private async findSteamRoots(): Promise<string[]> {
    const roots = new Set<string>();
    const programFilesX86 = readEnvironment(this.environment, 'PROGRAMFILES(X86)');
    const programFiles = readEnvironment(this.environment, 'PROGRAMFILES');
    if (programFilesX86) roots.add(join(programFilesX86, 'Steam'));
    if (programFiles) roots.add(join(programFiles, 'Steam'));

    if (this.queryRegistry) {
      const [currentUser, localMachine] = await Promise.all([
        readRegistryString('HKCU\\Software\\Valve\\Steam', 'SteamPath'),
        readRegistryString('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'),
      ]);
      if (currentUser) roots.add(currentUser);
      if (localMachine) roots.add(localMachine);
    }
    return [...roots];
  }

  private defaultEpicManifestDirectories(): string[] {
    const programData = readEnvironment(this.environment, 'PROGRAMDATA');
    return programData
      ? [join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')]
      : [];
  }

  private async readExecutableIcon(executablePath: string): Promise<string | undefined> {
    if (!this.extractExecutableIcon) return undefined;
    try {
      return await this.extractExecutableIcon(executablePath);
    } catch {
      return undefined;
    }
  }
}

export function gameIdentityKey(game: Pick<DetectedGame, 'executablePath' | 'installDirectory' | 'launchUri'>): string {
  return (game.executablePath ?? game.installDirectory ?? game.launchUri ?? '').replace(/[\\/]+$/, '').toLocaleLowerCase();
}

function createGame(input: Omit<DetectedGame, 'id' | 'addedAt'>): DetectedGame {
  const identity = gameIdentityKey(input);
  return {
    ...input,
    id: `game-${createHash('sha256').update(identity).digest('hex').slice(0, 20)}`,
    addedAt: new Date().toISOString(),
  };
}

function deduplicateGames(games: DetectedGame[]): DetectedGame[] {
  const byIdentity = new Map<string, DetectedGame>();
  for (const game of games) {
    const key = gameIdentityKey(game);
    if (!byIdentity.has(key)) byIdentity.set(key, game);
  }
  return [...byIdentity.values()];
}

async function readSteamIconDataUrl(roots: readonly string[], appId: string): Promise<string | undefined> {
  const visited = new Set<string>();
  for (const root of roots) {
    const iconDirectory = join(root, 'appcache', 'librarycache', appId);
    const normalizedDirectory = resolve(iconDirectory).toLocaleLowerCase();
    if (visited.has(normalizedDirectory)) continue;
    visited.add(normalizedDirectory);

    try {
      const iconFile = (await readdir(iconDirectory))
        .filter((entry) => /^[a-f0-9]{40}\.(?:jpe?g|png)$/i.test(entry))
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))[0];
      if (!iconFile) continue;
      const iconPath = join(iconDirectory, iconFile);
      const file = await stat(iconPath);
      if (!file.isFile() || file.size > 196_608) continue;
      const mimeType = /\.png$/i.test(iconFile) ? 'image/png' : 'image/jpeg';
      return `data:${mimeType};base64,${(await readFile(iconPath)).toString('base64')}`;
    } catch {
      // Missing or unreadable cached artwork is a per-game fallback, not a failed launcher scan.
    }
  }
  return undefined;
}

function parseSteamLibraryPaths(contents: string): string[] {
  const paths: string[] = [];
  const pattern = /"path"\s+"((?:\\.|[^"])*)"/gi;
  for (const match of contents.matchAll(pattern)) {
    const path = match[1]?.replace(/\\\\/g, '\\').replace(/\\"/g, '"').trim();
    if (path) paths.push(path);
  }
  return paths;
}

function readVdfString(contents: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = contents.match(new RegExp(`"${escapedKey}"\\s+"((?:\\\\.|[^"])*)"`, 'i'));
  return match?.[1]?.replace(/\\\\/g, '\\').replace(/\\"/g, '"').trim() || null;
}

async function readRegistryString(key: string, valueName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', key, '/v', valueName], {
      encoding: 'utf8',
      timeout: 3_000,
      windowsHide: true,
    });
    const line = stdout.split(/\r?\n/).find((candidate) => candidate.toLocaleLowerCase().includes(valueName.toLocaleLowerCase()));
    return line?.match(/REG_SZ\s+(.+)$/i)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function readEnvironment(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const entry = Object.entries(environment).find(([key]) => key.toLocaleUpperCase() === name.toLocaleUpperCase());
  return entry?.[1];
}

function readPathList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const paths = value.split(delimiter).map((path) => path.trim()).filter(Boolean);
  return paths.length > 0 ? paths : undefined;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
