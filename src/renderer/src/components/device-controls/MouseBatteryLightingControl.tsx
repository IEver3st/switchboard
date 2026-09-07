import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { defaultMouseBatteryLightingPolicy, type Device, type MouseBatteryLightingPolicy } from '../../../../shared/contracts';
import { useSystemStore } from '@/stores/use-system-store';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';

export function MouseBatteryLightingControl({ device }: { device: Device }) {
  const policies = useSystemStore(state => state.snapshot?.settings.mouseBatteryLighting);
  const updateSettings = useSystemStore(state => state.updateSettings);
  const [pending, setPending] = useState(false);
  const policy = policies?.[device.id] ?? defaultMouseBatteryLightingPolicy;
  const lighting = device.capabilities.lighting;
  if (!lighting?.batteryStatus) return null;
  const disabled = pending || !device.connected;
  const save = async (patch: Partial<MouseBatteryLightingPolicy>) => {
    setPending(true);
    try {
      const current = useSystemStore.getState().snapshot?.settings.mouseBatteryLighting ?? {};
      await updateSettings({ mouseBatteryLighting: { ...current, [device.id]: { ...policy, ...patch } } });
    } finally { setPending(false); }
  };
  const summary = lighting.batteryStatus === 'cutoff' ? 'Lighting off to save battery'
    : lighting.batteryStatus === 'charging' ? 'Paused while charging'
    : lighting.batteryStatus === 'error' ? 'Could not apply'
    : !device.connected || lighting.batteryStatus === 'unavailable' ? 'Waiting for mouse'
    : [policy.flashEnabled ? `Warn at ${policy.warningPercentage}%` : '', policy.cutoffEnabled ? `Off at ${policy.cutoffPercentage}%` : ''].filter(Boolean).join(' · ') || 'Disabled';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="mouse-battery-lighting__trigger" aria-label="Battery lighting settings">
          <span>Battery lighting</span><small>{summary}</small><ChevronRight size={13} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="mouse-battery-lighting__popover" aria-label="Battery lighting">
        <h3>Battery lighting</h3>
        <p>Three red flashes over seven seconds. Normal lighting returns between reminders.</p>
        <div className="mouse-battery-lighting__row">
          <label htmlFor="mouse-battery-flash">Low battery flash</label>
          <Switch id="mouse-battery-flash" checked={policy.flashEnabled} disabled={disabled} onCheckedChange={flashEnabled => void save({ flashEnabled })} />
        </div>
        <div className="mouse-battery-lighting__fields">
          <NumberSetting label="Warn at or below (%)" value={policy.warningPercentage} max={100} disabled={disabled || !policy.flashEnabled} onCommit={warningPercentage => void save({ warningPercentage })} />
          <NumberSetting label="Repeat every (minutes)" value={policy.flashIntervalMinutes} max={60} disabled={disabled || !policy.flashEnabled} onCommit={flashIntervalMinutes => void save({ flashIntervalMinutes })} />
        </div>
        <div className="mouse-battery-lighting__row">
          <label htmlFor="mouse-battery-cutoff">Turn lighting off</label>
          <Switch id="mouse-battery-cutoff" checked={policy.cutoffEnabled} disabled={disabled} onCheckedChange={cutoffEnabled => void save({ cutoffEnabled })} />
        </div>
        <NumberSetting label="Turn off at or below (%)" value={policy.cutoffPercentage} max={100} disabled={disabled || !policy.cutoffEnabled} onCommit={cutoffPercentage => void save({ cutoffPercentage })} />
        <p>The cutoff also stops red flashes. Charging or a higher battery level restores normal lighting. Switchboard must be running.</p>
        <p role="status">{pending ? 'Saving…' : !device.connected ? 'Mouse disconnected.' : lighting.batteryStatusReason ?? summary}</p>
        {lighting.batteryStatus === 'error' ? <p>Switchboard will retry automatically.</p> : null}
      </PopoverContent>
    </Popover>
  );
}

function NumberSetting({ label, value, max, disabled, onCommit }: {
  label: string; value: number; max: number; disabled: boolean; onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value, disabled]);
  const commit = () => {
    const next = Number(draft);
    if (draft.trim() && Number.isInteger(next) && next >= 1 && next <= max) {
      if (next !== value) onCommit(next);
    } else setDraft(String(value));
  };
  return <label className="mouse-battery-lighting__number"><span>{label}</span>
    <Input type="number" min={1} max={max} step={1} aria-label={label} value={draft} disabled={disabled}
      onChange={event => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
  </label>;
}
