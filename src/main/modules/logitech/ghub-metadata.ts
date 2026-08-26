import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const activeInterfaceSchema = z.object({
  type: z.string(),
  id: z.string(),
  pid: z.number().int().nonnegative(),
  extendedModel: z.number().int().nonnegative().optional(),
  serialNumber: z.string().optional(),
  path: z.string().optional(),
  firmwareVersion: z.string().optional(),
  hardwareRevision: z.number().int().nonnegative().optional(),
  connectionType: z.string().optional(),
});

const deviceInfoSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  pid: z.number().int().nonnegative(),
  state: z.string(),
  connectionType: z.string().optional(),
  displayConnectionType: z.string().optional(),
  deviceType: z.string(),
  deviceModel: z.string(),
  deviceBaseModel: z.string(),
  displayName: z.string(),
  deviceExt: z.number().int().nonnegative().optional(),
  deviceUnitId: z.string().optional(),
  activeInterfaces: z.array(activeInterfaceSchema).default([]),
});

const deviceListSchema = z.object({ deviceInfos: z.array(deviceInfoSchema) });
const batterySchema = z.object({ percentage: z.number().min(0).max(100).optional() });
const responseSchema = z.object({
  msgId: z.string(),
  result: z.object({ code: z.string() }).optional(),
  payload: z.unknown().optional(),
});

export type LogitechAgentDevice = z.infer<typeof deviceInfoSchema> & { batteryPercent?: number };

const agentUrl = 'ws://127.0.0.1:9010';
const requestTimeoutMs = 1_200;

/**
 * G HUB exposes Logitech's already-decoded DEVIO identity on localhost. This is
 * an optional metadata source: discovery continues through HID when it is not
 * installed or running, and no request leaves the machine.
 */
export async function readLogitechAgentDevices(): Promise<LogitechAgentDevice[]> {
  try {
    const payload = await queryAgent('/devices/list');
    const devices = deviceListSchema.parse(payload).deviceInfos.filter((device) => device.state === 'ACTIVE');
    return Promise.all(devices.map(async (device) => {
      try {
        const battery = batterySchema.parse(await queryAgent(`/battery/${device.id}/state`));
        return { ...device, batteryPercent: battery.percentage };
      } catch {
        return device;
      }
    }));
  } catch {
    return [];
  }
}

function queryAgent(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const msgId = `switchboard-${randomUUID()}`;
    const LocalWebSocket = WebSocket as unknown as new (
      url: string,
      protocols: string,
      options: { headers: Record<string, string> },
    ) => WebSocket;
    const socket = new LocalWebSocket(agentUrl, 'json', { headers: { Origin: 'file://' } });
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`Logitech metadata timed out at ${path}`)), requestTimeoutMs);

    const finish = (error?: Error, payload?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      if (error) reject(error);
      else resolve(payload);
    };

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ msgId, verb: 'GET', path }));
    });
    socket.addEventListener('message', (event) => {
      try {
        const response = responseSchema.parse(JSON.parse(String(event.data)));
        if (response.msgId !== msgId) return;
        if (response.result?.code !== 'SUCCESS') {
          finish(new Error(`Logitech metadata rejected ${path}`));
          return;
        }
        finish(undefined, response.payload);
      } catch {
        // Ignore unrelated agent events and malformed responses until timeout.
      }
    });
    socket.addEventListener('error', () => finish(new Error('Logitech metadata source unavailable')));
    socket.addEventListener('close', () => {
      if (!settled) finish(new Error('Logitech metadata source closed'));
    });
  });
}
