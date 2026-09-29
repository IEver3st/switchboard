import type { SystemSnapshot } from './contracts';

export type AudioRecoveryAction = 'enable' | 'restart' | 'settings' | 'windows' | 'unmute' | 'volume' | 'mixer';
export type AudioRoutingNotice = { tone: 'error' | 'warning' | 'pending'; message: string; action?: AudioRecoveryAction; label?: string };

export function audioRoutingNotice({ audio, engines }: Pick<SystemSnapshot, 'audio' | 'engines'>): AudioRoutingNotice | null {
  const engine = engines.find(item => item.kind === 'audio');
  if (audio.dependencies.phase === 'restart-required') return {
    tone: 'warning', message: 'Restart Windows to finish audio setup.', action: 'settings', label: 'Audio setup',
  };
  if (!audio.enabled) return { tone: 'warning', message: 'Audio is off. Game, Chat and Media are not being mixed.', action: 'enable', label: 'Turn on audio' };
  if (engine?.state === 'starting') return { tone: 'pending', message: 'Starting audio…' };
  if (audio.capabilities.applicationRouting === 'simulation') return { tone: 'warning', message: 'Preview audio uses simulated routing. No sound is processed.' };
  if (engine?.state !== 'running') return { tone: 'error', message: 'The audio engine stopped. Apps routed through Switchboard may be silent.', action: 'restart', label: 'Restart audio' };

  const outputs = audio.buses.filter(bus => bus.enabled && ['game', 'chat', 'media'].includes(bus.id));
  if (outputs.some(bus => !audio.devices.some(device => device.id === bus.deviceId && device.available && device.direction === 'output'))) return {
    tone: 'error', message: 'A channel output is disconnected. Choose connected headphones or speakers.', action: 'settings', label: 'Choose output',
  };
  if (outputs.some(bus => audio.devices.some(device => device.id === bus.deviceId && (device.muted || device.volume === 0)))) return {
    tone: 'error', message: 'A channel output is muted or at zero volume in Windows.', action: 'windows', label: 'Windows sound',
  };
  if (audio.host?.driver.endpoints.some(endpoint => endpoint.flow === 'render' && audio.devices.some(device =>
    device.id === endpoint.id && !/16ch/i.test(endpoint.name) && (device.muted || device.volume === 0)))) return {
    tone: 'error', message: 'The mixer input is muted or at zero volume in Windows. Routed apps may be silent.', action: 'windows', label: 'Windows sound',
  };
  if (audio.capabilities.applicationRouting === 'unavailable' || audio.capabilities.channelDsp === 'unavailable') {
    if (audio.host?.driver.state === 'not-installed') return {
      tone: 'error', message: 'App mixing needs an audio driver. Finish Audio setup to hear routed apps.', action: 'settings', label: 'Audio setup',
    };
    return { tone: 'error', message: 'Audio routing is unavailable. Game, Chat and Media are not reaching your output.', action: 'restart', label: 'Restart audio' };
  }
  const personal = audio.mixes.find(mix => mix.id === 'personal');
  if (personal && !personal.master.enabled) return { tone: 'warning', message: 'Your Personal mix is muted. Game, Chat and Media are silent in your headphones.', action: 'unmute', label: 'Unmute' };
  if (personal?.master.gain === 0) return { tone: 'warning', message: 'Your Personal mix volume is zero.', action: 'volume', label: 'Restore volume' };
  const active = audio.applications.filter(app => app.active);
  if (active.some(app => app.routingError || app.routingState === 'unavailable')) return {
    tone: 'error', message: 'Some apps could not be routed through Switchboard.', action: 'restart', label: 'Retry audio',
  };
  if (active.some(app => app.routingState === 'pending-restart')) return {
    tone: 'warning', message: 'Some apps still use their previous output. Restart those apps to finish routing.', action: 'windows', label: 'Windows sound',
  };
  if (active.some(app => app.routingState === 'unmanaged')) return {
    tone: 'warning', message: 'Some apps are playing outside Switchboard. Assign them to Game, Chat or Media.', action: 'mixer', label: 'Show mixer',
  };
  return null;
}
