import { useEffect, useRef, useState } from 'react';
import type { ClipAudioWaveformTrack } from '../../../../shared/contracts';
import type { MontageMusicTrack, MontageV2Segment } from '../../../../shared/montage-v2';
import { automationGainAt, speedAt } from '../../../../shared/video-edits';
import { switchboardApi } from '@/lib/demo-api';

export type EditedAudioState = { segment: MontageV2Segment; sourceMs: number; frozen: boolean; playing: boolean; volume: number; muted: boolean; ducking?: MontageMusicTrack['ducking'] };

/** Uses the existing isolated per-track media protocol; raw audio never enters IPC. */
export function EditedAudioPreview({ state, onDuckGain, onError }: {
  state: EditedAudioState | null; onDuckGain: (gain: number) => void; onError: (message: string) => void;
}) {
  const [tracks, setTracks] = useState<ClipAudioWaveformTrack[]>([]);
  const stateRef = useRef(state); stateRef.current = state;
  const callbacks = useRef({ onDuckGain, onError }); callbacks.current = { onDuckGain, onError };
  const mediaRefs = useRef(new Map<number, HTMLAudioElement>());
  const syncRef = useRef<(() => void) | null>(null);
  const clipId = state?.segment.clipId;
  useEffect(() => {
    let active = true; setTracks([]);
    if (clipId) void switchboardApi.loadClipAudioWaveform(clipId).then(waveform => { if (active) setTracks(waveform.tracks); }).catch(cause => {
      if (active) callbacks.current.onError(`Clip audio preview is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
    return () => { active = false; };
  }, [clipId]);

  useEffect(() => {
    if (!tracks.length) return;
    let context: AudioContext | null = null;
    const nodes = new Map<number, { gain: GainNode; analyser?: AnalyserNode; buffer?: Float32Array<ArrayBuffer> }>();
    let frame: number | null = null, duckGain = 1, previousAt = performance.now();
    const setup = () => {
      if (context) return;
      context = new AudioContext();
      for (const track of tracks) {
        const audio = mediaRefs.current.get(track.trackIndex); if (!audio) continue;
        audio.volume = 1;
        const source = context.createMediaElementSource(audio), gain = context.createGain();
        source.connect(gain); gain.connect(context.destination);
        if (track.channel === 'microphone') {
          const analyser = context.createAnalyser(); analyser.fftSize = 1024; gain.connect(analyser);
          nodes.set(track.trackIndex, { gain, analyser, buffer: new Float32Array(1024) });
        } else nodes.set(track.trackIndex, { gain });
      }
    };
    const synchronize = () => {
      const next = stateRef.current; if (!next) return;
      if (next.playing) { setup(); if (context?.state === 'suspended') void context.resume(); }
      let rms = 0;
      for (const track of tracks) {
        const audio = mediaRefs.current.get(track.trackIndex); if (!audio) continue;
        const active = next.playing && !next.frozen;
        const trim = next.segment.audioTrackTrims?.[track.trackIndex];
        const trimmed = trim && (next.sourceMs < trim.startMs || next.sourceMs >= trim.endMs);
        const gain = next.muted || next.segment.muted || next.frozen || trimmed ? 0 : next.volume * next.segment.volume * (next.segment.audioTrackLevels?.[track.trackIndex] ?? 100) / 100 * automationGainAt(next.segment.videoEdits?.audioAutomation?.find(lane => lane.trackIndex === track.trackIndex), next.sourceMs);
        const node = nodes.get(track.trackIndex);
        if (node && context) node.gain.gain.setTargetAtTime(gain, context.currentTime, 0.004);
        else audio.volume = Math.max(0, Math.min(1, gain));
        audio.playbackRate = speedAt(next.sourceMs, next.segment.videoEdits); audio.preservesPitch = true;
        if (audio.readyState >= 1 && Math.abs(audio.currentTime * 1000 - next.sourceMs) > (active ? 100 : 10)) audio.currentTime = next.sourceMs / 1000;
        if (active && audio.paused) void audio.play().catch(() => callbacks.current.onError('An audio track could not play. Check the source media and try again.'));
        else if (!active) audio.pause();
        if (node?.analyser && node.buffer && active) {
          node.analyser.getFloatTimeDomainData(node.buffer);
          let power = 0; for (const sample of node.buffer) power += sample * sample;
          rms = Math.max(rms, Math.sqrt(power / node.buffer.length) / Math.max(0.001, next.volume));
        }
      }
      const ducking = next.ducking;
      const desired = ducking?.enabled && rms > 0.02 ? 1 - ducking.amount + ducking.amount * Math.pow(rms / 0.02, 1 / 8 - 1) : 1;
      const at = performance.now(), elapsed = Math.max(1, at - previousAt); previousAt = at;
      const duration = desired < duckGain ? ducking?.attackMs ?? 80 : ducking?.releaseMs ?? 500;
      duckGain += (desired - duckGain) * (1 - Math.exp(-elapsed / duration));
      callbacks.current.onDuckGain(next.playing ? duckGain : 1);
      if (!next.playing && context?.state === 'running') void context.suspend();
      if (next.playing && frame === null) frame = requestAnimationFrame(tick);
    };
    const tick = () => { frame = null; synchronize(); };
    syncRef.current = synchronize; synchronize();
    return () => {
      syncRef.current = null; if (frame !== null) cancelAnimationFrame(frame);
      for (const audio of mediaRefs.current.values()) audio.pause();
      for (const node of nodes.values()) { node.gain.disconnect(); node.analyser?.disconnect(); }
      if (context) void context.close(); callbacks.current.onDuckGain(1);
    };
  }, [tracks]);
  useEffect(() => { syncRef.current?.(); }, [state]);
  return <>{tracks.map(track => <audio key={`${clipId}:${track.trackIndex}`} ref={audio => { if (audio) mediaRefs.current.set(track.trackIndex, audio); else mediaRefs.current.delete(track.trackIndex); }} crossOrigin="anonymous" src={`switchboard-media://clip-audio/${encodeURIComponent(clipId ?? '')}?track=${track.trackIndex}`} preload="auto" onLoadedData={() => syncRef.current?.()} onError={() => callbacks.current.onError(`${track.label} audio preview could not be decoded.`)} />)}</>;
}
