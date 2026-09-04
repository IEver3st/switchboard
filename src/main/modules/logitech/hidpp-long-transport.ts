import { HIDAsync } from 'node-hid';

const longReportId = 0x11;
const longReportLength = 20;
const installedSoftwareId = 0x07;
const developmentSoftwareId = 0x08;
const nativeReviewSoftwareId = 0x09;
const defaultRequestTimeoutMs = 1_200;
// Some LIGHTSPEED receivers repeat a reply after the matching request has
// already resolved. HID++ has no transaction ID beyond feature/function/SW ID,
// so give the input queue a brief chance to drain before issuing another
// request with the same address.
const replyDrainDurationMs = 20;

type NotificationListener = (report: Buffer) => void;

interface PendingRequest {
  deviceIndex: number;
  featureIndex: number;
  address: number;
  resolve: (report: Buffer) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * One non-exclusive HID++ long-report channel.
 *
 * Requests are serialized because HID++ has no request ID beyond the feature,
 * function, and four-bit software ID. Unsolicited reports remain event-driven
 * so MouseButtonSpy never introduces a polling loop.
 */
export class HidppLongTransport {
  private pending: PendingRequest | null = null;
  private tail: Promise<void> = Promise.resolve();
  private readonly notificationListeners = new Set<NotificationListener>();
  private closed = false;

  private constructor(
    private readonly handle: HIDAsync,
    private readonly softwareId = resolveHidppSoftwareId(),
  ) {
    if (!Number.isInteger(softwareId) || softwareId < 1 || softwareId > 0x0f) {
      throw new Error('The HID++ software ID must be a non-zero four-bit value.');
    }
    this.handle.on('data', this.onData);
    this.handle.on('error', this.onError);
  }

  public static async open(path: string): Promise<HidppLongTransport> {
    const handle = await HIDAsync.open(path, { nonExclusive: true });
    return new HidppLongTransport(handle);
  }

  public request(
    deviceIndex: number,
    featureIndex: number,
    functionId: number,
    parameters: readonly number[] = [],
    timeoutMs = defaultRequestTimeoutMs,
  ): Promise<Buffer> {
    if (parameters.length > 16) throw new Error('A HID++ long report accepts at most 16 parameter bytes.');
    if (this.closed) return Promise.reject(new Error('The HID++ channel is closed.'));

    const operation = this.tail.then(
      () => this.performRequest(deviceIndex, featureIndex, functionId, parameters, timeoutMs),
      () => this.performRequest(deviceIndex, featureIndex, functionId, parameters, timeoutMs),
    );
    this.tail = operation.then(waitForReplyDrain, waitForReplyDrain);
    return operation;
  }

  public async getFeatureIndex(deviceIndex: number, featureId: number, timeoutMs?: number): Promise<number | null> {
    const response = await this.request(
      deviceIndex,
      0x00,
      0,
      [featureId >>> 8, featureId & 0xff, 0x00],
      timeoutMs,
    );
    return response[4] ? response[4] : null;
  }

  public subscribe(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.handle.off('data', this.onData);
    this.handle.off('error', this.onError);
    this.rejectPending(new Error('The HID++ channel closed.'));
    this.notificationListeners.clear();
    await this.handle.close();
  }

  private performRequest(
    deviceIndex: number,
    featureIndex: number,
    functionId: number,
    parameters: readonly number[],
    timeoutMs: number,
  ): Promise<Buffer> {
    if (this.closed) return Promise.reject(new Error('The HID++ channel is closed.'));
    const address = (functionId << 4) | this.softwareId;
    const report = Buffer.alloc(longReportLength);
    report.set([longReportId, deviceIndex, featureIndex, address, ...parameters]);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending?.resolve !== resolve) return;
        this.pending = null;
        reject(new Error(`HID++ request timed out for feature 0x${featureIndex.toString(16).padStart(2, '0')}, function ${functionId}.`));
      }, timeoutMs);
      this.pending = { deviceIndex, featureIndex, address, resolve, reject, timer };
      void this.handle.write(report).catch((error) => {
        if (this.pending?.resolve !== resolve) return;
        clearTimeout(timer);
        this.pending = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private readonly onData = (data: Buffer): void => {
    if (data[0] !== longReportId) return;
    const pending = this.pending;
    if (pending && data[1] === pending.deviceIndex) {
      if (data[2] === pending.featureIndex && data[3] === pending.address) {
        clearTimeout(pending.timer);
        this.pending = null;
        pending.resolve(Buffer.from(data));
        return;
      }
      if (data[2] === 0xff && data[3] === pending.featureIndex && data[4] === pending.address) {
        clearTimeout(pending.timer);
        this.pending = null;
        pending.reject(new Error(hidppErrorMessage(data[5] ?? 0xff)));
        return;
      }
    }

    for (const listener of this.notificationListeners) listener(Buffer.from(data));
  };

  private readonly onError = (error: Error): void => {
    this.rejectPending(error);
  };

  private rejectPending(error: Error): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    const { reject } = this.pending;
    this.pending = null;
    reject(error);
  }
}

export function resolveHidppSoftwareId(environment: NodeJS.ProcessEnv = process.env): number {
  const configured = Number.parseInt(environment.SWITCHBOARD_HIDPP_SOFTWARE_ID ?? '', 16);
  if (Number.isInteger(configured) && configured >= 1 && configured <= 0x0f) return configured;
  if (environment.SWITCHBOARD_NATIVE_REVIEW === '1') return nativeReviewSoftwareId;
  if (environment.ELECTRON_RENDERER_URL) return developmentSoftwareId;
  return installedSoftwareId;
}

function waitForReplyDrain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, replyDrainDurationMs));
}

function hidppErrorMessage(code: number): string {
  const label = new Map<number, string>([
    [0x01, 'invalid argument'],
    [0x02, 'out of range'],
    [0x03, 'hardware error'],
    [0x04, 'Logitech protocol error'],
    [0x05, 'invalid feature index'],
    [0x06, 'invalid function'],
    [0x07, 'busy'],
    [0x08, 'unsupported'],
  ]).get(code);
  return `HID++ rejected the request${label ? `: ${label}` : ` with error 0x${code.toString(16).padStart(2, '0')}`}.`;
}
