import type { EventEmitter } from 'node:events';

export class AudioMeterDeliveryGate {
  private requestedWebContentsId: number | null = null;
  private releaseLifecycle: (() => void) | undefined;

  constructor(private readonly onDemandCleared: () => void = () => undefined) {}

  setRequested(webContentsId: number, requested: boolean, lifecycle?: EventEmitter): boolean {
    if (requested) {
      if (this.requestedWebContentsId === webContentsId) return false;
      this.releaseLifecycle?.();
      this.requestedWebContentsId = webContentsId;
      if (lifecycle) {
        const clear = () => {
          if (this.clear(webContentsId)) this.onDemandCleared();
        };
        const navigate = (_event: unknown, _url: string, isInPlace: boolean, isMainFrame: boolean) => {
          if (isMainFrame && !isInPlace) clear();
        };
        lifecycle.on('did-start-navigation', navigate);
        lifecycle.once('destroyed', clear);
        this.releaseLifecycle = () => {
          lifecycle.removeListener('did-start-navigation', navigate);
          lifecycle.removeListener('destroyed', clear);
          this.releaseLifecycle = undefined;
        };
      }
      return true;
    }

    return this.clear(webContentsId);
  }

  shouldDeliver(webContentsId: number, windowVisible: boolean): boolean {
    return windowVisible && this.requestedWebContentsId === webContentsId;
  }

  clear(webContentsId: number): boolean {
    if (this.requestedWebContentsId !== webContentsId) return false;
    this.releaseLifecycle?.();
    this.requestedWebContentsId = null;
    return true;
  }

  dispose(): void {
    if (this.requestedWebContentsId !== null) this.clear(this.requestedWebContentsId);
  }
}
