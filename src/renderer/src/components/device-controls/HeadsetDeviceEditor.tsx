import { AlertCircle, BatteryCharging, Check, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Device, SonyBackgroundRoom, SonyListeningMode, SonyNoiseControlMode } from '../../../../shared/contracts';
import { DeviceRender } from '@/components/shared/device-render';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useSystemStore } from '@/stores/use-system-store';

const colorways = [
  { variant: 'black', label: 'Black', color: '#18191a' },
  { variant: 'platinum-silver', label: 'Platinum Silver', color: '#d8d4c9' },
  { variant: 'midnight-blue', label: 'Midnight Blue', color: '#243246' },
  { variant: 'olive-gray', label: 'Olive Gray', color: '#77796f' },
] as const;

export function HeadsetDeviceEditor({ device }: { device: Device }) {
  const headset = device.capabilities.headset;
  const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
  const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
  const setAppearance = useSystemStore((state) => state.setDeviceAppearanceOverride);
  const [gains, setGains] = useState(() => headset?.equalizer?.bands.map((band) => band.gainDb) ?? []);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => setGains(headset?.equalizer?.bands.map((band) => band.gainDb) ?? []), [headset?.equalizer?.bands]);
  if (!headset) return null;
  const controlsDisabled = !device.connected || headset.transportState !== 'connected';

  const run = async (key: string, action: () => Promise<void>) => {
    setInlineError(null);
    setPending(key);
    await action();
    const error = useSystemStore.getState().error;
    if (error) setInlineError(error);
    setPending(null);
  };
  const send = (key: string, change: Parameters<typeof setDeviceControl>[0]['change']) => run(key, () => setDeviceControl({ deviceId: device.id, change }));

  return (
    <div className="headset-console" data-transport={headset.transportState}>
      <aside className="headset-product" aria-label="Headphone status and appearance">
        <div className="headset-product__render"><DeviceRender device={device} density="hero" /></div>
        <div className="headset-product__status">
          <div>
            <span className="headset-product__eyebrow">Battery</span>
            <strong>{device.capabilities.battery ? `${Math.round(device.capabilities.battery.percentage)}%` : '—'}</strong>
          </div>
          {device.capabilities.battery?.charging ? <BatteryCharging aria-label="Charging" /> : null}
          <span className="headset-product__connection" data-connected={device.connected}>
            <i aria-hidden />{device.connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="headset-colorway">
          <span>Finish</span>
          <div role="radiogroup" aria-label="Physical headphone color">
            {colorways.map((option) => (
              <button
                key={option.variant}
                type="button"
                role="radio"
                aria-checked={device.identity.variant === option.variant}
                aria-label={option.label}
                title={option.label}
                style={{ '--swatch-color': option.color } as React.CSSProperties}
                onClick={() => void setAppearance({ deviceId: device.id, override: { variant: option.variant, colorway: option.label } })}
              >
                <span aria-hidden />{device.identity.variant === option.variant ? <Check aria-hidden /> : null}
              </button>
            ))}
          </div>
          {device.variantResolution.confidence === 'fallback' ? <p>Choose the finish that matches your headphones.</p> : <p>{device.identity.colorway}</p>}
        </div>
      </aside>

      <main className="headset-controls">
        {headset.transportState !== 'connected' ? (
          <div className="headset-connection-message" role="status">
            <AlertCircle aria-hidden />
            <span><strong>{transportTitle(headset.transportState)}</strong>{headset.transportMessage ?? 'Reconnect the headphones in Windows to restore controls.'}</span>
          </div>
        ) : null}
        {inlineError ? <div className="headset-inline-error" role="alert">{inlineError}</div> : null}

        {headset.noiseControl ? (
          <section className="headset-section headset-noise" aria-labelledby="noise-control-heading">
            <header><div><h3 id="noise-control-heading">Noise control</h3><p>Changes from the headphones and other connected devices stay in sync.</p></div></header>
            <ToggleGroup
              type="single"
              value={headset.noiseControl.mode ?? ''}
              disabled={controlsDisabled || !headset.noiseControl.writable || pending !== null}
              onValueChange={(mode) => { if (mode) void send('noise', { type: 'headset-noise-control', mode: mode as SonyNoiseControlMode }); }}
              aria-label="Noise control mode"
              className="headset-noise__modes"
            >
              <ToggleGroupItem value="noise-cancelling">Noise Cancelling</ToggleGroupItem>
              <ToggleGroupItem value="ambient">Ambient Sound</ToggleGroupItem>
              <ToggleGroupItem value="off">Off</ToggleGroupItem>
            </ToggleGroup>
            {headset.noiseControl.mode === 'ambient' ? (
              <div className="headset-ambient">
                <label htmlFor="ambient-level"><span>Ambient level</span><output>{headset.noiseControl.ambientLevel ?? '—'}</output></label>
                <Slider
                  id="ambient-level"
                  min={1} max={20} step={1}
                  value={[headset.noiseControl.ambientLevel ?? 10]}
                  disabled={controlsDisabled || pending !== null}
                  aria-label="Ambient sound level"
                  aria-valuetext={`${headset.noiseControl.ambientLevel ?? 10} of 20`}
                  onValueCommit={([level]) => { if (level) void send('ambient', { type: 'headset-ambient-level', level }); }}
                />
                <SettingRow label="Focus on Voice" detail="Prioritize speech while Ambient Sound is active.">
                  <Switch
                    checked={headset.noiseControl.focusOnVoice ?? false}
                    disabled={controlsDisabled || pending !== null}
                    onCheckedChange={(enabled) => void send('voice', { type: 'headset-focus-on-voice', enabled })}
                    aria-label="Focus on Voice"
                  />
                </SettingRow>
              </div>
            ) : null}
          </section>
        ) : null}

        {headset.equalizer ? (
          <section className="headset-section headset-eq" aria-labelledby="equalizer-heading">
            <header>
              <div><h3 id="equalizer-heading">Equalizer</h3><p>Ten bands stored on the headphones.</p></div>
              <Select value={headset.equalizer.activePresetId ?? undefined} disabled={controlsDisabled || pending !== null} onValueChange={(presetId) => void send('eq-preset', { type: 'headset-equalizer-preset', presetId })}>
                <SelectTrigger aria-label="Equalizer preset"><SelectValue placeholder="Choose preset" /></SelectTrigger>
                <SelectContent>{headset.equalizer.presets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>)}</SelectContent>
              </Select>
            </header>
            <div className="headset-eq__graph" aria-label="Ten-band equalizer">
              <div className="headset-eq__zero" aria-hidden />
              {headset.equalizer.bands.map((band, index) => (
                <label key={band.frequencyHz}>
                  <output>{gains[index] ?? band.gainDb}</output>
                  <Slider
                    orientation="vertical" min={-6} max={6} step={1} value={[gains[index] ?? band.gainDb]}
                    disabled={controlsDisabled || pending !== null}
                    aria-label={`${formatFrequency(band.frequencyHz)} equalizer band`}
                    aria-valuetext={`${gains[index] ?? band.gainDb} decibels`}
                    onValueChange={([value]) => setGains((current) => current.map((gain, bandIndex) => bandIndex === index ? (value ?? gain) : gain))}
                    onValueCommit={() => void send('eq-bands', { type: 'headset-equalizer-bands', gainsDb: gains })}
                  />
                  <span>{formatFrequency(band.frequencyHz)}</span>
                </label>
              ))}
            </div>
            <div className="headset-eq__actions">
              <span>Custom adjustments select the headphone’s Custom slot.</span>
              <Button variant="ghost" size="sm" disabled={controlsDisabled || pending !== null} onClick={() => { const flat = gains.map(() => 0); setGains(flat); void send('eq-bands', { type: 'headset-equalizer-bands', gainsDb: flat }); }}><RotateCcw aria-hidden />Reset</Button>
              <Button variant="secondary" size="sm" onClick={() => void setDeviceSetting({ deviceId: device.id, key: 'sonyPresetBands1', value: gains })}><Save aria-hidden />Save locally</Button>
            </div>
          </section>
        ) : null}

        <section className="headset-section headset-sound" aria-labelledby="sound-heading">
          <header><div><h3 id="sound-heading">Sound</h3><p>Processing performed by the headphones.</p></div></header>
          {headset.dseeExtreme ? <SettingRow label="DSEE Extreme" detail="Restore detail in compressed audio."><Switch checked={headset.dseeExtreme.enabled ?? false} disabled={controlsDisabled || pending !== null} onCheckedChange={(enabled) => void send('dsee', { type: 'headset-dsee-extreme', enabled })} aria-label="DSEE Extreme" /></SettingRow> : null}
          {headset.speakToChat ? <SettingRow label="Speak-to-Chat" detail="Pause playback and let in ambient sound when you speak."><Switch checked={headset.speakToChat.enabled ?? false} disabled={controlsDisabled || pending !== null} onCheckedChange={(enabled) => void send('speak', { type: 'headset-speak-to-chat', enabled })} aria-label="Speak-to-Chat" /></SettingRow> : null}
          {headset.listeningMode ? (
            <SettingRow label="Listening mode" detail="Choose standard playback, Background Music, or Cinema.">
              <div className="headset-listening-selects">
                <Select value={headset.listeningMode.mode ?? 'standard'} disabled={controlsDisabled || pending !== null} onValueChange={(mode) => void send('listening', { type: 'headset-listening-mode', mode: mode as SonyListeningMode, backgroundRoom: headset.listeningMode?.backgroundRoom ?? undefined })}>
                  <SelectTrigger aria-label="Listening mode"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="background-music">Background Music</SelectItem><SelectItem value="cinema">Cinema</SelectItem></SelectContent>
                </Select>
                {headset.listeningMode.mode === 'background-music' ? (
                  <Select value={headset.listeningMode.backgroundRoom ?? 'my-room'} disabled={controlsDisabled || pending !== null} onValueChange={(backgroundRoom) => void send('room', { type: 'headset-listening-mode', mode: 'background-music', backgroundRoom: backgroundRoom as SonyBackgroundRoom })}>
                    <SelectTrigger aria-label="Background Music room"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="my-room">My Room</SelectItem><SelectItem value="living-room">Living Room</SelectItem><SelectItem value="cafe">Cafe</SelectItem></SelectContent>
                  </Select>
                ) : null}
              </div>
            </SettingRow>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function SettingRow({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return <div className="headset-setting-row"><span><strong>{label}</strong><small>{detail}</small></span>{children}</div>;
}
function formatFrequency(hz: number): string { return hz >= 1_000 ? `${hz / 1_000}k` : String(hz); }
function transportTitle(state: string): string { return state === 'busy' ? 'Control connection in use' : state === 'connecting' ? 'Connecting' : state === 'error' ? 'Couldn’t connect' : 'Headphones unavailable'; }
