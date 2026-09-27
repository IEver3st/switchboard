import type { AudioState, SetAudioRoutingInput } from './contracts';

export function applyApplicationRoutingPreference(audio: AudioState, input: SetAudioRoutingInput): void {
  if (input.automatic !== undefined) audio.automaticApplicationRouting = input.automatic;
  if (input.override) {
    const { executablePath, destination } = input.override;
    const routes = (audio.applicationRoutes ?? []).filter(route => route.executablePath.toLowerCase() !== executablePath.toLowerCase());
    if (destination !== null) routes.push({ executablePath, destination });
    audio.applicationRoutes = routes;
  }
}
