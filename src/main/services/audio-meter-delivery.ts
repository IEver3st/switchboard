export class AudioMeterDeliveryGate {
  private requestedWebContentsId: number | null = null;

  setRequested(webContentsId: number, requested: boolean): boolean {
    if (requested) {
      if (this.requestedWebContentsId === webContentsId) return false;
      this.requestedWebContentsId = webContentsId;
      return true;
    }

    if (this.requestedWebContentsId !== webContentsId) return false;
    this.requestedWebContentsId = null;
    return true;
  }

  shouldDeliver(webContentsId: number, windowVisible: boolean): boolean {
    return windowVisible && this.requestedWebContentsId === webContentsId;
  }

  clear(webContentsId: number): boolean {
    if (this.requestedWebContentsId !== webContentsId) return false;
    this.requestedWebContentsId = null;
    return true;
  }
}
