import { describe, expect, test } from 'bun:test';
import { audioRoutingNotice } from '../src/shared/audio-health';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { audioApplicationSchema } from '../src/shared/contracts';
import { parseAudioEndpoints } from '../src/main/services/audio-endpoint-discovery';

function connected() {
  const snapshot = createDefaultSnapshot();
  snapshot.audio.enabled = true;
  snapshot.engines.find(engine => engine.kind === 'audio')!.state = 'running';
  snapshot.audio.capabilities.applicationRouting = 'available';
  snapshot.audio.capabilities.channelDsp = 'available';
  snapshot.audio.devices = parseAudioEndpoints([{ id: 'headphones', name: 'Test headphones', flow: 'render', isDefault: true, volume: 1, muted: false }]);
  for (const bus of snapshot.audio.buses) if (bus.id !== 'mic') bus.deviceId = 'headphones';
  return snapshot;
}

describe('audio routing recovery notice', () => {
  test('keeps an idle connected mixer quiet and does not infer silence from no apps', () => {
    expect(audioRoutingNotice(connected())).toBeNull();
  });
  test('offers engine recovery and keeps startup separate from failure', () => {
    const snapshot = connected();
    snapshot.audio.enabled = false;
    expect(audioRoutingNotice(snapshot)?.action).toBe('enable');
    snapshot.audio.enabled = true;
    snapshot.engines.find(engine => engine.kind === 'audio')!.state = 'starting';
    expect(audioRoutingNotice(snapshot)).toMatchObject({ tone: 'pending' });
    snapshot.engines.find(engine => engine.kind === 'audio')!.state = 'error';
    expect(audioRoutingNotice(snapshot)?.action).toBe('restart');
  });
  test('uses Windows endpoint readback for output mute and volume, including discovery', () => {
    const snapshot = connected();
    snapshot.audio.devices[0]!.muted = true;
    expect(audioRoutingNotice(snapshot)?.action).toBe('windows');
    snapshot.audio.devices[0]!.muted = false;
    snapshot.audio.devices[0]!.volume = 0;
    expect(audioRoutingNotice(snapshot)?.action).toBe('windows');
    delete snapshot.audio.devices[0]!.volume;
    expect(audioRoutingNotice(snapshot)).toBeNull();
    expect(parseAudioEndpoints([{ id: 'muted', name: 'Test output', flow: 'render', isDefault: true, volume: 0, muted: true }])[0]).toMatchObject({ volume: 0, muted: true });
  });
  test('identifies disconnected outputs and unavailable routing before saved mute controls', () => {
    const snapshot = connected();
    snapshot.audio.buses.find(bus => bus.id === 'chat')!.deviceId = 'disconnected';
    expect(audioRoutingNotice(snapshot)?.action).toBe('settings');
    snapshot.audio.buses.find(bus => bus.id === 'chat')!.deviceId = 'headphones';
    snapshot.audio.capabilities.channelDsp = 'unavailable';
    expect(audioRoutingNotice(snapshot)?.action).toBe('restart');
  });
  test('checks the audible Personal mix even while another destination is being edited', () => {
    const snapshot = connected();
    const personal = snapshot.audio.mixes.find(mix => mix.id === 'personal')!;
    personal.master.enabled = false;
    expect(audioRoutingNotice(snapshot)?.action).toBe('unmute');
    personal.master.enabled = true;
    personal.master.gain = 0;
    expect(audioRoutingNotice(snapshot)?.action).toBe('volume');
  });
  test('shows app failures and pending output changes without calling acknowledgement audible proof', () => {
    const snapshot = connected();
    const app = audioApplicationSchema.parse({ id: 'fixture:42', processId: 42, name: 'Test player', executableName: 'TestPlayer',
      destination: 'media', preferredDestination: 'media', currentDestination: null, routingState: 'pending-restart', active: true });
    snapshot.audio.applications = [app];
    expect(audioRoutingNotice(snapshot)).toMatchObject({ tone: 'warning', action: 'windows' });
    app.routingState = 'unavailable';
    expect(audioRoutingNotice(snapshot)?.action).toBe('restart');
    app.active = false;
    expect(audioRoutingNotice(snapshot)).toBeNull();
  });
});
