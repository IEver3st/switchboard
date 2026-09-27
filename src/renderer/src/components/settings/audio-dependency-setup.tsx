import { useEffect, useRef } from 'react';
import type { AudioDependencyState } from '../../../../shared/contracts';
import { Button } from '@/components/ui/button';
import { useSystemStore } from '@/stores/use-system-store';

export function AudioDependencySetupPanel({ state }: { state: AudioDependencyState }) {
  const setup = useSystemStore(s => s.audioDependencySetup);
  const checked = useRef(false);
  const busy = ['checking', 'downloading', 'installing'].includes(state.phase);
  useEffect(() => {
    if (!checked.current && state.phase === 'idle' && window.switchboard) {
      checked.current = true;
      void setup('check');
    }
  }, [setup, state.phase]);
  const current = state.current === 'microphone' ? 'Hi-Fi Cable' : 'VB-CABLE';
  const message = state.phase === 'checking' ? 'Checking installed audio drivers…'
    : state.phase === 'downloading' ? `Downloading ${current}${state.progress === null ? '' : ` · ${state.progress}%`}`
    : state.phase === 'installing' ? `Finish ${current} installation in the Windows installer. Approve the admin prompt and click Install if asked.`
    : state.phase === 'restart-required' ? 'Restart Windows to finish audio setup. Then return here to check and turn on Audio.'
    : state.phase === 'ready' ? 'Audio drivers are installed and configured. You can turn on the audio engine.'
    : state.phase === 'error' ? state.error
    : 'Install the missing drivers for app mixing and a processed microphone in voice apps. Windows will ask for administrator approval and may require a restart.';
  return (
    <section className="audio-dependency-setup space-y-3" aria-label="Audio driver setup" aria-busy={busy} id="setting-audio.dependencies" tabIndex={-1} data-setting-id="audio.dependencies">
      <div className="text-sm" role={state.phase === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
        <dt>App mixing · VB-CABLE</dt><dd>{state.cable ? 'Detected' : 'Not detected'}</dd>
        <dt>Processed microphone · Hi-Fi Cable</dt><dd>{state.microphone ? 'Detected' : 'Not detected'}</dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        {!['ready', 'restart-required'].includes(state.phase) ? <Button size="sm" disabled={busy || !window.switchboard} onClick={() => void setup('install')}>
          {state.phase === 'error' ? 'Retry audio setup' : 'Install audio drivers'}
        </Button> : null}
        <Button size="sm" variant="secondary" disabled={busy || !window.switchboard} onClick={() => void setup('check')}>Check again</Button>
        {state.phase === 'downloading' ? <Button size="sm" variant="ghost" onClick={() => void setup('cancel')}>Cancel download</Button> : null}
      </div>
      <p className="text-xs text-muted-foreground">Official VB-Audio donationware, downloaded only when you choose Install. No purchase is required for this setup. <a className="underline" href="https://vb-audio.com/Services/licensing.htm" target="_blank" rel="noreferrer">VB-Audio licensing and support</a>.</p>
      {!window.switchboard ? <p className="text-xs text-muted-foreground">Driver installation is available in the Windows desktop app.</p> : null}
    </section>
  );
}
