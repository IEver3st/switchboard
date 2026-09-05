import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MontageMusicTrack, MontageAudioWaveform } from '../../../../shared/montage-audio';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { montageV2Api } from '@/lib/montage-v2-api';
import { createMontageMusicTrack, musicPlaybackAt } from './montage-v2-model';
import { PreciseTimeField } from './VideoEditControls';

export function ClipMusicControls({ music, durationMs, onChange }: {
  music: MontageMusicTrack | null; durationMs: number; onChange: (music: MontageMusicTrack | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<MontageAudioWaveform | null>(null);
  useEffect(() => {
    let active = true;
    setWaveform(null);
    if (music) void montageV2Api.loadMontageAudioWaveform(music.asset.id).then((data) => { if (active) setWaveform(data); }).catch(() => { if (active) setError('Waveform unavailable. Exact trimming is still available.'); });
    return () => { active = false; };
  }, [music?.asset.id]);
  const importMusic = async () => {
    setPending(true); setError(null);
    try { const asset = await montageV2Api.importMontageAudio(); if (asset) onChange(createMontageMusicTrack(asset)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPending(false); }
  };
  const change = (patch: Partial<MontageMusicTrack>) => { if (music) onChange({ ...music, ...patch }); };
  return <section className="editor-clip-music">
    <h3>Music <Button variant="ghost" size="sm" disabled={pending} onClick={() => void importMusic()}>{pending ? 'Importing…' : music ? 'Replace music' : 'Add music'}</Button></h3>
    {music ? <>
      <strong className="editor-music-name" title={music.asset.name}>{music.asset.name}</strong>
      <div className="editor-music-waveform">
        {waveform ? <svg viewBox="0 0 240 48" preserveAspectRatio="none" aria-label="Music source waveform">{waveform.samples.map((sample, index) => <line key={index} x1={index / waveform.samples.length * 240} x2={index / waveform.samples.length * 240} y1={24 - sample * 22} y2={24 + sample * 22} />)}</svg> : <span>{error ? 'Waveform unavailable' : 'Reading waveform…'}</span>}
        <i style={{ left: 0, width: `${music.sourceStartMs / music.asset.durationMs * 100}%` }} /><i style={{ right: 0, width: `${(1 - music.sourceEndMs / music.asset.durationMs) * 100}%` }} />
      </div>
      <Slider min={0} max={music.asset.durationMs} step={1} minStepsBetweenThumbs={100} value={[music.sourceStartMs, music.sourceEndMs]} thumbLabels={['Music trim start', 'Music trim end']} onValueChange={([sourceStartMs, sourceEndMs]) => { if (sourceStartMs !== undefined && sourceEndMs !== undefined) change({ sourceStartMs, sourceEndMs }); }} />
      <div className="editor-field-pair"><PreciseTimeField label="Music source in" valueMs={music.sourceStartMs} maximumMs={music.sourceEndMs - 100} onChange={(sourceStartMs) => change({ sourceStartMs })} /><PreciseTimeField label="Music source out" valueMs={music.sourceEndMs} minimumMs={music.sourceStartMs + 100} maximumMs={music.asset.durationMs} onChange={(sourceEndMs) => change({ sourceEndMs })} /></div>
      <div className="editor-field-pair"><PreciseTimeField label="Music starts at" valueMs={music.timelineStartMs} maximumMs={durationMs - 1} onChange={(timelineStartMs) => change({ timelineStartMs })} /><PreciseTimeField label="Music fade in" valueMs={music.fadeInMs} maximumMs={Math.min(30000, durationMs / 2)} onChange={(fadeInMs) => change({ fadeInMs })} /></div>
      <div className="editor-field-pair"><PreciseTimeField label="Music fade out" valueMs={music.fadeOutMs} maximumMs={Math.min(30000, durationMs / 2)} onChange={(fadeOutMs) => change({ fadeOutMs })} /><label className="editor-switch">Loop<Switch aria-label="Loop clip music" checked={music.loop} onCheckedChange={(loop) => change({ loop })} /></label></div>
      <label className="editor-adjustment"><span>Music volume<output>{Math.round(music.volume * 100)}%</output></span><Slider aria-label="Clip music volume" min={0} max={100} step={1} value={[music.volume * 100]} onValueChange={([value]) => { if (value !== undefined) change({ volume: value / 100 }); }} /></label>
      <div className="editor-field-pair"><Button variant="secondary" size="sm" onClick={() => change({ muted: !music.muted })}>{music.muted ? 'Unmute music' : 'Mute music'}</Button><Button variant="ghost" size="sm" onClick={() => onChange(null)}>Remove music</Button></div>
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}

export function ClipMusicPreview({ music, videoRef, startMs, durationMs, speed, gain }: {
  music: MontageMusicTrack | null; videoRef: RefObject<HTMLVideoElement | null>; startMs: number; durationMs: number; speed: number; gain: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const video = videoRef.current; const audio = audioRef.current;
    if (!video || !audio || !music) return;
    setError(false);
    let frame: number | null = null;
    let failed = false;
    const update = () => {
      const time = (video.currentTime * 1000 - startMs) / speed;
      const state = musicPlaybackAt(music, time, durationMs);
      audio.volume = state.gain * gain;
      if (!state.active || video.paused) audio.pause();
      if (audio.readyState >= 1 && Math.abs(audio.currentTime - state.sourceTimeMs / 1000) > 0.08) audio.currentTime = state.sourceTimeMs / 1000;
      if (!failed && state.active && !video.paused && audio.paused) void audio.play().catch(() => { failed = true; setError(true); });
    };
    const stop = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; audio.pause(); };
    const tick = () => { frame = null; update(); if (!video.paused) frame = requestAnimationFrame(tick); };
    const play = () => { stop(); failed = false; tick(); };
    video.addEventListener('play', play); video.addEventListener('pause', stop); video.addEventListener('seeked', update); audio.addEventListener('loadedmetadata', update);
    if (!video.paused) play(); else update();
    return () => { stop(); video.removeEventListener('play', play); video.removeEventListener('pause', stop); video.removeEventListener('seeked', update); audio.removeEventListener('loadedmetadata', update); };
  }, [music, videoRef, startMs, durationMs, speed, gain]);
  return <><audio ref={audioRef} src={music ? `switchboard-media://montage-audio/${encodeURIComponent(music.asset.id)}` : undefined} preload="metadata" hidden onError={() => setError(true)} />{music && error ? <span className="editor-music-preview-error" role="status">Music preview unavailable</span> : null}</>;
}
