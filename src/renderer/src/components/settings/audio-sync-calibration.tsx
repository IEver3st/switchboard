import { useEffect, useState } from 'react';
import { AudioWaveform } from 'lucide-react';
import type { SystemSnapshot } from '../../../../shared/contracts';
import { switchboardApi } from '@/lib/demo-api';
import { useSystemStore } from '@/stores/use-system-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SettingRow, SettingSection } from './settings-primitives';

export function AudioSyncCalibrationSettings({ snapshot }: { snapshot: SystemSnapshot }) {
  const { config, audioCalibration: state } = snapshot.capture;
  const profile = config.microphoneSync;
  const setCaptureConfig = useSystemStore(store => store.setCaptureConfig);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [adjustment, setAdjustment] = useState(String(profile?.advanceMs ?? 0));
  useEffect(() => { setAdjustment(String(profile?.advanceMs ?? 0)); }, [profile?.advanceMs]);
  useEffect(() => () => { void switchboardApi.audioCalibration({ action: 'cancel' }).catch(() => {}); }, []);
  const measuring = state.status === 'measuring';
  const busy = pending || measuring || state.status === 'saving';
  const supported = config.includeMic && config.includeSystemAudio && config.systemAudioMode === 'system';
  const micName = snapshot.audio.devices.find(device => device.id === profile?.microphoneDeviceId)?.name;
  const outputName = snapshot.audio.devices.find(device => device.id === profile?.outputDeviceId)?.name;
  const numericAdjustment = Number(adjustment);
  const validAdjustment = adjustment.trim() !== '' && Number.isInteger(numericAdjustment) && numericAdjustment >= 0 && numericAdjustment <= 1200;

  async function action(command: 'start' | 'cancel' | 'apply') {
    setPending(true); setError(null);
    try { await switchboardApi.audioCalibration({ action: command }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setPending(false); }
  }
  async function close() {
    await action('cancel');
    setOpen(false);
  }
  return <SettingSection title="Microphone timing">
    <SettingRow settingId="capture.audioSync" title="Sync voice with recorded audio"
      description={supported ? 'Measure headphone and microphone delay, then automatically move your voice earlier in future clips.'
        : 'Enable microphone and Game tracks with All audio from output device to calibrate.'}>
      <Button size="sm" variant="secondary" disabled={!supported || busy} onClick={() => { setError(null); setOpen(true); }}>
        <AudioWaveform className="size-3.5" aria-hidden />{profile ? 'Recalibrate' : 'Calibrate'}
      </Button>
    </SettingRow>
    {profile ? <>
      <SettingRow settingId="capture.audioSync.adjustment" title={`${profile.advanceMs} ms earlier · saved correction`}
        description={<>{micName ?? 'Calibrated microphone'} → {outputName ?? 'Calibrated output'}. Applies only to matching devices. Recalibrate after changing Sonar routing, processing, Bluetooth mode, or headphones.</>}>
        <div className="audio-sync-adjustment">
          <input type="number" className="setup-select" aria-label="Microphone advance in milliseconds" min={0} max={1200} step={1}
            value={adjustment} disabled={busy} onChange={event => setAdjustment(event.target.value)} />
          <span>ms</span>
          <Button size="sm" variant="secondary" disabled={busy || !validAdjustment || numericAdjustment === profile.advanceMs}
            onClick={() => void setCaptureConfig({ microphoneSync: { ...profile, advanceMs: numericAdjustment } })}>Adjust</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setCaptureConfig({ microphoneSync: null })}>Reset</Button>
        </div>
      </SettingRow>
    </> : null}
    <Dialog open={open} onOpenChange={value => { if (!value && state.status !== 'saving') void close(); }}>
      <DialogContent className="audio-sync-dialog" onEscapeKeyDown={event => { if (state.status === 'saving') event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Sync your microphone</DialogTitle>
          <DialogDescription>Measure the delay through your current playback output and capture microphone. Audio stays in memory and is discarded after the test.</DialogDescription>
        </DialogHeader>
        <ol className="audio-sync-steps">
          <li>Pause music, games, and other audio. Use your usual listening volume.</li>
          <li>Take the headphones off and hold one earcup close to the microphone.</li>
          <li>Keep it still and stay quiet while five short test sounds play.</li>
        </ol>
        <div className="audio-sync-status" role="status" aria-live="polite">
          {measuring ? 'Measuring for about 11 seconds… Keep the earcup by the mic.'
            : state.status === 'saving' ? 'Saving correction and restarting the replay buffer…'
            : state.status === 'saved' ? `Saved. Future clips move your microphone ${profile?.advanceMs ?? 0} ms earlier.`
            : state.status === 'ready' && state.measurement
              ? `${state.measurement.profile.advanceMs} ms delay measured across ${state.measurement.matchedPulses} sounds (${state.measurement.spreadMs} ms variation).`
              : 'Ready when the earcup is in place. The test sounds may also appear in an active replay buffer.'}
        </div>
        {error || state.error ? <p role="alert" className="audio-sync-error">{error ?? state.error}</p> : null}
        <p className="audio-sync-note">Saving restarts the replay buffer. Existing clips stay unchanged. This aligns recorded voice with what you hear; it does not reduce live headphone delay.</p>
        <div className="audio-sync-actions">
          <Button variant="ghost" disabled={pending || state.status === 'saving'} onClick={() => void close()}>{measuring ? 'Cancel test' : 'Close'}</Button>
          {state.status === 'ready' ? <Button disabled={busy} onClick={() => void action('apply')}>Save correction</Button>
            : state.status !== 'saved' ? <Button disabled={busy || !supported} onClick={() => void action('start')}>{measuring ? 'Measuring…' : state.status === 'error' ? 'Try again' : 'Start test'}</Button> : null}
        </div>
      </DialogContent>
    </Dialog>
  </SettingSection>;
}
