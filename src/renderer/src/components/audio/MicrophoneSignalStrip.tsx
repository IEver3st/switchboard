import type { SystemSnapshot } from '../../../../shared/contracts';
import {
  microphoneDspConfigurationApplied,
  microphoneInputApplied,
} from '../../../../shared/microphone-runtime';
import { Switch } from '@/components/ui/switch';
import { AudioDevicePicker } from './AudioDevicePicker';
import { HorizontalLevelMeter } from './HorizontalLevelMeter';

type SignalTone = 'stopped' | 'applying' | 'live' | 'warning' | 'error' | 'unavailable';

function signalState(
  snapshot: SystemSnapshot,
  desktopFeatures: boolean,
  enginePending: boolean,
  inputPending: boolean,
): { tone: SignalTone; label: string; description: string } {
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const input = snapshot.audio.devices.find((device) => (
    device.id === snapshot.audio.buses.find((bus) => bus.id === 'mic')?.deviceId
    && device.direction === 'input'
    && device.available
    && !device.isSwitchboard
  ));
  const hostError = snapshot.audio.host?.microphone?.error;

  if (!desktopFeatures) {
    return {
      tone: 'unavailable',
      label: 'Desktop host required',
      description: 'Real microphone processing is available in the Switchboard desktop application.',
    };
  }
  if (enginePending || engine?.state === 'starting') {
    return {
      tone: 'applying',
      label: 'Starting',
      description: input ? `Opening ${input.name}.` : 'Opening the native audio host.',
    };
  }
  if (inputPending) {
    return {
      tone: 'applying',
      label: 'Applying input',
      description: input ? `Opening ${input.name}.` : 'Applying the selected Windows input device.',
    };
  }
  if (engine?.state === 'error') {
    return {
      tone: 'error',
      label: 'Needs attention',
      description: engine.message ?? 'The native audio host could not start.',
    };
  }
  if (!snapshot.audio.enabled || engine?.state !== 'running') {
    return {
      tone: 'stopped',
      label: 'Stopped',
      description: input ? 'Start the audio engine to apply this microphone chain.' : 'Choose a physical microphone, then start the audio engine.',
    };
  }
  if (!input) {
    return {
      tone: 'unavailable',
      label: 'No microphone input',
      description: 'Connect or choose an available Windows input device.',
    };
  }
  if (!microphoneInputApplied(snapshot.audio)) {
    return {
      tone: hostError ? 'error' : 'applying',
      label: hostError ? 'Input unavailable' : 'Applying input',
      description: hostError ?? `Opening ${input.name}.`,
    };
  }
  if (!microphoneDspConfigurationApplied(snapshot.audio)) {
    return {
      tone: 'applying',
      label: 'Applying settings',
      description: 'Waiting for Audio.Host to accept the complete processor chain.',
    };
  }
  if (hostError) {
    return {
      tone: 'warning',
      label: 'Live with fallback',
      description: hostError,
    };
  }
  return {
    tone: 'live',
    label: 'Live',
    description: `${input.name} is feeding the configured processor chain.`,
  };
}

export function MicrophoneSignalStrip({
  snapshot,
  desktopFeatures,
  enginePending,
  inputPending,
  onEngineChange,
  onInputChange,
}: {
  snapshot: SystemSnapshot;
  desktopFeatures: boolean;
  enginePending: boolean;
  inputPending: boolean;
  onEngineChange: (enabled: boolean) => void;
  onInputChange: (deviceId: string) => void;
}) {
  const micBus = snapshot.audio.buses.find((bus) => bus.id === 'mic');
  const state = signalState(snapshot, desktopFeatures, enginePending, inputPending);
  const engineRunning = snapshot.engines.some((engine) => engine.kind === 'audio' && engine.state === 'running');
  const inputLive = microphoneInputApplied(snapshot.audio);
  const selectedInputAvailable = snapshot.audio.devices.some((device) => (
    device.id === micBus?.deviceId
    && device.direction === 'input'
    && device.available
    && !device.isSwitchboard
  ));

  return (
    <section className="mic-signal-strip" aria-label="Microphone signal path" aria-busy={enginePending || inputPending}>
      <div className="mic-signal-strip__status" role="status" aria-live="polite">
        <span className="mic-signal-strip__status-dot" data-tone={state.tone} aria-hidden="true" />
        <span>
          <strong>{state.label}</strong>
          <small title={state.description}>{state.description}</small>
        </span>
      </div>

      <label className="mic-signal-strip__field">
        <span>Physical input</span>
        <AudioDevicePicker
          value={micBus?.deviceId ?? ''}
          devices={snapshot.audio.devices}
          direction="input"
          label="Microphone physical input"
          disabled={!desktopFeatures || inputPending || enginePending}
          onChange={onInputChange}
        />
      </label>

      <HorizontalLevelMeter
        busId="mic"
        active={engineRunning && inputLive && Boolean(micBus?.enabled)}
        inactiveLabel={state.label}
        label="Processed input level"
      />

      <label className="mic-signal-strip__engine">
        <span>
          <strong>Audio engine</strong>
          <small>{snapshot.audio.enabled ? 'Routing and processing on' : 'Routing and processing off'}</small>
        </span>
        <Switch
          checked={desktopFeatures && snapshot.audio.enabled}
          disabled={!desktopFeatures || enginePending || (!snapshot.audio.enabled && !selectedInputAvailable)}
          aria-label="Audio engine"
          onCheckedChange={onEngineChange}
        />
      </label>
    </section>
  );
}
