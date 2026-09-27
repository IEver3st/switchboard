import type { CaptureConfig, SystemSnapshot } from './contracts';

export const REPLAY_AUDIO_PIPES = {
  system: 'switchboard-audio-system-v2',
  chat: 'switchboard-audio-chat-v2',
  microphone: 'switchboard-audio-microphone-v2',
} as const;

/** The UI and main use the same capability gate. No application activity heuristic:
 * a quiet mixer is still the selected source, and must not switch to desktop audio. */
export function resolveReplayAudioRouting(audio: SystemSnapshot['audio'], config: CaptureConfig, reactionEnabled = false) {
  const running = audio.enabled && audio.host?.running === true;
  const tracksReady = running && audio.capabilities.clipTracks === 'available';
  const microphoneReady = running && audio.capabilities.processedMicrophoneCapture === 'available';
  const needsMicrophone = config.includeMic || reactionEnabled;
  const systemAudioPipeName = config.includeSystemAudio && config.systemAudioMode !== 'game'
    && !config.systemAudioDeviceId && tracksReady ? REPLAY_AUDIO_PIPES.system : null;
  const chatAudioPipeName = config.includeChatAudio && !config.chatAudioDeviceId && tracksReady ? REPLAY_AUDIO_PIPES.chat : null;
  const microphonePipeName = needsMicrophone && !config.microphoneDeviceId && microphoneReady ? REPLAY_AUDIO_PIPES.microphone : null;
  const missing: string[] = [];
  if (audio.enabled) {
    if (config.includeSystemAudio && config.systemAudioMode !== 'game' && !config.systemAudioDeviceId && !tracksReady) missing.push('system');
    if (config.includeChatAudio && !config.chatAudioDeviceId && !tracksReady) missing.push('chat');
    if (needsMicrophone && !config.microphoneDeviceId && !microphoneReady) missing.push('processed microphone');
  }
  return {
    systemAudioPipeName, chatAudioPipeName, microphonePipeName,
    audioFallbackReason: missing.length ? `Switchboard ${missing.join(', ')} capture is unavailable. Replay is using Windows devices for those inputs; recording mix processing does not apply.` : null,
  };
}
