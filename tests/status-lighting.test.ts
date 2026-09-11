import { test, expect } from 'bun:test';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { StatusLighting } from '../src/main/services/status-lighting';

test('status policy prioritizes errors over saved clips and mute, then restores on disable', async () => {
  const snapshot = createDefaultSnapshot();
  const device = snapshot.devices.find(item => item.capabilities.lighting)!;
  snapshot.modules.find(module => module.id === device.moduleId)!.enabled = true;
  device.capabilities.lighting!.statusLightingSupported = true;
  snapshot.setup.preferences.lighting = { enabled: true, deviceIds: [device.id], captureError: true, clipSaved: true, microphoneMuted: true };
  const mic = snapshot.devices.find(item => item.capabilities.muteState)!;
  mic.capabilities.muteState!.muted = true;
  const writes: (string | null)[] = [];
  let status = '';
  const policy = new StatusLighting({ apply: async (_id, color) => { writes.push(color); }, status: value => { status = value; } });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  policy.update(snapshot); await settle();
  expect(writes.at(-1)).toBe('#ffb347');
  snapshot.capture.runtime.lastSavedAt = new Date().toISOString();
  policy.update(snapshot); await settle(); expect(writes.at(-1)).toBe('#36d978');
  snapshot.capture.config.enabled = true; snapshot.capture.runtime.state = 'error';
  policy.update(snapshot); await settle(); expect(writes.at(-1)).toBe('#ff3b30');
  snapshot.setup.preferences.lighting.enabled = false;
  policy.update(snapshot); await settle(); expect(writes.at(-1)).toBeNull(); expect(status).toBe('idle');
  const count = writes.length;
  await policy.dispose(); await policy.dispose();
  policy.update(snapshot); expect(writes.length).toBe(count);
});

test('a partially failed lighting write remains eligible for shutdown restoration', async () => {
  const snapshot = createDefaultSnapshot();
  const device = snapshot.devices.find(item => item.capabilities.lighting)!;
  snapshot.modules.find(module => module.id === device.moduleId)!.enabled = true;
  device.capabilities.lighting!.statusLightingSupported = true;
  snapshot.setup.preferences.lighting.enabled = true; snapshot.setup.preferences.lighting.deviceIds = [device.id];
  snapshot.capture.config.enabled = true; snapshot.capture.runtime.state = 'error';
  const writes: (string | null)[] = []; const states: string[] = [];
  const policy = new StatusLighting({ apply: async (_id, color) => { writes.push(color); if (color) throw new Error('Device disconnected'); }, status: state => { states.push(state); } });
  policy.update(snapshot); await new Promise(resolve => setImmediate(resolve));
  expect(states.at(-1)).toBe('error');
  await policy.dispose(); expect(writes).toEqual(['#ff3b30', null]);
});
