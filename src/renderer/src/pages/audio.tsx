import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AudioMixId, SystemSnapshot } from '../../../shared/contracts';
import { audioRoutingNotice, type AudioRecoveryAction } from '../../../shared/audio-health';
import { AudioRoutingNotice } from '@/components/audio/AudioRoutingNotice';
import { AudioHeader, audioStatusLine, audioWorkspaceTabs, type AudioWorkspaceTab } from '@/components/audio/AudioHeader';
import { ChannelProcessingPage } from '@/components/audio/ChannelProcessingPage';
import { clearAudioMeters, publishAudioMeterFrame } from '@/components/audio/meter-bus';
import { MicrophonePage } from '@/components/audio/MicrophonePage';
import { MixerPage } from '@/components/audio/MixerPage';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { requestSettingsCategory } from '@/components/settings/settings-catalog';
import { switchboardApi } from '@/lib/demo-api';
import { useSystemStore } from '@/stores/use-system-store';
import '@/components/audio/audio.css';

function tabFromHash(): AudioWorkspaceTab {
  const candidate = window.location.hash.replace(/^#audio\/?/, '');
  return audioWorkspaceTabs.includes(candidate as AudioWorkspaceTab) ? candidate as AudioWorkspaceTab : 'mixer';
}

export function AudioPage({ snapshot }: { snapshot: SystemSnapshot }) {
  const [tab, setTab] = useState<AudioWorkspaceTab>(tabFromHash);
  const [selectedMixId, setSelectedMixId] = useState<AudioMixId>('personal');
  const setPage = useSystemStore((state) => state.setPage);
  const pending = useSystemStore(state => state.pendingAudioOperations > 0);
  const restartAudio = useSystemStore(state => state.restartAudio);
  const setAudioEnabled = useSystemStore(state => state.setAudioEnabled);
  const openWindowsSound = useSystemStore(state => state.openWindowsSound);
  const setAudioMasterEnabled = useSystemStore(state => state.setAudioMasterEnabled);
  const setAudioMasterGain = useSystemStore(state => state.setAudioMasterGain);
  const engine = snapshot.engines.find((candidate) => candidate.kind === 'audio');
  const engineRunning = engine?.state === 'running';
  const streamUnavailable = snapshot.audio.capabilities.streamOutput === 'unavailable';
  const effectiveMixId = selectedMixId === 'stream' && streamUnavailable ? 'personal' : selectedMixId;
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

  const navigate = useCallback((next: AudioWorkspaceTab) => {
    setTab(next);
    if (window.location.hash !== `#audio/${next}`) window.location.hash = `audio/${next}`;
  }, []);

  const openAudioSettings = () => { requestSettingsCategory('audio'); setPage('settings'); };
  const recover = (action: AudioRecoveryAction) => {
    if (action === 'enable') void setAudioEnabled(true);
    else if (action === 'restart') void restartAudio();
    else if (action === 'windows') void openWindowsSound();
    else if (action === 'unmute') void setAudioMasterEnabled({ mixId: 'personal', enabled: true });
    else if (action === 'volume') void setAudioMasterGain({ mixId: 'personal', gain: 1 });
    else if (action === 'mixer') { setSelectedMixId('personal'); navigate('mixer'); }
    else openAudioSettings();
  };

  const statusLine = audioStatusLine({
    tab,
    engineRunning,
    realtimeMetering: snapshot.audio.capabilities.realtimeMetering,
    routingSupport: snapshot.audio.capabilities.applicationRouting,
    processingSupport: tab === 'microphone' ? snapshot.audio.capabilities.microphoneDsp : snapshot.audio.capabilities.channelDsp,
    routingBackend: snapshot.audio.capabilities.routingBackend,
    setupPhase: snapshot.audio.dependencies.phase,
  });

  return (
    <section className="audio-page" data-testid="audio-console" data-audio-tab={tab}>
      <AudioHeader
        value={tab}
        onChange={navigate}
        tabs={availableTabs}
        statusLine={statusLine}
        engineRunning={engineRunning}
        onOpenSettings={openAudioSettings}
        end={tab === 'mixer' ? (
          <div className="mixer-mix-picker" role="group" aria-label="Mixer destination">
            <span className="mixer-mix-picker__label">Mix for</span>
            <ToggleGroup
              type="single"
              value={effectiveMixId}
              onValueChange={(value) => value && setSelectedMixId(value as AudioMixId)}
              aria-label="Select mixer destination"
            >
              {snapshot.audio.mixes.map((mix) => (
                <ToggleGroupItem key={mix.id} value={mix.id} aria-label={`${mix.label} mix`}
                  disabled={mix.id === 'stream' && streamUnavailable}
                  title={mix.id === 'stream' && streamUnavailable ? 'A separate Stream output is unavailable with one virtual cable.' : undefined}
                >{mix.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}
      />
      <AudioRoutingNotice notice={audioRoutingNotice(snapshot)} pending={pending} onAction={recover} />
      <div
        id={`audio-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`audio-tab-${tab}`}
        tabIndex={0}
        className="audio-page__body outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        {tab === 'mixer' ? <MixerPage audio={snapshot.audio} engineRunning={engineRunning} selectedMixId={effectiveMixId} onNavigate={navigate} /> : null}
        {tab === 'game' ? <ChannelProcessingPage snapshot={snapshot} busId="game" /> : null}
        {tab === 'chat' ? <ChannelProcessingPage snapshot={snapshot} busId="chat" /> : null}
        {tab === 'media' ? <ChannelProcessingPage snapshot={snapshot} busId="media" /> : null}
        {tab === 'microphone' ? <MicrophonePage audio={snapshot.audio} engineRunning={engineRunning} /> : null}
      </div>
    </section>
  );
}
