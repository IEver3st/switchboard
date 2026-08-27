import { AlertTriangle, BatteryCharging, Check, LoaderCircle, MoreHorizontal, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Device, HeadsetControlAvailability, SonyBackgroundRoom, SonyListeningMode, SonyNoiseControlMode } from '../../../../shared/contracts';
import { DeviceRender } from '@/components/shared/device-render';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSystemStore } from '@/stores/use-system-store';

const colorways = [
  { variant: 'black', label: 'Black', color: '#18191a' },
  { variant: 'platinum-silver', label: 'Platinum Silver', color: '#d8d4c9' },
  { variant: 'midnight-blue', label: 'Midnight Blue', color: '#243246' },
  { variant: 'sand-pink', label: 'Sand Pink', color: '#d8c2c2' },
  { variant: 'sandstone', label: 'Sandstone', color: '#aaa092' },
  { variant: 'olive-gray', label: 'Olive Gray', color: '#77796f' },
] as const;

const listeningModes: Array<{ id: SonyListeningMode; label: string; description: string }> = [
  { id: 'standard', label: 'Standard', description: 'Original stereo presentation' },
  { id: 'background-music', label: 'Background Music', description: 'Moves the sound image farther away' },
  { id: 'cinema', label: 'Cinema', description: 'Wider presentation for films and video' },
];

export function HeadsetDeviceEditor({ device }: { device: Device }) {
  const headset = device.capabilities.headset;
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
  const setAppearance = useSystemStore((state) => state.setDeviceAppearanceOverride);
  const [gains, setGains] = useState(() => headset?.equalizer?.bands.map((band) => band.gainDb) ?? []);
  const [ambientLevel, setAmbientLevel] = useState(headset?.noiseControl?.ambientLevel ?? 10);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => setGains(headset?.equalizer?.bands.map((band) => band.gainDb) ?? []), [headset?.equalizer?.bands]);
  useEffect(() => setAmbientLevel(headset?.noiseControl?.ambientLevel ?? 10), [headset?.noiseControl?.ambientLevel]);
  const confirmedGains = headset?.equalizer?.bands.map((band) => band.gainDb) ?? [];
  const equalizerModified = useMemo(() => gains.length === confirmedGains.length && gains.some((gain, index) => gain !== confirmedGains[index]), [confirmedGains, gains]);
  if (!headset) return null;

  const controlsConnected = device.connected && headset.transportState === 'connected';
  const battery = device.capabilities.battery;
  const batteryPercentage = battery ? Math.round(battery.percentage) : null;
  const activeNoiseLabel = headset.noiseControl?.mode ? noiseModeLabel(headset.noiseControl.mode) : null;

  const run = async (key: string, action: () => Promise<void>) => {
    setInlineError(null);
    setPending(key);
    await action();
    const error = useSystemStore.getState().error;
    if (error) setInlineError(error);
    setPending(null);
  };
  const send = (key: string, change: Parameters<typeof setDeviceControl>[0]['change']) => run(key, () => setDeviceControl({ deviceId: device.id, change }));
  const commitEqualizer = (next: number[]) => {
    setGains(next);
    void send('eq-bands', { type: 'headset-equalizer-bands', gainsDb: next });
  };
  const loadLocalPreset = (slot: string) => {
    const stored = device.settings[`sonyPresetBands${slot}`];
    if (Array.isArray(stored) && stored.length === 10 && stored.every((value) => typeof value === 'number')) commitEqualizer(stored as number[]);
  };

  return (
    <div className="headset-console" data-transport={headset.transportState}>
      <aside className="headset-product" aria-label="Headphone status and display appearance">
        <div className="headset-product__render"><DeviceRender device={device} density="hero" /></div>
        <section className="headset-device-summary" aria-label="Device summary">
          <div className="headset-battery-summary">
            <div><span>Battery</span><strong>{batteryPercentage === null ? 'Not reported' : `${batteryPercentage}%`}</strong>{battery?.charging ? <BatteryCharging aria-label="Charging" /> : null}</div>
            <progress max={100} value={batteryPercentage ?? 0} aria-label={batteryPercentage === null ? 'Battery level unavailable' : `Battery ${batteryPercentage}%`} />
          </div>
          <dl className="headset-live-summary">
            <div><dt>Audio</dt><dd data-good={device.connected}>{device.connected ? 'Connected' : 'Disconnected'}</dd></div>
            <div><dt>Controls</dt><dd data-good={headset.transportState === 'connected'}>{compactTransportLabel(headset.transportState)}</dd></div>
            {headset.codec ? <div><dt>Codec</dt><dd>{headset.codec}</dd></div> : null}
            {activeNoiseLabel ? <div><dt>Noise</dt><dd>{activeNoiseLabel}</dd></div> : null}
          </dl>
        </section>
        <div className="headset-colorway">
          <span>Display finish</span>
          <div role="radiogroup" aria-label="Headphone render finish">
            {colorways.map((option) => (
              <button key={option.variant} type="button" role="radio" aria-checked={device.identity.variant === option.variant} aria-label={option.label} title={`${option.label} render`} style={{ '--swatch-color': option.color } as React.CSSProperties} onClick={() => void setAppearance({ deviceId: device.id, override: { variant: option.variant, colorway: option.label } })}>
                <span aria-hidden />{device.identity.variant === option.variant ? <Check aria-hidden /> : null}
              </button>
            ))}
          </div>
          <p>{device.variantResolution.confidence === 'fallback' ? 'Changes the product image only.' : `${device.identity.colorway ?? 'Selected'} · product image only`}</p>
        </div>
      </aside>

      <main className="headset-controls">
        <ConnectionStatus audioConnected={device.connected} state={headset.transportState} message={headset.transportMessage} pending={pending === 'reconnect'} onRetry={() => void send('reconnect', { type: 'headset-reconnect' })} />
        {inlineError ? <div className="headset-inline-error" role="alert">{inlineError}</div> : null}

        {headset.noiseControl ? (
          <section className="headset-section headset-noise" aria-labelledby="noise-control-heading" data-pending={pending?.startsWith('noise') || pending === 'ambient' || pending === 'voice'}>
            <SectionHeader id="noise-control-heading" title="Noise control" detail="Hardware state stays synchronized across connected controllers." availability={headset.noiseControl.availability} />
            <ToggleGroup type="single" value={headset.noiseControl.mode ?? ''} disabled={!controlsConnected || !controlAvailable(headset.noiseControl.availability, headset.noiseControl.writable) || pending !== null} onValueChange={(mode) => { if (mode) void send('noise-mode', { type: 'headset-noise-control', mode: mode as SonyNoiseControlMode }); }} aria-label="Noise control mode" className="headset-noise__modes">
              {headset.noiseControl.supportedModes.map((mode) => <ToggleGroupItem key={mode} value={mode}>{noiseModeLabel(mode)}</ToggleGroupItem>)}
            </ToggleGroup>
            {headset.noiseControl.mode === 'ambient' ? (
              <div className="headset-ambient">
                <label htmlFor="ambient-level"><span>Ambient level</span><output>{ambientLevel}<small> / 20</small></output></label>
                <Slider id="ambient-level" min={1} max={20} step={1} value={[ambientLevel]} disabled={!controlsConnected || !controlAvailable(headset.noiseControl.availability, headset.noiseControl.writable) || pending !== null} aria-label="Ambient sound level" aria-valuetext={`${ambientLevel} of 20`} onValueChange={([level]) => { if (level !== undefined) setAmbientLevel(level); }} onValueCommit={([level]) => { if (level !== undefined) void send('ambient', { type: 'headset-ambient-level', level }); }} />
                <SettingRow label="Focus on Voice" detail="Prioritizes speech while Ambient Sound is active."><Switch checked={headset.noiseControl.focusOnVoice ?? false} disabled={!controlsConnected || pending !== null} onCheckedChange={(enabled) => void send('voice', { type: 'headset-focus-on-voice', enabled })} aria-label="Focus on Voice" /></SettingRow>
              </div>
            ) : null}
          </section>
        ) : null}

        {headset.equalizer ? (
          <section className="headset-section headset-eq" aria-labelledby="equalizer-heading" data-pending={pending?.startsWith('eq')}>
            <header>
              <div><div className="headset-section__title-line"><h3 id="equalizer-heading">Equalizer</h3>{pending?.startsWith('eq') ? <span>Confirming…</span> : equalizerModified ? <span>Modified</span> : null}</div><p>{headset.equalizer.bandsWritable ? 'Ten bands stored on the headphones.' : 'Preset selection is available; custom band writes were not reported.'}</p></div>
              <div className="headset-eq__toolbar">
                <Select value={headset.equalizer.activePresetId ?? undefined} disabled={!controlsConnected || !controlAvailable(headset.equalizer.availability, headset.equalizer.writable) || pending !== null} onValueChange={(presetId) => void send('eq-preset', { type: 'headset-equalizer-preset', presetId })}><SelectTrigger aria-label="Headphone equalizer preset"><SelectValue placeholder="Preset" /></SelectTrigger><SelectContent>{headset.equalizer.presets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>)}</SelectContent></Select>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Equalizer preset actions" title="Equalizer preset actions"><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52">
                  {['1', '2', '3'].map((slot) => <DropdownMenuItem key={`save-${slot}`} onSelect={() => void setDeviceSetting({ deviceId: device.id, key: `sonyPresetBands${slot}`, value: gains })}>Save to {String(device.settings[`sonyPresetName${slot}`] ?? `Local ${slot}`)}</DropdownMenuItem>)}
                  <DropdownMenuSeparator />
                  {['1', '2', '3'].map((slot) => <DropdownMenuItem key={`load-${slot}`} disabled={!controlsConnected || pending !== null || !headset.equalizer?.bandsWritable} onSelect={() => loadLocalPreset(slot)}>Load {String(device.settings[`sonyPresetName${slot}`] ?? `Local ${slot}`)}</DropdownMenuItem>)}
                  <DropdownMenuSeparator /><DropdownMenuItem disabled={!controlsConnected || pending !== null || !headset.equalizer?.bandsWritable} onSelect={() => commitEqualizer(gains.map(() => 0))}><RotateCcw aria-hidden />Reset EQ</DropdownMenuItem>
                </DropdownMenuContent></DropdownMenu>
              </div>
            </header>
            <div className="headset-eq__graph" aria-label="Ten-band equalizer">
              <span className="headset-eq__range headset-eq__range--high" aria-hidden>+6</span><span className="headset-eq__range headset-eq__range--low" aria-hidden>−6</span><div className="headset-eq__zero" aria-hidden />
              {headset.equalizer.bands.map((band, index) => {
                const gain = gains[index] ?? band.gainDb;
                return <label key={band.frequencyHz} onDoubleClick={() => { if (controlsConnected && headset.equalizer?.bandsWritable && pending === null) commitEqualizer(gains.map((value, bandIndex) => bandIndex === index ? 0 : value)); }} title="Double-click to reset this band"><output>{formatGain(gain)}</output><Slider orientation="vertical" min={-6} max={6} step={1} value={[gain]} disabled={!controlsConnected || !headset.equalizer?.bandsWritable || !controlAvailable(headset.equalizer.availability, headset.equalizer.writable) || pending !== null} aria-label={`${formatFrequency(band.frequencyHz)} equalizer band`} aria-valuetext={`${gain} decibels`} onValueChange={([value]) => { if (value !== undefined) setGains((current) => current.map((currentGain, bandIndex) => bandIndex === index ? value : currentGain)); }} onValueCommit={([value]) => { if (value !== undefined) commitEqualizer(gains.map((currentGain, bandIndex) => bandIndex === index ? value : currentGain)); }} /><span>{formatFrequency(band.frequencyHz)}</span></label>;
              })}
            </div>
            <p className="headset-eq__storage">Headphone presets are device-resident. Local presets remain in Switchboard until loaded.</p>
          </section>
        ) : null}

        {(headset.dseeExtreme || headset.speakToChat || headset.listeningMode) ? (
          <section className="headset-section headset-sound" aria-labelledby="sound-heading">
            <SectionHeader id="sound-heading" title="Sound" detail="Processing performed by the headphones." />
            {headset.dseeExtreme ? <SettingRow label="DSEE Extreme" detail="Restores high-frequency detail in compressed audio." availability={headset.dseeExtreme.availability}><Switch checked={headset.dseeExtreme.enabled ?? false} disabled={!controlsConnected || !controlAvailable(headset.dseeExtreme.availability, headset.dseeExtreme.writable) || pending !== null} onCheckedChange={(enabled) => void send('dsee', { type: 'headset-dsee-extreme', enabled })} aria-label="DSEE Extreme" /></SettingRow> : null}
            {headset.speakToChat ? <SettingRow label="Speak-to-Chat" detail="Pauses playback and lets in ambient sound when you speak." availability={headset.speakToChat.availability}><Switch checked={headset.speakToChat.enabled ?? false} disabled={!controlsConnected || !controlAvailable(headset.speakToChat.availability, headset.speakToChat.writable) || pending !== null} onCheckedChange={(enabled) => void send('speak', { type: 'headset-speak-to-chat', enabled })} aria-label="Speak-to-Chat" /></SettingRow> : null}
            {headset.listeningMode ? (
              <div className="headset-listening" data-availability={headset.listeningMode.availability}>
                <div className="headset-listening__heading"><div><strong>Listening mode</strong><small>Changes the headphones’ spatial presentation.</small></div>{pending === 'listening' || pending === 'room' ? <span>Confirming…</span> : null}</div>
                <div className="headset-listening__modes" role="radiogroup" aria-label="Listening mode">
                  {listeningModes.filter((mode) => headset.listeningMode?.supportedModes.includes(mode.id)).map((mode) => <button key={mode.id} type="button" role="radio" aria-checked={headset.listeningMode?.mode === mode.id} disabled={!controlsConnected || !controlAvailable(headset.listeningMode!.availability, headset.listeningMode!.writable) || pending !== null} onClick={() => void send('listening', { type: 'headset-listening-mode', mode: mode.id, backgroundRoom: headset.listeningMode?.backgroundRoom ?? undefined })}><strong>{mode.label}</strong><span>{mode.description}</span></button>)}
                </div>
                {headset.listeningMode.mode === 'background-music' ? <div className="headset-listening__room"><span>Perceived room</span><Select value={headset.listeningMode.backgroundRoom ?? 'my-room'} disabled={!controlsConnected || pending !== null} onValueChange={(backgroundRoom) => void send('room', { type: 'headset-listening-mode', mode: 'background-music', backgroundRoom: backgroundRoom as SonyBackgroundRoom })}><SelectTrigger aria-label="Background Music room"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="my-room">My Room</SelectItem><SelectItem value="living-room">Living Room</SelectItem><SelectItem value="cafe">Cafe</SelectItem></SelectContent></Select></div> : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function ConnectionStatus({ audioConnected, state, message, pending, onRetry }: { audioConnected: boolean; state: string; message?: string; pending: boolean; onRetry: () => void }) {
  if (state === 'connected') return <div className="headset-connection-status" data-state="connected" role="status"><i aria-hidden /><span><strong>Controls connected</strong><small>Changes are read back from the headphones.</small></span></div>;
  const connecting = state === 'connecting' || pending;
  return <div className="headset-connection-status" data-state={state} role="status">{connecting ? <LoaderCircle className="headset-spin" aria-hidden /> : <AlertTriangle aria-hidden />}<span><strong>{connecting ? 'Connecting controls…' : audioConnected ? 'Audio connected · Controls unavailable' : 'Headphones unavailable'}</strong><small>{message ?? 'Connect the headphones in Windows to restore controls.'}</small></span>{!connecting ? <Button variant="ghost" size="sm" onClick={onRetry}><RefreshCw aria-hidden />Retry</Button> : null}</div>;
}

function SectionHeader({ id, title, detail, availability }: { id: string; title: string; detail: string; availability?: HeadsetControlAvailability }) { return <header><div><div className="headset-section__title-line"><h3 id={id}>{title}</h3>{availability && availability !== 'available' ? <span>{availabilityLabel(availability)}</span> : null}</div><p>{detail}</p></div></header>; }
function SettingRow({ label, detail, availability, children }: { label: string; detail: string; availability?: HeadsetControlAvailability; children: React.ReactNode }) { return <div className="headset-setting-row"><span><strong>{label}</strong><small>{detail}</small></span>{availability && availability !== 'available' ? <em>{availabilityLabel(availability)}</em> : children}</div>; }
function controlAvailable(availability: HeadsetControlAvailability, writable: boolean): boolean { return availability === 'available' && writable; }
function availabilityLabel(availability: HeadsetControlAvailability): string { return availability === 'read-only' ? 'Read only' : 'Unavailable'; }
function formatFrequency(hz: number): string { return hz >= 1_000 ? `${hz / 1_000}k` : String(hz); }
function formatGain(gain: number): string { return gain > 0 ? `+${gain}` : String(gain); }
function noiseModeLabel(mode: SonyNoiseControlMode): string { return mode === 'noise-cancelling' ? 'Noise Cancelling' : mode === 'ambient' ? 'Ambient Sound' : 'Off'; }
function compactTransportLabel(state: string): string { return state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting' : state === 'busy' ? 'In use' : 'Unavailable'; }
