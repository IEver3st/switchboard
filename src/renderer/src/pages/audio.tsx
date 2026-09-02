import { useEffect, useMemo, useState } from 'react';
import type { AudioMixId, SystemSnapshot } from '../../../shared/contracts';
import { AudioHeader, audioStatusLine, audioWorkspaceTabs, type AudioWorkspaceTab } from '@/components/audio/AudioHeader';
import { ChannelProcessingPage } from '@/components/audio/ChannelProcessingPage';
import { clearAudioMeters, publishAudioMeterFrame } from '@/components/audio/meter-bus';
import { MicrophonePage } from '@/components/audio/MicrophonePage';
import { MixerPage } from '@/components/audio/MixerPage';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { switchboardApi } from '@/lib/demo-api';
import '@/components/audio/audio.css';

function tabFromHash(): AudioWorkspaceTab {
  const candidate = window.location.hash.replace(/^#audio\/?/, '');
  return audioWorkspaceTabs.includes(candidate as AudioWorkspaceTab) ? candidate as AudioWorkspaceTab : 'mixer';
}

export function AudioPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const [tab, setTab] = useState<AudioWorkspaceTab>(tabFromHash);
  const [selectedMixId, setSelectedMixId] = useState<AudioMixId>('personal');
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const engineRunning = engine?.state === 'running';
  const availableTabs = useMemo(() => audioWorkspaceTabs.filter((candidate) => {
    if (candidate === 'mixer') return true;
    const busId = candidate === 'microphone' ? 'mic' : candidate;
    return snapshot.audio.buses.find((bus) => bus.id === busId)?.enabled ?? false;
  }), [snapshot.audio.buses]);

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

  useEffect(() => {
    if (availableTabs.includes(tab)) return;
    setTab('mixer');
    if (window.location.hash !== '#audio/mixer') window.location.hash = 'audio/mixer';
  }, [availableTabs, tab]);

  const navigate = (next: AudioWorkspaceTab) => {
    setTab(next);
    if (window.location.hash !== `#audio/${next}`) window.location.hash = `audio/${next}`;
  };

  const statusLine = audioStatusLine({
    tab,
    engineRunning,
    realtimeMetering: snapshot.audio.capabilities.realtimeMetering,
    routingSupport: snapshot.audio.capabilities.applicationRouting,
  });

  return (
    <section className="audio-page" data-testid="audio-console" data-audio-tab={tab}>
      <AudioHeader
        value={tab}
        onChange={navigate}
        tabs={availableTabs}
        statusLine={statusLine}
        end={tab === 'mixer' ? (
          <div className="mixer-mix-picker" role="group" aria-label="Mixer destination">
            <span className="mixer-mix-picker__label">Mix</span>
            <ToggleGroup
              type="single"
              value={selectedMixId}
              onValueChange={(value) => value && setSelectedMixId(value as AudioMixId)}
              aria-label="Select mixer destination"
            >
              {snapshot.audio.mixes.map((mix) => (
                <ToggleGroupItem key={mix.id} value={mix.id} aria-label={`${mix.label} mix`}>{mix.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}
      />
      <div
        id={`audio-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`audio-tab-${tab}`}
        tabIndex={0}
        className="audio-page__body outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        {tab === 'mixer' ? <MixerPage snapshot={snapshot} selectedMixId={selectedMixId} onNavigate={navigate} /> : null}
        {tab === 'game' ? <ChannelProcessingPage snapshot={snapshot} busId="game" /> : null}
        {tab === 'chat' ? <ChannelProcessingPage snapshot={snapshot} busId="chat" /> : null}
        {tab === 'media' ? <ChannelProcessingPage snapshot={snapshot} busId="media" /> : null}
        {tab === 'microphone' ? <MicrophonePage snapshot={snapshot} /> : null}
      </div>
    </section>
  );
}
