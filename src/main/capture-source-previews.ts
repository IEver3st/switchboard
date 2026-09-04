import type { DesktopCapturerSource } from 'electron';
import type { CaptureSource } from '../shared/contracts';

export function desktopCaptureTypesForSources(
  sources: readonly CaptureSource[],
): Array<'screen' | 'window'> {
  const types: Array<'screen' | 'window'> = [];
  if (sources.some((source) => source.type === 'display')) types.push('screen');
  if (sources.some((source) => source.type === 'window')) types.push('window');
  return types;
}

export interface DesktopCaptureSourceRequest {
  types: Array<'screen' | 'window'>;
  thumbnailSize: { width: number; height: number };
}

export function desktopCaptureRequestsForSources(
  sources: readonly CaptureSource[],
  platform: NodeJS.Platform = process.platform,
): DesktopCaptureSourceRequest[] {
  const types = desktopCaptureTypesForSources(sources);
  if (types.length === 0) return [];
  if (platform !== 'win32' || !types.includes('window')) {
    return [{ types, thumbnailSize: { width: 320, height: 180 } }];
  }

  const requests: DesktopCaptureSourceRequest[] = [];
  if (types.includes('screen')) {
    requests.push({ types: ['screen'], thumbnailSize: { width: 320, height: 180 } });
  }
  // Electron 42+ asks Chromium's WGC capturer to instantiate every enumerated
  // window when thumbnails are non-zero. Protected and system HWNDs then emit
  // errors before application-level filtering can run. A zero-sized request
  // still enumerates and identifies the windows without starting WGC.
  requests.push({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
  return requests;
}

export function matchDesktopCaptureSource(
  source: CaptureSource,
  nativeSources: DesktopCapturerSource[],
  captureIndexedDisplayIds: readonly number[],
): DesktopCapturerSource | undefined {
  if (source.type === 'display') {
    const displays = nativeSources.filter((candidate) => candidate.id.startsWith('screen:'));
    const displayIndex = Number(source.displayId ?? source.id.replace(/^display:/, ''));
    const windowsDisplayId = captureIndexedDisplayIds[displayIndex];
    return displays.find((candidate) => candidate.display_id === String(windowsDisplayId)) ?? displays[displayIndex];
  }
  if (source.type === 'window') {
    const windowHandle = source.windowHandle ?? source.id.replace(/^window:/, '');
    return nativeSources.find((candidate) => {
      if (!candidate.id.startsWith('window:')) return false;
      const [nativeWindowHandle] = candidate.id.slice('window:'.length).split(':');
      return nativeWindowHandle === windowHandle;
    });
  }
  return undefined;
}

export function onlySourcesAvailableToElectron(
  sources: readonly CaptureSource[],
  nativeSources: DesktopCapturerSource[],
  captureIndexedDisplayIds: readonly number[],
): CaptureSource[] {
  return sources.filter((source) => {
    if (source.type !== 'window') return true;
    if (isSystemOrOverlayWindow(source.name)) return false;
    const nativeSource = matchDesktopCaptureSource(source, nativeSources, captureIndexedDisplayIds);
    return nativeSource !== undefined;
  });
}

function isSystemOrOverlayWindow(name: string): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return normalized === 'program manager'
    || normalized.startsWith('cua.agentcursoroverlay.');
}

export function preserveValidatedWindowSources(
  incomingSources: readonly CaptureSource[],
  validatedSources: readonly CaptureSource[],
): CaptureSource[] {
  const validatedWindowIds = new Set(
    validatedSources.filter((source) => source.type === 'window').map((source) => source.id),
  );
  return incomingSources.filter((source) => source.type !== 'window' || validatedWindowIds.has(source.id));
}
