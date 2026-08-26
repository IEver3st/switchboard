import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import type { SystemSnapshot } from '../../../shared/contracts';
import { AudioTabs, audioWorkspaceTabs, type AudioWorkspaceTab } from '@/components/audio/AudioTabs';
import { ChannelProcessingPage } from '@/components/audio/ChannelProcessingPage';
import { clearAudioMeters, publishAudioMeterFrame } from '@/components/audio/meter-bus';
import { MicrophonePage } from '@/components/audio/MicrophonePage';
import { MixerPage } from '@/components/audio/MixerPage';
import { StatusDot } from '@/components/shared/surface';
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
      <header className="grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b border-border px-5 py-3 max-[720px]:grid-cols-1">
        <div className="flex min-w-0 items-start gap-2.5">
          <StatusDot active={engineRunning} warning={engine?.state === 'error'} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <h2 className="m-0 text-sm font-semibold text-foreground">Audio</h2>
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {engineRunning
                  ? `${Math.round(engine.memoryMb)} MB · ${engine.cpuPercent.toFixed(1)}% CPU · ${snapshot.audio.sampleRate / 1_000} kHz`
                  : engine?.state === 'error' ? (engine.message ?? 'Engine error') : 'Engine stopped'}
              </span>
            </div>
            <p className="m-0 mt-0.5 text-[8px] text-muted-foreground">
              {snapshot.prototypeMode
                ? 'Prototype audio graph · settings persist; routing, metering, and DSP support levels are shown per feature.'
                : 'Audio.Host owns routing and DSP outside Electron.'}
            </p>
          </div>
        </div>

        <label className="flex items-center justify-end gap-2 text-[9px] font-medium text-muted-foreground">
          Engine
          <Switch checked={snapshot.audio.enabled} disabled={actionPending === 'audio:enabled'} aria-label="Audio engine" onCheckedChange={(checked) => void setAudioEnabled(checked)} />
        </label>
      </header>

      <AudioTabs value={tab} onChange={navigate} />

      {!engineRunning ? (
        <div className="flex min-h-10 items-center justify-between gap-4 border-b border-border bg-card px-5 py-2 text-[9px] text-muted-foreground" role="status">
          <span>Audio engine is off. Configuration remains available; realtime meters and audio operations are paused.</span>
          <Button type="button" variant="secondary" size="sm" className="h-7 shrink-0 gap-1.5 px-2.5 text-[9px]" disabled={actionPending === 'audio:enabled'} onClick={() => void setAudioEnabled(true)}>
            <Play className="size-3" /> Start audio engine
          </Button>
        </div>
      ) : null}

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
