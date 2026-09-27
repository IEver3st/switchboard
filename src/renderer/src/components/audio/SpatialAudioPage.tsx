import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { LocateFixed, RotateCcw } from 'lucide-react';
import { defaultSpatialSpeakers, type AudioState, type SetSpatialAudioInput, type SpatialSettings, type SpatialSpeaker } from '../../../../shared/contracts';
import { AudioNotice } from './AudioModule';
import { ParameterControl } from './processors/ParameterControl';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/cn';
import { useSystemStore } from '@/stores/use-system-store';

type SpeakerId = SpatialSpeaker['id'];

const speakerNames: Record<SpeakerId, [short: string, long: string]> = {
  'front-left': ['FL', 'Front left'], 'front-right': ['FR', 'Front right'], center: ['C', 'Center'],
  'side-left': ['SL', 'Side left'], 'side-right': ['SR', 'Side right'], 'rear-left': ['RL', 'Rear left'], 'rear-right': ['RR', 'Rear right'],
};
const speakerColors: Record<SpeakerId, string> = {
  'front-left': 'var(--accent-brand)', 'front-right': 'var(--accent-brand)', center: 'var(--channel-game)',
  'side-left': 'var(--channel-chat)', 'side-right': 'var(--channel-chat)', 'rear-left': 'var(--channel-media)', 'rear-right': 'var(--channel-media)',
};
const stages = [
  { name: 'Focused', immersion: 0.1, distance: 0.8 },
  { name: 'Natural', immersion: 0.4, distance: 1.4 },
  { name: 'Cinema', immersion: 0.9, distance: 2.2 },
];
const trackingLabels = {
  off: 'Tracking off',
  waiting: 'Waiting for motion data',
  tracking: 'Following your head',
  stale: 'Motion signal lost · stage held in place',
  error: 'Sensor unavailable',
};

// Map geometry (SVG units). Speaker distance 0.5–2 maps between the inner and outer rings.
const SIZE = 400;
const CENTER = SIZE / 2;
const INNER = 92;
const OUTER = 176;
const HEAD_RADIUS = 40;
const radiusFor = (distance: number) => INNER + ((distance - 0.5) / 1.5) * (OUTER - INNER);

/** Where the engine places a speaker: stereo mode derives the front pair from stage width. */
function effectiveAzimuth(speaker: SpatialSpeaker, settings: SpatialSettings): number {
  if (settings.mode !== 'stereo') return speaker.azimuth;
  if (speaker.id === 'front-left') return -settings.widthDegrees / 2;
  if (speaker.id === 'front-right') return settings.widthDegrees / 2;
  return speaker.azimuth;
}

/** Mirrors SpatialSampleProvider's per-speaker weighting so the map shows what is heard. */
function speakerWeight(speaker: SpatialSpeaker, settings: SpatialSettings): number {
  if (!speaker.enabled) return 0;
  const front = speaker.id === 'front-left' || speaker.id === 'front-right';
  const strength = settings.mode === 'stereo' ? (front ? 1 : 0)
    : front ? 1
      : speaker.id === 'center' ? 0.25
        : speaker.id.startsWith('side') ? 0.15 + settings.immersion * 0.45
          : 0.1 + settings.immersion * 0.4;
  return strength * 10 ** (speaker.gainDb / 20) / Math.sqrt(speaker.distance * settings.distance);
}

function point(azimuth: number, radius: number) {
  const angle = (azimuth * Math.PI) / 180;
  return { x: CENTER + Math.sin(angle) * radius, y: CENTER - Math.cos(angle) * radius };
}

function SpeakerNumber({ label, value, min, max, step, unit, disabled, onCommit }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; disabled: boolean; onCommit(value: number): void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value, disabled]);
  return (
    <label className="spatial-number">
      <span>{label}</span>
      <span>
        <input
          aria-label={label}
          type="number"
          value={text}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => {
            const next = Number(event.currentTarget.value);
            if (event.currentTarget.value.trim() && Number.isFinite(next) && next >= min && next <= max && next !== value) onCommit(next);
            else setText(String(value));
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') { event.currentTarget.value = String(value); setText(String(value)); event.currentTarget.blur(); }
          }}
        />
        <span>{unit}</span>
      </span>
    </label>
  );
}

export function SpatialAudioPage({ audio }: { audio: AudioState }) {
  const update = useSystemStore((state) => state.setSpatialAudio);
  const recenter = useSystemStore((state) => state.recenterSpatialAudio);
  const connect = useSystemStore((state) => state.connectHeadsetTracking);
  const error = useSystemStore((state) => state.error);
  const [pending, setPending] = useState(0);
  const [centered, setCentered] = useState(false);
  const [selected, setSelected] = useState<SpeakerId>('front-left');
  const [draft, setDraft] = useState(audio.spatial.speakers);
  const [port, setPort] = useState(String(audio.spatial.trackerPort));
  const board = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: SpeakerId; x: number; y: number; moved: boolean; speakers: SpatialSpeaker[] } | null>(null);
  useEffect(() => { if (!dragging.current) setDraft(audio.spatial.speakers); }, [audio.spatial.speakers]);
  useEffect(() => setPort(String(audio.spatial.trackerPort)), [audio.spatial.trackerPort]);

  const settings = audio.spatial;
  const runtime = audio.host?.spatial;
  const available = audio.enabled && audio.capabilities.spatialAudio === 'available';
  const on = available && settings.enabled;
  const stereo = settings.mode === 'stereo';
  const trackingState = on && settings.trackingEnabled ? runtime?.trackingState ?? 'waiting' : 'off';

  // Writes are serialized in main; controls stay usable while one is in flight.
  const run = (operation: () => Promise<void>) => {
    setPending((count) => count + 1);
    void operation().finally(() => setPending((count) => count - 1));
  };
  const change = (input: SetSpatialAudioInput) => { setCentered(false); run(() => update(input)); };

  const visible = draft.filter((speaker) => !stereo || speaker.id === 'front-left' || speaker.id === 'front-right');
  const current = visible.find((speaker) => speaker.id === selected) ?? visible[0]!;
  const weights = new Map(visible.map((speaker) => [speaker.id, speakerWeight(speaker, { ...settings, speakers: draft })]));
  const maxWeight = Math.max(0.0001, ...weights.values());
  const editSpeaker = (patch: Partial<SpatialSpeaker>) => change({ speakers: settings.speakers.map((speaker) => speaker.id === current.id ? { ...speaker, ...patch } : speaker) });
  const activeStage = stages.find((stage) => settings.immersion === stage.immersion && settings.distance === stage.distance)?.name ?? '';
  const validPort = /^\d+$/.test(port) && Number(port) >= 1024 && Number(port) <= 65535;
  const status = !available
    ? (!audio.enabled ? 'Audio engine is off' : 'Unavailable on this output')
    : !settings.enabled ? 'Off · your mix plays as normal stereo'
      : `${stereo ? 'Stereo' : '7-speaker'} stage · ${settings.distance.toFixed(1)} m`;

  const finishDrag = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const drag = dragging.current;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && drag?.moved) change({ speakers: drag.speakers });
    else setDraft(settings.speakers);
  };

  return (
    <div className="audio-channel spatial-page">
      {!available ? (
        <AudioNotice>{!audio.enabled
          ? 'Start the audio engine in Settings to use spatial audio.'
          : 'Spatial audio needs audio routing, which is not available right now. Restart the audio engine; details are in Settings, Diagnostics.'}</AudioNotice>
      ) : null}
      {error ? <p className="spatial-error" role="alert">{error}</p> : null}

      <section className={cn('spatial-hero', !on && 'is-off')} aria-labelledby="spatial-stage-heading" aria-busy={pending > 0 || undefined}>
        <header className="spatial-hero__head">
          <div>
            <h3 id="spatial-stage-heading">Headphone soundstage</h3>
            <p className="spatial-hero__status">
              {status}
              {on && settings.trackingEnabled ? (
                <span className="spatial-tracking__status" data-tracking={trackingState}>
                  <span aria-hidden="true" />{trackingLabels[trackingState]}
                </span>
              ) : null}
            </p>
          </div>
          <Switch checked={settings.enabled} disabled={!available} aria-label="Enable spatial audio" onCheckedChange={(enabled) => change({ enabled })} />
        </header>

        <div className="spatial-hero__body">
          <figure className="spatial-map">
            <div className="spatial-map__board" ref={board} role="group" aria-label="Virtual speaker positions, top view. You face up.">
              <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
                <defs>
                  <radialGradient id="spatial-floor" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="var(--accent-brand)" stopOpacity={on ? 0.16 : 0.05} />
                    <stop offset="70%" stopColor="var(--accent-brand)" stopOpacity={on ? 0.04 : 0.01} />
                    <stop offset="100%" stopColor="var(--accent-brand)" stopOpacity="0" />
                  </radialGradient>
                  {visible.map((speaker) => (
                    <linearGradient key={speaker.id} id={`spatial-beam-${speaker.id}`} gradientUnits="userSpaceOnUse"
                      x1={point(effectiveAzimuth(speaker, settings), radiusFor(speaker.distance)).x}
                      y1={point(effectiveAzimuth(speaker, settings), radiusFor(speaker.distance)).y}
                      x2={point(effectiveAzimuth(speaker, settings), HEAD_RADIUS).x}
                      y2={point(effectiveAzimuth(speaker, settings), HEAD_RADIUS).y}>
                      <stop offset="0%" stopColor={speakerColors[speaker.id]} stopOpacity="0.75" />
                      <stop offset="100%" stopColor={speakerColors[speaker.id]} stopOpacity="0" />
                    </linearGradient>
                  ))}
                </defs>
                <circle cx={CENTER} cy={CENTER} r={OUTER + 14} fill="url(#spatial-floor)" />
                {[INNER, (INNER + OUTER) / 2, OUTER].map((radius) => <circle key={radius} cx={CENTER} cy={CENTER} r={radius} className="spatial-map__ring" />)}
                <line x1={CENTER} y1={CENTER - OUTER - 8} x2={CENTER} y2={CENTER + OUTER + 8} className="spatial-map__axis" />
                <line x1={CENTER - OUTER - 8} y1={CENTER} x2={CENTER + OUTER + 8} y2={CENTER} className="spatial-map__axis" />
                <text x={CENTER} y={14} textAnchor="middle" className="spatial-map__label">FRONT</text>
                <text x={CENTER} y={SIZE - 6} textAnchor="middle" className="spatial-map__label">BACK</text>

                {visible.map((speaker) => {
                  const weight = (weights.get(speaker.id) ?? 0) / maxWeight;
                  if (!on || weight <= 0) return null;
                  const azimuth = effectiveAzimuth(speaker, settings);
                  const source = point(azimuth, radiusFor(speaker.distance));
                  const arrival = point(azimuth, HEAD_RADIUS);
                  const halfWidth = 3 + weight * 9;
                  const side = (angle: number, from: { x: number; y: number }, width: number) => {
                    const offset = point(angle, width);
                    return `${from.x + offset.x - CENTER} ${from.y + offset.y - CENTER}`;
                  };
                  return (
                    <path
                      key={speaker.id}
                      d={`M ${side(azimuth - 90, source, 3)} L ${side(azimuth + 90, source, 3)} L ${side(azimuth + 90, arrival, halfWidth)} L ${side(azimuth - 90, arrival, halfWidth)} Z`}
                      fill={`url(#spatial-beam-${speaker.id})`}
                      opacity={0.3 + weight ** 1.4 * 0.7}
                    />
                  );
                })}

                <g className="spatial-map__head">
                  <path d={`M ${CENTER - 8} ${CENTER - 22} L ${CENTER} ${CENTER - 38} L ${CENTER + 8} ${CENTER - 22} Z`} className="spatial-map__nose" />
                  <ellipse cx={CENTER} cy={CENTER + 2} rx="21" ry="25" className="spatial-map__skull" />
                  <path d={`M ${CENTER - 24} ${CENTER + 2} Q ${CENTER} ${CENTER - 6} ${CENTER + 24} ${CENTER + 2}`} className="spatial-map__band" />
                  <rect x={CENTER - 32} y={CENTER - 10} width="11" height="24" rx="5" className="spatial-map__cup" />
                  <rect x={CENTER + 21} y={CENTER - 10} width="11" height="24" rx="5" className="spatial-map__cup" />
                </g>
              </svg>

              {visible.map((speaker) => {
                const azimuth = effectiveAzimuth(speaker, settings);
                const position = point(azimuth, radiusFor(speaker.distance));
                const weight = (weights.get(speaker.id) ?? 0) / maxWeight;
                const movable = on && !stereo;
                return (
                  <button
                    type="button"
                    key={speaker.id}
                    className="spatial-speaker"
                    data-enabled={speaker.enabled}
                    data-selected={speaker.id === current.id}
                    data-movable={movable}
                    style={{ left: `${(position.x / SIZE) * 100}%`, top: `${(position.y / SIZE) * 100}%`, '--speaker-color': speakerColors[speaker.id], '--energy': on ? weight : 0 } as CSSProperties}
                    aria-label={`${speakerNames[speaker.id][1]}, ${Math.round(azimuth)} degrees${speaker.enabled ? '' : ', muted'}`}
                    aria-pressed={speaker.id === current.id}
                    title={`${speakerNames[speaker.id][1]} · ${Math.round(azimuth)}° · ${(speaker.distance * settings.distance).toFixed(1)} m`}
                    disabled={!on}
                    onClick={() => setSelected(speaker.id)}
                    onPointerDown={(event) => {
                      setSelected(speaker.id);
                      if (event.button !== 0 || !movable) return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      dragging.current = { id: speaker.id, x: event.clientX, y: event.clientY, moved: false, speakers: draft };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      const drag = dragging.current;
                      if (!drag || drag.id !== speaker.id || !board.current) return;
                      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
                      drag.moved = true;
                      const rect = board.current.getBoundingClientRect();
                      const x = ((event.clientX - rect.left) / rect.width) * SIZE - CENTER;
                      const y = ((event.clientY - rect.top) / rect.height) * SIZE - CENTER;
                      const nextAzimuth = Math.round((Math.atan2(x, -y) * 180) / Math.PI);
                      const nextDistance = Math.round(Math.max(0.5, Math.min(2, 0.5 + ((Math.hypot(x, y) - INNER) / (OUTER - INNER)) * 1.5)) * 10) / 10;
                      drag.speakers = settings.speakers.map((item) => item.id === speaker.id ? { ...item, azimuth: nextAzimuth, distance: nextDistance } : item);
                      setDraft(drag.speakers);
                    }}
                    onPointerUp={(event) => finishDrag(event)}
                    onPointerCancel={(event) => finishDrag(event, true)}
                    onLostPointerCapture={(event) => { if (dragging.current) finishDrag(event, true); }}
                    onKeyDown={(event) => {
                      if (!movable) return;
                      const delta = event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0;
                      const distanceDelta = event.key === 'ArrowUp' ? 0.1 : event.key === 'ArrowDown' ? -0.1 : 0;
                      if (!delta && !distanceDelta) return;
                      event.preventDefault();
                      change({ speakers: settings.speakers.map((item) => item.id === speaker.id ? {
                        ...item,
                        azimuth: Math.max(-180, Math.min(180, item.azimuth + delta)),
                        distance: Math.round(Math.max(0.5, Math.min(2, item.distance + distanceDelta)) * 10) / 10,
                      } : item) });
                    }}
                  >
                    {speakerNames[speaker.id][0]}
                  </button>
                );
              })}
            </div>
            {on ? <figcaption>{stereo ? 'Stereo places two speakers from the stage width.' : 'Drag a speaker to move it. Arrow keys fine-tune the selected one.'}</figcaption> : null}
          </figure>

          <div className="spatial-controls">
            <div className="spatial-field">
              <span className="spatial-field__label" id="spatial-layout-label">Layout</span>
              <ToggleGroup type="single" value={settings.mode} aria-labelledby="spatial-layout-label" disabled={!on}
                onValueChange={(mode) => { if (mode) change({ mode: mode as SpatialSettings['mode'] }); }}>
                <ToggleGroupItem value="surround">7 speakers</ToggleGroupItem>
                <ToggleGroupItem value="stereo">Stereo</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="spatial-field">
              <span className="spatial-field__label" id="spatial-room-label">Room</span>
              <ToggleGroup type="single" value={activeStage} aria-labelledby="spatial-room-label" disabled={!on}
                onValueChange={(name) => {
                  const stage = stages.find((candidate) => candidate.name === name);
                  if (stage) change({ immersion: stage.immersion, distance: stage.distance, amount: 1 });
                }}>
                {stages.map((stage) => <ToggleGroupItem key={stage.name} value={stage.name}>{stage.name}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>

            <div className="spatial-sliders">
              {stereo ? (
                <ParameterControl label="Stage width" value={settings.widthDegrees} min={20} max={180} step={5} unit="°" disabled={!on} onCommit={(widthDegrees) => change({ widthDegrees })} />
              ) : (
                <ParameterControl label="Immersion" value={settings.immersion * 100} min={0} max={100} step={5} unit="%" disabled={!on} onCommit={(immersion) => change({ immersion: immersion / 100 })} />
              )}
              <ParameterControl label="Distance" value={settings.distance} min={0.5} max={3} step={0.1} unit=" m" precision={1} disabled={!on} onCommit={(distance) => change({ distance })} />
              <ParameterControl label="Effect amount" value={settings.amount * 100} min={0} max={100} step={5} unit="%" disabled={!on} onCommit={(amount) => change({ amount: amount / 100 })} />
            </div>

            <div className="spatial-speaker-card" role="group" aria-label={`${speakerNames[current.id][1]} speaker settings`} style={{ '--speaker-color': speakerColors[current.id] } as CSSProperties}>
              <div className="spatial-speaker-card__head">
                <span className="spatial-speaker-card__chip">{speakerNames[current.id][0]}</span>
                <strong>{speakerNames[current.id][1]}</strong>
                {stereo ? null : (
                  <label className="spatial-speaker-card__toggle">
                    <span>Speaker on</span>
                    <Switch checked={current.enabled} aria-label={`${speakerNames[current.id][1]} speaker on`} disabled={!on} onCheckedChange={(enabled) => editSpeaker({ enabled })} />
                  </label>
                )}
              </div>
              <div className="spatial-speaker-card__fields">
                {stereo ? null : <SpeakerNumber label="Angle" value={current.azimuth} min={-180} max={180} step={5} unit="°" disabled={!on} onCommit={(azimuth) => editSpeaker({ azimuth })} />}
                <SpeakerNumber label="Height" value={current.elevation} min={-40} max={90} step={5} unit="°" disabled={!on} onCommit={(elevation) => editSpeaker({ elevation })} />
                <SpeakerNumber label="Distance scale" value={current.distance} min={0.5} max={2} step={0.1} unit="×" disabled={!on} onCommit={(distance) => editSpeaker({ distance })} />
                <SpeakerNumber label="Level" value={current.gainDb} min={-24} max={6} step={0.5} unit="dB" disabled={!on} onCommit={(gainDb) => editSpeaker({ gainDb })} />
              </div>
              <Button size="sm" variant="ghost" className="spatial-speaker-card__reset" disabled={!on} onClick={() => change({ speakers: defaultSpatialSpeakers() })}>
                <RotateCcw aria-hidden="true" /> Reset all speakers
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className={cn('spatial-tracking', !on && 'is-off')} aria-labelledby="spatial-tracking-heading">
        <header className="spatial-hero__head">
          <div>
            <h3 id="spatial-tracking-heading">Head tracking</h3>
            <p>{on ? 'Keeps the stage in front of your screen as you turn your head.' : 'Turn on the soundstage to use head tracking.'}</p>
          </div>
          <Switch aria-label="Enable head tracking" checked={on && settings.trackingEnabled} disabled={!on} onCheckedChange={(trackingEnabled) => change({ trackingEnabled })} />
        </header>
        {on && settings.trackingEnabled ? (
          <div className="spatial-tracking__body">
            <div className="spatial-tracking__row">
              <ToggleGroup type="single" aria-label="Head tracking source" value={settings.trackingSource}
                onValueChange={(trackingSource) => { if (trackingSource) change({ trackingSource: trackingSource as SpatialSettings['trackingSource'] }); }}>
                <ToggleGroupItem value="headset">Headset sensor</ToggleGroupItem>
                <ToggleGroupItem value="opentrack">OpenTrack</ToggleGroupItem>
              </ToggleGroup>
              <p className="spatial-tracking__status" role="status" data-tracking={trackingState}>
                <span aria-hidden="true" />
                {trackingState === 'tracking' && runtime?.trackerName ? `${runtime.trackerName} · following your head` : trackingLabels[trackingState]}
              </p>
              <Button variant="secondary" size="sm" disabled={trackingState !== 'tracking'} onClick={() => {
                setCentered(false);
                run(() => recenter().then(() => setCentered(!useSystemStore.getState().error)));
              }}>
                <LocateFixed aria-hidden="true" />{centered ? 'Centered' : 'Center stage'}
              </Button>
            </div>
            {settings.trackingSource === 'headset' && runtime?.error ? (
              <div className="spatial-tracking__problem">
                <p>{runtime.error}</p>
                <Button size="sm" variant="secondary" onClick={() => run(connect)}>Connect headset sensor</Button>
              </div>
            ) : null}
            {settings.trackingSource === 'opentrack' ? (
              <div className="spatial-tracking__setup">
                <p>In OpenTrack, set the output to <strong>UDP over network</strong>, address <strong>127.0.0.1</strong>, and this port. Use 1:1 rotation and center while facing your screen.</p>
                <div className="spatial-port">
                  <label htmlFor="spatial-port">Port</label>
                  <input id="spatial-port" type="number" min="1024" max="65535" value={port} onChange={(event) => setPort(event.target.value)} aria-invalid={!validPort} />
                  <Button variant="secondary" size="sm" disabled={!validPort || Number(port) === settings.trackerPort} onClick={() => change({ trackerPort: Number(port) })}>Apply</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <details className="spatial-about">
        <summary>About spatial audio</summary>
        <p>Works with any stereo headphones and affects only your personal mix; clips, streams, and your microphone are unchanged. Turn off other surround effects on your headset. Measured HRTFs by Bill Gardner and Keith Martin, MIT Media Lab.</p>
      </details>
    </div>
  );
}
