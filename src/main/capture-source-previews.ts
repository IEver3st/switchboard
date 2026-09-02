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
