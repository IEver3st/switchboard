import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameDiscoveryService } from '../src/main/services/game-discovery';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('game discovery', () => {
  it('scans Steam and Epic launcher manifests without crawling arbitrary folders', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-games-'));
    temporaryDirectories.push(directory);
    const steamRoot = join(directory, 'Steam');
    const steamApps = join(steamRoot, 'steamapps');
    const steamGame = join(steamApps, 'common', 'Signal Game');
    const epicManifests = join(directory, 'EpicManifests');
    const epicGame = join(directory, 'EpicLibrary', 'Route Game');
    const steamIconDirectory = join(steamRoot, 'appcache', 'librarycache', '1234');
    const steamIcon = Buffer.from('steam-icon-fixture');
    await Promise.all([
      mkdir(steamGame, { recursive: true }),
      mkdir(epicManifests, { recursive: true }),
      mkdir(join(epicGame, 'Binaries', 'Win64'), { recursive: true }),
      mkdir(steamIconDirectory, { recursive: true }),
    ]);
    await writeFile(join(steamApps, 'appmanifest_1234.acf'), `"AppState"\n{\n  "appid" "1234"\n  "name" "Signal Game"\n  "installdir" "Signal Game"\n}\n`);
    await writeFile(join(steamIconDirectory, `${'a'.repeat(40)}.jpg`), steamIcon);
    await writeFile(join(epicManifests, 'route.item'), JSON.stringify({
      DisplayName: 'Route Game',
      InstallLocation: epicGame,
      LaunchExecutable: 'Binaries\\Win64\\RouteGame.exe',
      AppName: 'route-game',
    }));

    const service = new GameDiscoveryService({
      steamRoots: [steamRoot],
      epicManifestDirectories: [epicManifests],
      queryRegistry: false,
      extractExecutableIcon: async (path) => `data:image/png;base64,${Buffer.from(path).toString('base64')}`,
    });
    const result = await service.scan();

    expect(result.warnings).toEqual([]);
    expect(result.games.map((game) => game.name)).toEqual(['Route Game', 'Signal Game']);
    expect(result.games.find((game) => game.source === 'steam')?.launchUri).toBe('steam://rungameid/1234');
    expect(result.games.find((game) => game.source === 'epic')?.executablePath).toBe(
      join(epicGame, 'Binaries\\Win64\\RouteGame.exe'),
    );
    expect(result.games.find((game) => game.source === 'steam')?.iconDataUrl).toBe(
      `data:image/jpeg;base64,${steamIcon.toString('base64')}`,
    );
    expect(result.games.find((game) => game.source === 'epic')?.iconDataUrl).toStartWith('data:image/png;base64,');
  });

  it('validates and creates a stable manual game entry from an executable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-manual-game-'));
    temporaryDirectories.push(directory);
    const executable = join(directory, 'Manual Game.exe');
    await writeFile(executable, 'fixture');
    const service = new GameDiscoveryService({
      steamRoots: [],
      epicManifestDirectories: [],
      queryRegistry: false,
      extractExecutableIcon: async () => 'data:image/png;base64,bWFudWFsLWljb24=',
    });

    const first = await service.fromExecutable(executable);
    const second = await service.fromExecutable(executable);

    expect(first.name).toBe('Manual Game');
    expect(first.source).toBe('manual');
    expect(first.executablePath).toBe(executable);
    expect(first.iconDataUrl).toBe('data:image/png;base64,bWFudWFsLWljb24=');
    expect(first.id).toBe(second.id);
  });

  it('keeps a discovered game when executable icon extraction fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-game-icon-failure-'));
    temporaryDirectories.push(directory);
    const executable = join(directory, 'Fallback Game.exe');
    await writeFile(executable, 'fixture');
    const service = new GameDiscoveryService({
      steamRoots: [],
      epicManifestDirectories: [],
      queryRegistry: false,
      extractExecutableIcon: async () => { throw new Error('No shell icon'); },
    });

    const game = await service.fromExecutable(executable);

    expect(game.name).toBe('Fallback Game');
    expect(game.iconDataUrl).toBeUndefined();
  });
});
