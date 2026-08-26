import { useEffect, useState } from 'react';
import { AlertTriangle, Play } from 'lucide-react';
import type { SystemSnapshot } from '../../../shared/contracts';
import { AudioTabs, audioWorkspaceTabs, type AudioWorkspaceTab } from '@/components/audio/AudioTabs';
import { ChannelProcessingPage } from '@/components/audio/ChannelProcessingPage';
import { clearAudioMeters, publishAudioMeterFrame } from '@/components/audio/meter-bus';
import { MicrophonePage } from '@/components/audio/MicrophonePage';
import { MixerPage } from '@/components/audio/MixerPage';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { switchboardApi } from '@/lib/demo-api';
import { useSystemStore } from '@/stores/use-system-store';

function tabFromHash(): AudioWorkspaceTab {
  const candidate = window.location.hash.replace(/^#audio\/?/, '');
  return audioWorkspaceTabs.includes(candidate as AudioWorkspaceTab) ? candidate as AudioWorkspaceTab : 'mixer';
}

export function AudioPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const setAudioEnabled = useSystemStore((state) => state.setAudioEnabled);
  const actionPending = useSystemStore((state) => state.actionPending);
  const [tab, setTab] = useState<AudioWorkspaceTab>(tabFromHash);
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const engineRunning = engine?.state === 'running';

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!engineRunning) {
      clearAudioMeters();
      return;
    }
    const unsubscribe = switchboardApi.subscribeAudioMeters(publishAudioMeterFrame);
    return () => {
      unsubscribe();
      clearAudioMeters();
    };
  }, [engineRunning]);

  const navigate = (next: AudioWorkspaceTab) => {
    setTab(next);
    if (window.location.hash !== `#audio/${next}`) window.location.hash = `audio/${next}`;
  };

  return (
    <div className="min-h-full" data-testid="audio-console">
      <header className="audio-console-header">
        <div className="audio-console-header__identity">
          <h2>Audio</h2>
          {engine?.state === 'error' ? (
            <p className="audio-console-header__error" role="alert">
              <AlertTriangle aria-hidden className="size-4" />
              Audio needs attention. {engine.message || 'Use Audio Settings to restart the engine.'}
            </p>
          ) : (
            <p>{engine?.state === 'starting' ? 'Starting audio…' : engineRunning ? 'Your mixer and sound processing are active.' : 'Mixer and sound settings are ready when you start audio.'}</p>
          )}
        </div>
        <div className="audio-console-header__action">
          <span className="audio-console-header__state">{engine?.state === 'starting' ? 'Starting' : engineRunning ? 'On' : 'Off'}</span>
          {engineRunning ? (
            <Switch checked disabled={actionPending === 'audio:enabled'} aria-label="Turn audio off" onCheckedChange={(checked) => void setAudioEnabled(checked)} />
          ) : (
            <Button type="button" variant="primary" size="sm" disabled={actionPending === 'audio:enabled' || engine?.state === 'starting'} onClick={() => void setAudioEnabled(true)}>
              <Play className="size-3.5" /> Start audio
            </Button>
          )}
        </div>
      </header>

      <AudioTabs value={tab} onChange={navigate} />

      <div
        id={`audio-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`audio-tab-${tab}`}
        tabIndex={0}
        className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        {tab === 'mixer' ? <MixerPage snapshot={snapshot} onNavigate={navigate} /> : null}
        {tab === 'game' ? <ChannelProcessingPage snapshot={snapshot} busId="game" /> : null}
        {tab === 'chat' ? <ChannelProcessingPage snapshot={snapshot} busId="chat" /> : null}
        {tab === 'media' ? <ChannelProcessingPage snapshot={snapshot} busId="media" /> : null}
        {tab === 'microphone' ? <MicrophonePage snapshot={snapshot} /> : null}
      </div>
    </div>
  );
}
