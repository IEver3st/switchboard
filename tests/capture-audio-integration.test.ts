import { describe, expect, test } from 'bun:test';
import { createDefaultSnapshot } from '../src/shared/defaults';
import { REPLAY_AUDIO_PIPES, resolveReplayAudioRouting } from '../src/shared/capture-audio-routing';
import { resolveCaptureChatAudioDeviceId, resolveCaptureSystemAudioDeviceId } from '../src/main/capture-microphone-routing';

function ready() {
  const snapshot = createDefaultSnapshot();
  snapshot.audio.enabled = true;
  snapshot.audio.host = { running: true } as NonNullable<typeof snapshot.audio.host>;
  Object.assign(snapshot.audio.capabilities, { clipTracks: 'available', processedMicrophoneCapture: 'available', routingBackend: 'vb-cable' });
  Object.assign(snapshot.capture.config, { includeSystemAudio: true, includeChatAudio: true, includeMic: true, systemAudioMode: 'system' });
  return snapshot;
}

describe('Switchboard replay audio integration', () => {
  test('uses three independent recording feeds even before applications start playing', () => {
    const { audio, capture } = ready();
    audio.applications = [];
    expect(resolveReplayAudioRouting(audio, capture.config)).toEqual({
      systemAudioPipeName: REPLAY_AUDIO_PIPES.system, chatAudioPipeName: REPLAY_AUDIO_PIPES.chat,
      microphonePipeName: REPLAY_AUDIO_PIPES.microphone, audioFallbackReason: null,
    });
  });
  test('preserves explicit disconnected devices and never replaces them with a mix or Windows default', () => {
    const { audio, capture } = ready();
    Object.assign(capture.config, { systemAudioDeviceId: 'missing-output', chatAudioDeviceId: 'missing-chat', microphoneDeviceId: 'missing-mic' });
    audio.devices = [];
    expect(resolveReplayAudioRouting(audio, capture.config)).toEqual({
      systemAudioPipeName: null, chatAudioPipeName: null, microphonePipeName: null, audioFallbackReason: null,
    });
    expect(resolveCaptureSystemAudioDeviceId({ ...audio, capture: capture.config })).toBe('missing-output');
    expect(resolveCaptureChatAudioDeviceId({ ...audio, capture: capture.config })).toBe('missing-chat');
  });
  test('game-only capture keeps process isolation while chat and mic follow Switchboard', () => {
    const { audio, capture } = ready();
    capture.config.systemAudioMode = 'game';
    const route = resolveReplayAudioRouting(audio, capture.config);
    expect(route.systemAudioPipeName).toBeNull();
    expect(route.chatAudioPipeName).toBe(REPLAY_AUDIO_PIPES.chat);
    expect(route.microphonePipeName).toBe(REPLAY_AUDIO_PIPES.microphone);
  });
  test('microphone DSP recording does not require a mixer or virtual microphone driver', () => {
    const { audio, capture } = ready();
    audio.capabilities.clipTracks = 'unavailable';
    audio.capabilities.virtualMicrophone = 'unavailable';
    const route = resolveReplayAudioRouting(audio, capture.config);
    expect(route.microphonePipeName).toBe(REPLAY_AUDIO_PIPES.microphone);
    expect(route.systemAudioPipeName).toBeNull();
    expect(route.audioFallbackReason).toContain('system, chat');
  });
  test('disabled tracks open no feeds; reaction-only input uses processed mic without recording it', () => {
    const { audio, capture } = ready();
    Object.assign(capture.config, { includeSystemAudio: false, includeChatAudio: false, includeMic: false });
    expect(Object.values(resolveReplayAudioRouting(audio, capture.config))).toEqual([null, null, null, null]);
    expect(resolveReplayAudioRouting(audio, capture.config, true).microphonePipeName).toBe(REPLAY_AUDIO_PIPES.microphone);
  });
  test('host failure and recovery change the route, but mixer activity and volume do not', () => {
    const { audio, capture } = ready();
    const before = resolveReplayAudioRouting(audio, capture.config);
    audio.host!.running = false;
    expect(resolveReplayAudioRouting(audio, capture.config).audioFallbackReason).toContain('unavailable');
    audio.host!.running = true;
    expect(resolveReplayAudioRouting(audio, capture.config)).toEqual(before);
    audio.enabled = false;
    expect(Object.values(resolveReplayAudioRouting(audio, capture.config))).toEqual([null, null, null, null]);
  });
  test('older hosts do not masquerade a combined clip mix as isolated tracks', () => {
    const { audio, capture } = ready();
    audio.capabilities.clipMix = 'available';
    delete audio.capabilities.clipTracks;
    delete audio.capabilities.processedMicrophoneCapture;
    expect(resolveReplayAudioRouting(audio, capture.config).systemAudioPipeName).toBeNull();
  });
});
