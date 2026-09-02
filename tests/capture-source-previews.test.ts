import { describe, expect, test } from 'bun:test';
import type { DesktopCapturerSource } from 'electron';
import type { CaptureSource } from '../src/shared/contracts';
import { desktopCaptureTypesForSources, matchDesktopCaptureSource } from '../src/main/capture-source-previews';

function nativeSource(id: string, name: string, displayId = ''): DesktopCapturerSource {
  return { id, name, display_id: displayId } as DesktopCapturerSource;
}

describe('capture source previews', () => {
  test('requests both Electron source types when displays and windows need previews', () => {
    const sources: CaptureSource[] = [
      { id: 'display:0', type: 'display', name: 'Display 1', displayId: '0', available: true },
      { id: 'window:51383406', type: 'window', name: 'Discord', windowHandle: '51383406', available: true },
    ];

    expect(desktopCaptureTypesForSources(sources)).toEqual(['screen', 'window']);
  });

  test('matches a Capture.Host window to the Electron thumbnail with the same HWND', () => {
    const source: CaptureSource = {
      id: 'window:51383406',
      type: 'window',
      name: 'Discord',
      processId: 60124,
      windowHandle: '51383406',
      available: true,
    };
    const expected = nativeSource('window:51383406:0', 'Discord');

    expect(matchDesktopCaptureSource(source, [
      nativeSource('window:108728466:0', 'SteelSeries GG'),
      expected,
    ], [])).toBe(expected);
  });
});
