import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Download, LocateFixed, RotateCcw, X } from 'lucide-react';
import {
  defaultSpatialSpeakers, spatialAnyEnabled,
  type AudioState, type SetSpatialAudioInput, type SpatialChannelId, type SpatialSettings, type SpatialSpeaker, type SpatialStage,
} from '../../../../shared/contracts';
import { AudioModule } from './AudioModule';
import { ParameterControl } from './processors/ParameterControl';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSystemStore } from '@/stores/use-system-store';

type SpeakerId = SpatialSpeaker['id'];
type StagePatch = NonNullable<SetSpatialAudioInput['stage']>;

const channelNames: Record<SpatialChannelId, string> = { game: 'game', chat: 'chat', media: 'media' };
const speakerNames: Record<SpeakerId, [short: string, long: string]> = {
  'front-left': ['FL', 'Front left'], 'front-right': ['FR', 'Front right'], center: ['C', 'Center'],
  'side-left': ['SL', 'Side left'], 'side-right': ['SR', 'Side right'], 'rear-left': ['RL', 'Rear left'], 'rear-right': ['RR', 'Rear right'],
};
const speakerColors: Record<SpeakerId, string> = {
  'front-left': 'var(--accent-brand)', 'front-right': 'var(--accent-brand)', center: 'var(--channel-game)',
  'side-left': 'var(--channel-chat)', 'side-right': 'var(--channel-chat)', 'rear-left': 'var(--channel-media)', 'rear-right': 'var(--channel-media)',
};
const rooms = [
  { name: 'Focused', hint: 'Close and dry', immersion: 0.1, distance: 0.8 },
  { name: 'Natural', hint: 'A small studio', immersion: 0.4, distance: 1.4 },
  { name: 'Cinema', hint: 'Wide and roomy', immersion: 0.9, distance: 2.2 },
];
const trackingLabels = {
  off: 'Off',
  waiting: 'Waiting for motion data',
  tracking: 'Following your head',
  stale: 'Motion lost · stage held in place',
  error: 'Tracker unavailable',
};

// Map geometry (SVG units). Speaker distance 0.5–2 maps between the inner and outer rings.
const SIZE = 400;
const CENTER = SIZE / 2;
const INNER = 92;
const OUTER = 176;
const HEAD_RADIUS = 40;
const radiusFor = (distance: number) => INNER + ((distance - 0.5) / 1.5) * (OUTER - INNER);
const point = (azimuth: number, radius: number) => {
  const angle = (azimuth * Math.PI) / 180;
  return { x: CENTER + Math.sin(angle) * radius, y: CENTER - Math.cos(angle) * radius };
};

/** Where the engine places a speaker: stereo mode derives the front pair from stage width. */
function effectiveAzimuth(speaker: SpatialSpeaker, stage: SpatialStage): number {
  if (stage.mode !== 'stereo') return speaker.azimuth;
  if (speaker.id === 'front-left') return -stage.widthDegrees / 2;
  if (speaker.id === 'front-right') return stage.widthDegrees / 2;
  return speaker.azimuth;
}

/** Mirrors SpatialSampleProvider.Feed so the map shows what is heard. */
function speakerWeight(speaker: SpatialSpeaker, stage: SpatialStage): number {
  if (!speaker.enabled) return 0;
  const front = speaker.id === 'front-left' || speaker.id === 'front-right';
  const level = stage.mode === 'stereo' ? (front ? 1 : 0)
    : front ? 1
      : speaker.id === 'center' ? 0.2
        : speaker.id.startsWith('side') ? 0.3 + stage.immersion * 0.5
          : 0.2 + stage.immersion * 0.45;
  return level * 10 ** (speaker.gainDb / 20) / Math.sqrt(speaker.distance);
}

function useCameraCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.enumerateDevices) return;
    let live = true;
    const read = () => void devices.enumerateDevices()
      .then((list) => { if (live) setCount(list.filter((device) => device.kind === 'videoinput').length); })
      .catch(() => { if (live) setCount(null); });
    read();
    devices.addEventListener('devicechange', read);
    return () => { live = false; devices.removeEventListener('devicechange', read); };
  }, []);
  return count;
}

/** Shared by every channel: one head, one tracker. */
function HeadTracking({ audio, available, change, run }: {
  audio: AudioState; available: boolean; change(input: SetSpatialAudioInput): void; run(operation: () => Promise<void>): void;
}) {
  const recenter = useSystemStore((state) => state.recenterSpatialAudio);
  const connect = useSystemStore((state) => state.connectHeadsetTracking);
  const setup = useSystemStore((state) => state.openTrackSetup);
  const [centered, setCentered] = useState(false);
  const cameras = useCameraCount();
  const settings = audio.spatial;
  const runtime = audio.host?.spatial;
  const openTrack = audio.openTrack;
  const anyOn = available && spatialAnyEnabled(settings);
  const state = anyOn && settings.trackingEnabled ? runtime?.trackingState ?? 'waiting' : 'off';
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || settings.trackingSource !== 'opentrack' || openTrack.phase !== 'idle' || openTrack.installed) return;
    checked.current = true;
    void setup('check');
  }, [settings.trackingSource, openTrack.phase, openTrack.installed, setup]);

  const status = !settings.trackingEnabled ? 'Off'
    : !anyOn ? 'Starts when a channel stage is on'
      : state === 'tracking' && runtime?.trackerName ? `${runtime.trackerName} · following your head`
        : state === 'error' && runtime?.error ? runtime.error : trackingLabels[state];
  const phone = settings.openTrackInput === 'phone';
  const downloading = openTrack.phase === 'downloading' || openTrack.phase === 'extracting';

  let hint: React.ReactNode = null;
  if (settings.trackingEnabled && settings.trackingSource === 'opentrack') {
    if (!openTrack.installed) {
      hint = downloading ? (
        <div className="spatial-tracking__progress" role="status">
          <span>{openTrack.phase === 'downloading' ? `Downloading OpenTrack · ${openTrack.progress ?? 0}% of 197 MB` : 'Installing OpenTrack…'}</span>
          <progress max={100} value={openTrack.phase === 'downloading' ? openTrack.progress ?? 0 : undefined} aria-label="OpenTrack setup progress" />
          {openTrack.phase === 'downloading' ? <Button size="sm" variant="ghost" onClick={() => void setup('cancel')}><X aria-hidden="true" />Cancel</Button> : null}
        </div>
      ) : (
        <div className="spatial-tracking__hint">
          <span>OpenTrack tracks your head with a webcam or phone. Switchboard installs and runs its own copy (197 MB, verified).</span>
          <Button size="sm" onClick={() => void setup('install')}><Download aria-hidden="true" />Set up</Button>
        </div>
      );
    } else if (!phone && cameras === 0) {
      hint = <p className="spatial-tracking__hint" data-tone="warning">No webcam found. Connect one, or switch the input to Phone.</p>;
    } else if (phone) {
      hint = <p className="spatial-tracking__hint">In an OpenTrack-compatible phone app such as SmoothTrack, send to <strong>{openTrack.lanAddress ?? 'this PC'}</strong> port <strong>4243</strong>.</p>;
    }
    if (openTrack.error) hint = <>{hint}<p className="spatial-tracking__hint" data-tone="danger" role="alert">{openTrack.error}</p></>;
  } else if (settings.trackingEnabled && anyOn && runtime?.trackerAction === 'repair-driver') {
    // Reconnection is automatic; only the driver rebind needs Windows administrator approval.
    hint = (
      <div className="spatial-tracking__hint" data-tone="warning">
        <span>Windows can't start the headset sensor driver. Repairing it asks for administrator approval.</span>
        <Button size="sm" variant="secondary" onClick={() => run(connect)}>Repair sensor</Button>
      </div>
    );
  }

  return (
    <div className="spatial-tracking" role="group" aria-labelledby="spatial-tracking-heading">
      <div className="spatial-tracking__row">
        <Switch aria-label="Enable head tracking" checked={settings.trackingEnabled} disabled={!available} onCheckedChange={(trackingEnabled) => change({ trackingEnabled })} />
        <div className="spatial-tracking__copy">
          <span id="spatial-tracking-heading">Head tracking <em>all channels</em></span>
          <span className="spatial-tracking__status" role="status" data-tracking={state}><span aria-hidden="true" />{status}</span>
        </div>
        {settings.trackingEnabled ? (
          <>
            <ToggleGroup type="single" aria-label="Head tracking source" value={settings.trackingSource} disabled={!available}
              onValueChange={(trackingSource) => { if (trackingSource) change({ trackingSource: trackingSource as SpatialSettings['trackingSource'] }); }}>
              <ToggleGroupItem value="opentrack">OpenTrack</ToggleGroupItem>
              <ToggleGroupItem value="headset">Headset</ToggleGroupItem>
            </ToggleGroup>
            {settings.trackingSource === 'opentrack' && openTrack.installed ? (
              <ToggleGroup type="single" aria-label="OpenTrack input" value={settings.openTrackInput} disabled={!available}
                onValueChange={(openTrackInput) => { if (openTrackInput) change({ openTrackInput: openTrackInput as SpatialSettings['openTrackInput'] }); }}>
                <ToggleGroupItem value="webcam">Webcam</ToggleGroupItem>
                <ToggleGroupItem value="phone">Phone</ToggleGroupItem>
              </ToggleGroup>
            ) : null}
            <Button variant="secondary" size="sm" disabled={state !== 'tracking'} onClick={() => {
              setCentered(false);
              run(() => recenter().then(() => setCentered(!useSystemStore.getState().error)));
            }}>
              <LocateFixed aria-hidden="true" />{centered ? 'Centered' : 'Center'}
            </Button>
          </>
        ) : null}
      </div>
      {hint}
    </div>
  );
}

export function SpatialChannelModule({ audio, channel }: { audio: AudioState; channel: SpatialChannelId }) {
  const update = useSystemStore((state) => state.setSpatialAudio);
  const [pending, setPending] = useState(0);
  const [selected, setSelected] = useState<SpeakerId>('front-left');
  const stage = audio.spatial.channels[channel];
  const [draft, setDraft] = useState(stage.speakers);
  const board = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: SpeakerId; x: number; y: number; moved: boolean; speakers: SpatialSpeaker[] } | null>(null);
  useEffect(() => { if (!dragging.current && pending === 0) setDraft(stage.speakers); }, [stage.speakers, pending]);

  const available = audio.enabled && audio.capabilities.spatialAudio === 'available';
  const on = available && stage.enabled;
  const stereo = stage.mode === 'stereo';

  // Writes are serialized in main; controls stay usable while one is in flight.
  const run = (operation: () => Promise<void>) => {
    setPending((count) => count + 1);
    void operation().finally(() => setPending((count) => count - 1));
  };
  const change = (input: SetSpatialAudioInput) => run(() => update(input));
  const changeStage = (patch: StagePatch) => change({ channel, stage: patch });

  const visible = draft.filter((speaker) => !stereo || speaker.id === 'front-left' || speaker.id === 'front-right');
  const current = visible.find((speaker) => speaker.id === selected) ?? visible[0]!;
  const weights = new Map(visible.map((speaker) => [speaker.id, speakerWeight(speaker, { ...stage, speakers: draft })]));
  const maxWeight = Math.max(0.0001, ...weights.values());
  const editSpeaker = (patch: Partial<SpatialSpeaker>) => changeStage({ speakers: stage.speakers.map((speaker) => speaker.id === current.id ? { ...speaker, ...patch } : speaker) });
  const activeRoom = rooms.find((room) => stage.immersion === room.immersion && stage.distance === room.distance);
  const description = !available
    ? (!audio.enabled ? 'Start the audio engine to use spatial audio.' : 'Unavailable on this output.')
    : `Places ${channelNames[channel]} audio on virtual speakers around your headphones.`;

  const finishDrag = (event: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const drag = dragging.current;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && drag?.moved) changeStage({ speakers: drag.speakers });
    else setDraft(stage.speakers);
  };

  return (
    <AudioModule
      id={`${channel}-spatial-section`}
      className="audio-panel--spatial"
      headingId={`${channel}-spatial-heading`}
      title="Spatial audio"
      description={description}
      checked={stage.enabled}
      disabled={!available}
      pending={pending > 0}
      switchLabel={`${stage.enabled ? 'Turn off' : 'Turn on'} spatial audio for ${channelNames[channel]}`}
      onCheckedChange={(enabled) => changeStage({ enabled })}
    >
      <div className="spatial-channel" data-on={on || undefined}>
        <figure className="spatial-map">
          <div className="spatial-map__board" ref={board} role="group" aria-label="Virtual speaker positions, top view. You face up.">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
              <defs>
                {visible.map((speaker) => {
                  const from = point(effectiveAzimuth(speaker, stage), radiusFor(speaker.distance));
                  const to = point(effectiveAzimuth(speaker, stage), HEAD_RADIUS);
                  return (
                    <linearGradient key={speaker.id} id={`spatial-beam-${channel}-${speaker.id}`} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
                      <stop offset="0%" stopColor={speakerColors[speaker.id]} stopOpacity="0.6" />
                      <stop offset="100%" stopColor={speakerColors[speaker.id]} stopOpacity="0" />
                    </linearGradient>
                  );
                })}
              </defs>
              <circle cx={CENTER} cy={CENTER} r={OUTER + 12} className="spatial-map__floor" />
              {[INNER, (INNER + OUTER) / 2, OUTER].map((radius) => <circle key={radius} cx={CENTER} cy={CENTER} r={radius} className="spatial-map__ring" />)}
              <line x1={CENTER} y1={CENTER - OUTER} x2={CENTER} y2={CENTER + OUTER} className="spatial-map__axis" />
              <line x1={CENTER - OUTER} y1={CENTER} x2={CENTER + OUTER} y2={CENTER} className="spatial-map__axis" />
              {visible.map((speaker) => {
                const weight = (weights.get(speaker.id) ?? 0) / maxWeight;
                if (!on || weight <= 0) return null;
                const azimuth = effectiveAzimuth(speaker, stage);
                const source = point(azimuth, radiusFor(speaker.distance));
                const arrival = point(azimuth, HEAD_RADIUS);
                const halfWidth = 3 + weight * 8;
                const side = (angle: number, from: { x: number; y: number }, width: number) => {
                  const offset = point(angle, width);
                  return `${from.x + offset.x - CENTER} ${from.y + offset.y - CENTER}`;
                };
                return (
                  <path key={speaker.id}
                    d={`M ${side(azimuth - 90, source, 3)} L ${side(azimuth + 90, source, 3)} L ${side(azimuth + 90, arrival, halfWidth)} L ${side(azimuth - 90, arrival, halfWidth)} Z`}
                    fill={`url(#spatial-beam-${channel}-${speaker.id})`} opacity={0.25 + weight ** 1.4 * 0.6} />
                );
              })}
              <g>
                <path d={`M ${CENTER - 7} ${CENTER - 24} L ${CENTER} ${CENTER - 35} L ${CENTER + 7} ${CENTER - 24} Z`} className="spatial-map__nose" />
                <ellipse cx={CENTER} cy={CENTER} rx="21" ry="25" className="spatial-map__skull" />
                <rect x={CENTER - 30} y={CENTER - 11} width="9" height="22" rx="4" className="spatial-map__cup" />
                <rect x={CENTER + 21} y={CENTER - 11} width="9" height="22" rx="4" className="spatial-map__cup" />
              </g>
            </svg>
            {visible.map((speaker) => {
              const azimuth = effectiveAzimuth(speaker, stage);
              const position = point(azimuth, radiusFor(speaker.distance));
              const weight = (weights.get(speaker.id) ?? 0) / maxWeight;
              const movable = available && !stereo;
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
                  title={`${speakerNames[speaker.id][1]} · ${Math.round(azimuth)}° · ${(speaker.distance * stage.distance).toFixed(1)} m`}
                  disabled={!available}
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
                    drag.speakers = stage.speakers.map((item) => item.id === speaker.id ? { ...item, azimuth: nextAzimuth, distance: nextDistance } : item);
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
                    changeStage({ speakers: stage.speakers.map((item) => item.id === speaker.id ? {
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
        </figure>

        <div className="spatial-channel__controls">
          <div className="spatial-row">
            <span className="spatial-row__label" id={`${channel}-spatial-room`}>Room</span>
            <ToggleGroup type="single" value={activeRoom?.name ?? ''} aria-labelledby={`${channel}-spatial-room`} disabled={!available}
              onValueChange={(name) => {
                const room = rooms.find((candidate) => candidate.name === name);
                if (room) changeStage({ immersion: room.immersion, distance: room.distance, amount: 1 });
              }}>
              {rooms.map((room) => <ToggleGroupItem key={room.name} value={room.name} title={room.hint}>{room.name}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="spatial-row">
            <span className="spatial-row__label" id={`${channel}-spatial-layout`}>Speakers</span>
            <ToggleGroup type="single" value={stage.mode} aria-labelledby={`${channel}-spatial-layout`} disabled={!available}
              onValueChange={(mode) => { if (mode) changeStage({ mode: mode as SpatialStage['mode'] }); }}>
              <ToggleGroupItem value="surround">7 virtual</ToggleGroupItem>
              <ToggleGroupItem value="stereo">Stereo pair</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {stereo ? (
            <ParameterControl label="Width" value={stage.widthDegrees} min={20} max={180} step={5} unit="°" disabled={!available} onCommit={(widthDegrees) => changeStage({ widthDegrees })} />
          ) : (
            <ParameterControl label="Immersion" value={stage.immersion * 100} min={0} max={100} step={5} unit="%" disabled={!available} onCommit={(immersion) => changeStage({ immersion: immersion / 100 })} />
          )}
          <ParameterControl label="Distance" value={stage.distance} min={0.5} max={3} step={0.1} unit=" m" precision={1} disabled={!available} onCommit={(distance) => changeStage({ distance })} />
          <div className="spatial-channel__speaker" style={{ '--speaker-color': speakerColors[current.id] } as CSSProperties}>
            <span className="spatial-channel__chip" aria-hidden="true">{speakerNames[current.id][0]}</span>
            <span className="spatial-channel__speaker-name">{speakerNames[current.id][1]}</span>
            <Button size="sm" variant="ghost" className="spatial-channel__reset" disabled={!available} onClick={() => changeStage({ speakers: defaultSpatialSpeakers() })}>
              <RotateCcw aria-hidden="true" />Reset
            </Button>
            {stereo ? null : <Switch checked={current.enabled} aria-label={`${speakerNames[current.id][1]} speaker on`} disabled={!available} onCheckedChange={(enabled) => editSpeaker({ enabled })} />}
          </div>
          <ParameterControl label="Height" value={current.elevation} min={-40} max={90} step={5} unit="°" disabled={!available || !current.enabled} onCommit={(elevation) => editSpeaker({ elevation })} />
          <ParameterControl label="Level" value={current.gainDb} min={-24} max={6} step={0.5} unit=" dB" precision={1} disabled={!available || !current.enabled} onCommit={(gainDb) => editSpeaker({ gainDb })} />
          <HeadTracking audio={audio} available={available} change={change} run={run} />
        </div>
      </div>
    </AudioModule>
  );
}
