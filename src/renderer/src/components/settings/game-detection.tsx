import { Gamepad2, LoaderCircle, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { DetectedGameSource, SystemSnapshot } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { useSystemStore } from '@/stores/use-system-store';
import {
  SettingSection,
  SettingSwitch,
  SettingsCategoryHeader,
} from './settings-primitives';

export function GameDetectionSettings({
  snapshot,
  onReset,
}: {
  snapshot: SystemSnapshot;
  onReset?: () => void;
}) {
  const updateSettings = useSystemStore((state) => state.updateSettings);
  const scanGames = useSystemStore((state) => state.scanGames);
  const addGame = useSystemStore((state) => state.addGame);
  const [isAdding, setIsAdding] = useState(false);
  const gameDetection = snapshot.gameDetection;
  const isScanning = gameDetection.scanState === 'scanning';
  const isPreview = gameDetection.capability === 'simulation';

  return (
    <div className="settings-games">
      <SettingsCategoryHeader
        title="Games"
        description={isPreview
          ? 'The browser preview uses sample launcher data. Desktop Switchboard reads installed Steam and Epic manifests locally.'
          : 'Switchboard reads installed Steam and Epic launcher manifests locally. Add an executable for games installed elsewhere.'}
        onReset={onReset}
      />

      <SettingSection title="Detection">
        <SettingSwitch
          settingId="games.automaticScan"
          title="Automatically scan for games"
          description="Run one launcher-library scan when Switchboard starts. No background polling process is kept alive."
          checked={snapshot.settings.scanGamesAutomatically}
          disabled={isScanning}
          onCheckedChange={(scanGamesAutomatically) => void updateSettings({ scanGamesAutomatically })}
        />
      </SettingSection>

      <section className="settings-game-library" aria-labelledby="detected-games-title">
        <div id="setting-games.library" className="settings-game-library__toolbar" tabIndex={-1}>
          <div className="settings-game-library__heading">
            <h3 id="detected-games-title">
              Detected games <span>({gameDetection.games.length})</span>
            </h3>
            <p className="settings-game-library__status" role="status" aria-live="polite">
              {scanStatus(snapshot)}
            </p>
          </div>
          <div className="settings-game-library__actions">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isScanning || isAdding}
              onClick={() => void scanGames()}
            >
              {isScanning ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
              {isScanning ? 'Scanning…' : 'Scan now'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={isScanning || isAdding || isPreview}
              title={isPreview ? 'Manual executable selection is available in the desktop application.' : undefined}
              onClick={() => {
                setIsAdding(true);
                void addGame().finally(() => setIsAdding(false));
              }}
            >
              <Plus className="size-3.5" aria-hidden />
              {isAdding ? 'Choosing…' : 'Add game'}
            </Button>
          </div>
        </div>

        {gameDetection.error ? (
          <p className="settings-game-library__message settings-game-library__message--error" role="alert">
            {gameDetection.error}
          </p>
        ) : null}
        {gameDetection.warning ? (
          <p className="settings-game-library__message" role="status">
            {gameDetection.warning} Existing results were kept where possible.
          </p>
        ) : null}

        <div className="settings-game-library__list" data-game-library-scroll>
          {gameDetection.games.length > 0 ? (
            <ul aria-label="Detected games">
              {gameDetection.games.map((game) => (
                <li key={game.id} className="settings-game-row">
                  <GameArtwork iconDataUrl={game.iconDataUrl} />
                  <div className="settings-game-row__copy">
                    <strong>{game.name}</strong>
                    <span title={game.executablePath ?? game.installDirectory}>
                      {sourceLabel(game.source)} · {game.executablePath ?? game.installDirectory}
                    </span>
                  </div>
                  <span className="settings-game-row__source">{sourceShortLabel(game.source)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="settings-game-library__empty" role="status">
              <Gamepad2 aria-hidden />
              <strong>No games detected</strong>
              <span>Run a scan or add a game executable.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function GameArtwork({ iconDataUrl }: { iconDataUrl?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const canShowImage = Boolean(iconDataUrl && iconDataUrl !== failedUrl);
  return (
    <div className="settings-game-row__art" aria-hidden>
      {canShowImage ? (
        <img src={iconDataUrl} alt="" onError={() => setFailedUrl(iconDataUrl ?? null)} />
      ) : (
        <Gamepad2 />
      )}
    </div>
  );
}

function scanStatus(snapshot: SystemSnapshot): string {
  const detection = snapshot.gameDetection;
  if (detection.scanState === 'scanning') return 'Scanning launcher libraries…';
  if (detection.scanState === 'error') return 'The last scan did not finish.';
  if (!detection.lastScanAt) return 'Not scanned yet';
  return `Last scan ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(detection.lastScanAt))}`;
}

function sourceLabel(source: DetectedGameSource): string {
  if (source === 'steam') return 'Steam library';
  if (source === 'epic') return 'Epic Games library';
  return 'Manually added';
}

function sourceShortLabel(source: DetectedGameSource): string {
  if (source === 'steam') return 'Steam';
  if (source === 'epic') return 'Epic';
  return 'Manual';
}
