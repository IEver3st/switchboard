import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ChevronRight, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { Clip, ClipAudioWaveform } from '../../../../shared/contracts';
import type { MontageV2Segment } from '../../../../shared/montage-v2';
import { channelColor } from '@/components/audio/channel-identity';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { switchboardApi } from '@/lib/demo-api';
import { AudioAutomationControls } from './AdvancedVideoControls';
import { PreciseTimeField } from './VideoEditControls';

export function ClipAudioInspector({ clip, segment, currentMs, selectedTrackIndex, onSelectTrack, onChange, onSeek }: {
  clip: Clip;
  segment: MontageV2Segment;
  currentMs: number;
  selectedTrackIndex: number;
  onSelectTrack: (trackIndex: number) => void;
  onChange: (segment: MontageV2Segment, mergeKey?: string) => void;
  onSeek: (sourceMs: number) => void;
}) {
  const [waveform, setWaveform] = useState<ClipAudioWaveform | null>(null);
  const [waveformError, setWaveformError] = useState(false);
  const [retry, setRetry] = useState(0);
  const lastAudibleLevels = useRef(new Map<string, number>());
  useEffect(() => {
    let active = true;
    setWaveform(null);
    setWaveformError(false);
    void switchboardApi.loadClipAudioWaveform(clip.id)
      .then(value => { if (active) setWaveform(value); })
      .catch(() => { if (active) setWaveformError(true); });
    return () => { active = false; };
  }, [clip.id, retry]);
  const confirmedWaveform = waveform?.clipId === clip.id ? waveform : null;
  const tracks = confirmedWaveform?.tracks ?? (clip.audioChannels ?? []).map((channel, trackIndex) => ({
    trackIndex, channel, label: channel === 'microphone' ? 'Microphone' : channel[0]!.toUpperCase() + channel.slice(1), samples: [],
  }));
  const track = tracks.find(value => value.trackIndex === selectedTrackIndex) ?? tracks[0];
  const trackIndex = track?.trackIndex ?? 0;
  const trackTrim = segment.audioTrackTrims?.[trackIndex] ?? { startMs: 0, endMs: clip.durationMs };
  const automation = segment.videoEdits?.audioAutomation?.find(value => value.trackIndex === trackIndex)
    ?? { trackIndex, points: [], mutes: [] };
  const changeLevel = (index: number, level: number) => {
    const levels = [...(segment.audioTrackLevels ?? [])];
    while (levels.length <= index) levels.push(100);
    levels[index] = level;
    if (level > 0) lastAudibleLevels.current.set(`${segment.id}:${index}`, level);
    onChange({ ...segment, audioTrackLevels: levels }, `segment:${segment.id}:track:${index}`);
  };
  const changeTrim = (trim: typeof trackTrim | null) => {
    const audioTrackTrims = [...(segment.audioTrackTrims ?? [])];
    while (audioTrackTrims.length <= trackIndex) audioTrackTrims.push(null);
    audioTrackTrims[trackIndex] = trim;
    onChange({ ...segment, audioTrackTrims }, `track-trim:${segment.id}:${trackIndex}`);
  };
  return <div className="clip-audio-inspector" data-dense={tracks.length > 2}>
    <section className="inspector-control-section" aria-labelledby="clip-channel-heading">
      <div className="inspector-section-title"><h3 id="clip-channel-heading">Source channels</h3><span>{tracks.length ? `${tracks.length} tracks` : 'Audio'}</span></div>
      {tracks.length ? <>
        <div className="inspector-channel-list" aria-label="Audio channels">
          {tracks.map(item => {
            const level = segment.audioTrackLevels?.[item.trackIndex] ?? 100;
            const selected = trackIndex === item.trackIndex;
            return <div key={item.trackIndex} className="inspector-channel" data-selected={selected} data-muted={level === 0} style={{ '--track-color': channelColor(item.channel ?? 'aux'), '--control-accent': channelColor(item.channel ?? 'aux') } as CSSProperties}>
              <div className="inspector-channel__heading">
                <button type="button" className="inspector-channel__select" aria-pressed={selected} aria-label={`Edit ${item.label} channel`} onClick={() => onSelectTrack(item.trackIndex)}><i aria-hidden="true" /><strong>{item.label}</strong><ChevronRight className="inspector-channel__arrow" aria-hidden="true" /></button>
                <output>{level}%</output>
                <Button type="button" size="icon" variant="ghost" aria-label={`${level === 0 ? 'Unmute' : 'Mute'} ${item.label}`} aria-pressed={level === 0} onClick={() => {
                  const key = `${segment.id}:${item.trackIndex}`;
                  if (level > 0) lastAudibleLevels.current.set(key, level);
                  changeLevel(item.trackIndex, level === 0 ? lastAudibleLevels.current.get(key) ?? 100 : 0);
                }}>{level === 0 ? <VolumeX /> : <Volume2 />}</Button>
              </div>
              <Slider variant="fader" min={0} max={100} step={1} value={[level]} aria-label={`${item.label} channel volume`} onValueChange={([next]) => { if (next !== undefined) changeLevel(item.trackIndex, next); }} />
            </div>;
          })}
        </div>
        <div className="inspector-master-level">
          <div className="inspector-channel__heading"><strong>Overall clip volume</strong><output>{Math.round(segment.volume * 100)}%</output>
            <Button type="button" size="icon" variant="ghost" aria-label={segment.muted ? 'Restore clip audio' : 'Mute clip audio'} aria-pressed={segment.muted} onClick={() => onChange({ ...segment, muted: !segment.muted })}>{segment.muted ? <VolumeX /> : <Volume2 />}</Button>
          </div>
          <Slider variant="fader" min={0} max={100} step={1} value={[Math.round(segment.volume * 100)]} aria-label="Overall clip volume" onValueChange={([value]) => { if (value !== undefined) onChange({ ...segment, muted: false, volume: value / 100 }, `segment:${segment.id}:volume`); }} />
          {segment.muted ? <p className="inspector-audio-status">All source channels are muted.</p> : null}
        </div>
      </> : <p className="inspector-empty" role="status">{waveformError ? 'Source audio could not be read.' : confirmedWaveform ? 'This clip has no audio tracks.' : 'Reading source audio…'}</p>}
      {waveformError ? <div className="inspector-audio-status" role="status"><span>Waveform unavailable</span><Button type="button" size="sm" variant="ghost" onClick={() => setRetry(value => value + 1)}>Retry</Button></div> : null}
    </section>
    {track ? <section className="inspector-control-section inspector-channel-detail" style={{ '--track-color': channelColor(track.channel ?? 'aux') } as CSSProperties} aria-labelledby="clip-channel-trim-heading">
      <div className="inspector-section-title"><h3 id="clip-channel-trim-heading">{track.label} trim</h3>
        <Button type="button" variant="ghost" size="sm" disabled={!segment.audioTrackTrims?.[trackIndex]} aria-label={`Reset ${track.label} audio trim`} onClick={() => changeTrim(null)}><RotateCcw />Reset</Button>
      </div>
      <div className="editor-music-waveform inspector-channel-waveform" aria-label={`${track.label} source waveform`}>
        {track.samples.length ? <svg viewBox="0 0 240 48" preserveAspectRatio="none" aria-hidden="true">{track.samples.map((sample, index) => <line key={index} x1={index / track.samples.length * 240} x2={index / track.samples.length * 240} y1={24 - sample * 22} y2={24 + sample * 22} />)}</svg> : <span>{waveformError ? 'Waveform unavailable' : confirmedWaveform ? 'No waveform data' : 'Reading waveform…'}</span>}
        <i style={{ left: 0, width: `${trackTrim.startMs / Math.max(1, clip.durationMs) * 100}%` }} /><i style={{ right: 0, width: `${(1 - trackTrim.endMs / Math.max(1, clip.durationMs)) * 100}%` }} />
      </div>
      <div className="editor-field-pair"><PreciseTimeField label="Audio in" valueMs={trackTrim.startMs} maximumMs={trackTrim.endMs - 1} onChange={startMs => changeTrim({ ...trackTrim, startMs })} /><PreciseTimeField label="Audio out" valueMs={trackTrim.endMs} minimumMs={trackTrim.startMs + 1} maximumMs={clip.durationMs} onChange={endMs => changeTrim({ ...trackTrim, endMs })} /></div>
      <details className="inspector-disclosure" key={`${segment.id}:${trackIndex}`}>
        <summary><span>Volume automation</span><small>{automation.points.length || automation.mutes.length ? `${automation.points.length} ${automation.points.length === 1 ? 'point' : 'points'} · ${automation.mutes.length} ${automation.mutes.length === 1 ? 'mute' : 'mutes'}` : 'Optional'}</small></summary>
        <AudioAutomationControls automation={automation} currentMs={currentMs} startMs={segment.trimStartMs} endMs={segment.trimEndMs} onSeek={onSeek} onChange={(value, key) => onChange({ ...segment, videoEdits: { ...segment.videoEdits, audioAutomation: [...(segment.videoEdits?.audioAutomation ?? []).filter(item => item.trackIndex !== trackIndex), { ...value, trackIndex }] } }, key ? `automation:${trackIndex}:${key}` : undefined)} />
      </details>
    </section> : null}
  </div>;
}
