const battlefield6GepGameId = 26462;
const requiredFeatures = ['game_info', 'match_info'] as const;
const packageReadyTimeoutMs = 10_000;

type EventListener = (...arguments_: unknown[]) => void;

type EventSource = {
  on(event: string, listener: EventListener): unknown;
  removeListener(event: string, listener: EventListener): unknown;
};

type GepLaunchEvent = {
  enable(): void;
};

type OverwolfGepApi = EventSource & {
  setRequiredFeatures(gameId: number, features: readonly string[] | null): Promise<unknown>;
};

type OverwolfPackages = EventSource & {
  gep?: OverwolfGepApi;
};

export type OverwolfRuntimeHost = {
  overwolf?: {
    packages?: OverwolfPackages;
  };
};

export type Battlefield6GepCallbacks = {
  onListening(): void;
  onWaiting(message: string): void;
  onEvent(payload: unknown): void;
  onInfo(payload: unknown): void;
  onError(message: string): void;
};

export interface Battlefield6GepSession {
  start(callbacks: Battlefield6GepCallbacks): void;
  stop(): void;
}

export function hasOverwolfGepRuntime(runtime: OverwolfRuntimeHost): boolean {
  const packages = runtime.overwolf?.packages;
  return Boolean(packages && typeof packages.on === 'function' && typeof packages.removeListener === 'function');
}

export class OverwolfBattlefield6GepSession implements Battlefield6GepSession {
  private callbacks: Battlefield6GepCallbacks | null = null;
  private packages: OverwolfPackages | null = null;
  private api: OverwolfGepApi | null = null;
  private readyTimeout: NodeJS.Timeout | null = null;
  private started = false;

  public constructor(private readonly runtime: OverwolfRuntimeHost) {}

  public start(callbacks: Battlefield6GepCallbacks): void {
    if (this.started) return;
    const packages = this.runtime.overwolf?.packages;
    if (!packages) {
      callbacks.onError('The Overwolf Game Events runtime is unavailable.');
      return;
    }

    this.started = true;
    this.callbacks = callbacks;
    this.packages = packages;
    packages.on('ready', this.onPackageReady);
    if (packages.gep) this.attachApi(packages.gep);
    if (!this.api) {
      callbacks.onWaiting('Waiting for the Overwolf Game Events package.');
      this.readyTimeout = setTimeout(() => {
        this.readyTimeout = null;
        this.callbacks?.onError('The Overwolf Game Events package did not become ready.');
      }, packageReadyTimeoutMs);
      this.readyTimeout.unref?.();
    }
  }

  public stop(): void {
    if (this.readyTimeout) clearTimeout(this.readyTimeout);
    this.readyTimeout = null;
    this.packages?.removeListener('ready', this.onPackageReady);
    this.detachApi();
    this.packages = null;
    this.callbacks = null;
    this.started = false;
  }

  private readonly onPackageReady: EventListener = (...arguments_) => {
    const name = readStringArgument(arguments_, 1);
    if (name !== 'gep') return;
    const api = this.packages?.gep;
    if (!api) {
      this.callbacks?.onError('The Overwolf Game Events package reported ready without an API.');
      return;
    }
    this.attachApi(api);
  };

  private attachApi(api: OverwolfGepApi): void {
    if (this.api === api) return;
    this.detachApi();
    this.api = api;
    if (this.readyTimeout) clearTimeout(this.readyTimeout);
    this.readyTimeout = null;
    api.on('game-detected', this.onGameDetected);
    api.on('elevated-privileges-required', this.onElevatedPrivilegesRequired);
    api.on('new-info-update', this.onInfoUpdate);
    api.on('new-game-event', this.onGameEvent);
    api.on('error', this.onError);
    api.on('game-exit', this.onGameExit);
    this.callbacks?.onWaiting('Waiting for Battlefield 6 telemetry.');
  }

  private detachApi(): void {
    const api = this.api;
    if (!api) return;
    api.removeListener('game-detected', this.onGameDetected);
    api.removeListener('elevated-privileges-required', this.onElevatedPrivilegesRequired);
    api.removeListener('new-info-update', this.onInfoUpdate);
    api.removeListener('new-game-event', this.onGameEvent);
    api.removeListener('error', this.onError);
    api.removeListener('game-exit', this.onGameExit);
    this.api = null;
  }

  private readonly onGameDetected: EventListener = (...arguments_) => {
    if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
    const launchEvent = arguments_[0];
    if (!isGepLaunchEvent(launchEvent)) {
      this.callbacks?.onError('Battlefield 6 telemetry returned an invalid launch event.');
      return;
    }

    try {
      launchEvent.enable();
    } catch (error) {
      this.callbacks?.onError(`Battlefield 6 telemetry could not be enabled: ${errorMessage(error)}`);
      return;
    }

    void this.api?.setRequiredFeatures(battlefield6GepGameId, requiredFeatures)
      .then(() => this.callbacks?.onListening())
      .catch((error) => {
        this.callbacks?.onError(`Battlefield 6 telemetry features could not be enabled: ${errorMessage(error)}`);
      });
  };

  private readonly onElevatedPrivilegesRequired: EventListener = (...arguments_) => {
    if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
    this.callbacks?.onError('Battlefield 6 is elevated. Run the Overwolf Switchboard build at the same privilege level.');
  };

  private readonly onInfoUpdate: EventListener = (...arguments_) => {
    if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
    this.callbacks?.onListening();
    this.callbacks?.onInfo(arguments_[2]);
  };

  private readonly onGameEvent: EventListener = (...arguments_) => {
    if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
    this.callbacks?.onListening();
    this.callbacks?.onEvent(arguments_[2]);
  };

  private readonly onError: EventListener = (...arguments_) => {
    const gameId = readNumberArgument(arguments_, 1);
    if (gameId !== null && gameId !== battlefield6GepGameId) return;
    this.callbacks?.onError(`Overwolf Game Events error: ${boundedMessage(arguments_[2])}`);
  };

  private readonly onGameExit: EventListener = (...arguments_) => {
    if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
    this.callbacks?.onWaiting('Waiting for Battlefield 6 telemetry.');
  };
}

function isGepLaunchEvent(value: unknown): value is GepLaunchEvent {
  return typeof value === 'object' && value !== null && typeof (value as GepLaunchEvent).enable === 'function';
}

function readNumberArgument(arguments_: readonly unknown[], index: number): number | null {
  const value = arguments_[index];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function readStringArgument(arguments_: readonly unknown[], index: number): string | null {
  const value = arguments_[index];
  return typeof value === 'string' ? value : null;
}

function errorMessage(error: unknown): string {
  return boundedMessage(error instanceof Error ? error.message : error);
}

function boundedMessage(value: unknown): string {
  const message = typeof value === 'string' ? value : 'unknown error';
  return message.trim().slice(0, 160) || 'unknown error';
}
