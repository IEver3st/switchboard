import { useEffect, useState } from 'react';
import type { SystemSnapshot } from '../../../shared/contracts';
import { AudioTabs, audioWorkspaceTabs, type AudioWorkspaceTab } from '@/components/audio/AudioTabs';
import { ChannelProcessingPage } from '@/components/audio/ChannelProcessingPage';
import { clearAudioMeters, publishAudioMeterFrame } from '@/components/audio/meter-bus';
import { MicrophonePage } from '@/components/audio/MicrophonePage';
import { MixerPage } from '@/components/audio/MixerPage';
import { switchboardApi } from '@/lib/demo-api';

function tabFromHash(): AudioWorkspaceTab {
  const candidate = window.location.hash.replace(/^#audio\/?/, '');
  return audioWorkspaceTabs.includes(candidate as AudioWorkspaceTab) ? candidate as AudioWorkspaceTab : 'mixer';
}

export function AudioPage({ snapshot }: { snapshot: SystemSnapshot }) {
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
