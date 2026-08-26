import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
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
const batterySchema = z.object({
  percentage: z.number().min(0).max(100).optional(),
  charging: z.boolean().optional(),
  fullyCharged: z.boolean().optional(),
  mileage: z.number().nonnegative().optional(),
  batteryMileageSupport: z.string().optional(),
  support: z.string().optional(),
});
const responseSchema = z.object({
  msgId: z.string(),
  result: z.object({ code: z.string(), what: z.string().optional() }).optional(),
  payload: z.unknown().optional(),
});

export type LogitechAgentDevice = z.infer<typeof deviceInfoSchema>;
export type LogitechBatteryState = z.infer<typeof batterySchema>;
export type LogitechAgentVerb = 'GET' | 'SET' | 'REMOVE';

const agentUrl = 'ws://127.0.0.1:9010';
const requestTimeoutMs = 1_800;

/**
 * G HUB exposes Logitech's already-decoded DEVIO control protocol on localhost.
 * It is optional: discovery still falls back to HID identity when unavailable.
 */
export async function readLogitechAgentDevices(): Promise<LogitechAgentDevice[]> {
  try {
    const payload = await requestLogitechAgent('GET', '/devices/list');
    return deviceListSchema.parse(payload).deviceInfos.filter((device) => device.state === 'ACTIVE');
  } catch {
    return [];
  }
}

export async function readLogitechBattery(deviceId: string): Promise<LogitechBatteryState | undefined> {
  try {
    return batterySchema.parse(await requestLogitechAgent('GET', `/battery/${deviceId}/state`));
  } catch {
    return undefined;
  }
}

export function getLogitechAgent(path: string, payload?: unknown): Promise<unknown> {
  return requestLogitechAgent('GET', path, payload);
}

export function setLogitechAgent(path: string, payload: unknown): Promise<unknown> {
  return requestLogitechAgent('SET', path, payload);
}

export function removeLogitechAgent(path: string, payload: unknown): Promise<unknown> {
  return requestLogitechAgent('REMOVE', path, payload);
}

export function requestLogitechAgent(
  verb: LogitechAgentVerb,
  path: string,
  payload?: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const msgId = `switchboard-${randomUUID()}`;
    const socket = new WebSocket(agentUrl, 'json', { headers: { Origin: 'file://' } });
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error(`Logitech agent timed out at ${verb} ${path}`)),
      requestTimeoutMs,
    );

    const finish = (error?: Error, responsePayload?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      if (error) reject(error);
      else resolve(responsePayload);
    };

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ msgId, verb, path, payload }));
    });
    socket.addEventListener('message', (event) => {
      try {
        const response = responseSchema.parse(JSON.parse(String(event.data)));
        if (response.msgId !== msgId) return;
        if (response.result?.code !== 'SUCCESS') {
          finish(new Error(response.result?.what || `Logitech agent rejected ${verb} ${path}`));
          return;
        }
        finish(undefined, response.payload);
      } catch {
        // Ignore unrelated agent broadcasts and malformed messages until timeout.
      }
    });
    socket.addEventListener('error', () => finish(new Error('Logitech agent unavailable')));
    socket.addEventListener('close', () => {
      if (!settled) finish(new Error('Logitech agent closed the connection'));
    });
  });
}
