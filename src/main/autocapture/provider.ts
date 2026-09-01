import type {
  AutoCaptureProvider,
  CaptureSource,
  DetectedGame,
  GameEvent,
  GameEventSource,
  GameEventType,
  ProviderAvailability,
  ProviderStatus,
  ProviderSupportLevel,
} from '../../shared/contracts';

export type ProviderCapabilities = {
  events: readonly GameEventType[];
  nativeMultiKill: boolean;
};

export type ProviderDiscoveryContext = {
  detectedGames: readonly DetectedGame[];
  platform: NodeJS.Platform;
};

export type ActiveGameContext = ProviderDiscoveryContext & {
  gameId: string;
  displayName: string;
  source: CaptureSource;
  detectedGame?: DetectedGame;
};

export type AutoCaptureLog = (
  event: string,
  fields?: Readonly<Record<string, string | number | boolean | null>>,
) => void;

export type ProviderContext = ActiveGameContext & {
  log: AutoCaptureLog;
};

export interface GameEventProvider {
  readonly id: string;
  readonly gameId: string;
  readonly displayName: string;
  readonly supportLevel: ProviderSupportLevel;
  readonly source: GameEventSource;
  readonly capabilities: ProviderCapabilities;
  readonly developmentOnly?: boolean;

  matchesGame(source: CaptureSource, detectedGames: readonly DetectedGame[]): boolean;
  detectAvailability(context: ProviderDiscoveryContext): Promise<ProviderAvailability>;
  setup?(context: ProviderDiscoveryContext): Promise<ProviderAvailability>;
  start(context: ProviderContext): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (event: GameEvent) => void): () => void;
  getStatus(): ProviderStatus;
  getDiagnostics?(): Promise<Readonly<Record<string, string | number | boolean | null>>>;
}

export function providerSnapshot(
  provider: GameEventProvider,
  availability: ProviderAvailability,
): AutoCaptureProvider {
  return {
    id: provider.id,
    gameId: provider.gameId,
    displayName: provider.displayName,
    supportLevel: provider.supportLevel,
    source: provider.source,
    capabilities: {
      events: [...provider.capabilities.events],
      nativeMultiKill: provider.capabilities.nativeMultiKill,
    },
    availability,
    status: provider.getStatus(),
    developmentOnly: provider.developmentOnly ?? false,
  };
}
