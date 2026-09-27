import { useState } from 'react';
import type { AudioState, SetAudioRoutingInput } from '../../../../shared/contracts';
import { useSystemStore } from '@/stores/use-system-store';
import { SettingSection, SettingSelect, SettingSwitch, SettingValue } from './settings-primitives';

export function ApplicationRoutingSettings({ audio }: { audio: AudioState }) {
  const setRouting = useSystemStore(state => state.setAudioRouting);
  const [pending, setPending] = useState(false);
  const supported = !audio.enabled || audio.capabilities.routingBackend === 'vb-cable';
  const rows = new Map<string, { path: string; name: string; category?: string; error?: string }>();
  for (const app of audio.applications) {
    if (!app.executablePath) continue;
    rows.set(app.executablePath.toLowerCase(), { path: app.executablePath, name: app.executableName,
      category: app.currentDestination ?? app.preferredDestination ?? undefined, error: app.routingError });
  }
  for (const route of audio.applicationRoutes ?? []) {
    const key = route.executablePath.toLowerCase();
    if (!rows.has(key)) rows.set(key, { path: route.executablePath, name: route.executablePath.split('\\').pop()!.replace(/\.exe$/i, '') });
  }
  const update = async (input: SetAudioRoutingInput) => {
    setPending(true);
    try { await setRouting(input); } finally { setPending(false); }
  };
  return (
    <SettingSection title="Application routing">
      <SettingSwitch settingId="audio.applicationRouting" title="Automatic app routing"
        description={supported
          ? 'Chat apps go to Chat, browsers and players to Media, and other apps to Game. New audio is detected within five seconds. Saved categories take priority.'
          : 'Automatic categories require the VB-CABLE mixing backend.'}
        checked={audio.automaticApplicationRouting} disabled={pending || !supported}
        onCheckedChange={automatic => void update({ automatic })} />
      {rows.size === 0 ? <SettingValue settingId="audio.applicationRouting.empty" title="App categories"
        description={audio.enabled ? 'Play audio in an app to see its category here.' : 'Turn on the audio engine and play audio to discover apps.'}
        value="No apps yet" /> : [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)).map(row => {
          const override = audio.applicationRoutes?.find(route => route.executablePath.toLowerCase() === row.path.toLowerCase());
          const category = row.category ? row.category.charAt(0).toUpperCase() + row.category.slice(1) : undefined;
          return <SettingSelect key={row.path} settingId={`audio.applicationRouting.${encodeURIComponent(row.path)}`}
            title={row.name} description={<span title={row.path}>{row.error ?? (override ? 'Saved category · applies whenever this app plays.'
              : audio.automaticApplicationRouting ? category ? `Automatic · ${category}` : 'Categorized when audio starts.' : 'Automatic routing is off.')}</span>}
            value={override?.destination ?? 'automatic'} disabled={pending || !supported}
            options={[{ value: 'automatic', label: 'Automatic' }, { value: 'game', label: 'Game' }, { value: 'chat', label: 'Chat' }, { value: 'media', label: 'Media' }]}
            onValueChange={destination => void update({ override: { executablePath: row.path,
              destination: destination === 'automatic' ? null : destination as 'game' | 'chat' | 'media' } })} />;
        })}
    </SettingSection>
  );
}
