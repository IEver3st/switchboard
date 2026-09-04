import { describe, expect, test } from 'bun:test';
import type { DesktopCapturerSource } from 'electron';
import type { CaptureSource } from '../src/shared/contracts';
import {
  desktopCaptureRequestsForSources,
  desktopCaptureTypesForSources,
  matchDesktopCaptureSource,
  onlySourcesWithUsablePreviews,
  preserveValidatedWindowSources,
} from '../src/main/capture-source-previews';

function nativeSource(id: string, name: string, displayId = ''): DesktopCapturerSource {
  return { id, name, display_id: displayId, thumbnail: { isEmpty: () => false } } as DesktopCapturerSource;
}

describe('capture source previews', () => {
  test('keeps Windows window enumeration off the WGC thumbnail path', () => {
    const sources: CaptureSource[] = [
      { id: 'display:0', type: 'display', name: 'Display 1', displayId: '0', available: true },
      { id: 'window:51383406', type: 'window', name: 'Discord', windowHandle: '51383406', available: true },
    ];

    expect(desktopCaptureRequestsForSources(sources, 'win32')).toEqual([
      { types: ['screen'], thumbnailSize: { width: 320, height: 180 } },
      { types: ['window'], thumbnailSize: { width: 0, height: 0 } },
    ]);
  });

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

  test('keeps displays and open apps but removes system windows without a usable preview', () => {
    const sources: CaptureSource[] = [
      { id: 'display:0', type: 'display', name: 'Display 1', displayId: '0', available: true },
      { id: 'window:10', type: 'window', name: 'Discord', windowHandle: '10', available: true },
      { id: 'window:20', type: 'window', name: 'Program Manager', windowHandle: '20', available: true },
      { id: 'window:30', type: 'window', name: 'Cua.AgentCursorOverlay.Default', windowHandle: '30', available: true },
    ];
    const nativeSources = [
      nativeSource('screen:0:0', 'Display 1', '100'),
      nativeSource('window:10:0', 'Discord'),
      nativeSource('window:20:0', 'Program Manager'),
      nativeSource('window:30:0', 'Cua.AgentCursorOverlay.Default'),
    ] as DesktopCapturerSource[];

    expect(onlySourcesWithUsablePreviews(sources, nativeSources, [100]).map((source) => source.id))
      .toEqual(['display:0', 'window:10']);
  });

  test('runtime host snapshots cannot repopulate unvalidated system windows', () => {
    const validated: CaptureSource[] = [
      { id: 'display:0', type: 'display', name: 'Display 1', displayId: '0', available: true },
      { id: 'window:10', type: 'window', name: 'Discord', windowHandle: '10', available: true },
    ];
    const incoming: CaptureSource[] = [
      ...validated,
      { id: 'window:20', type: 'window', name: 'Program Manager', windowHandle: '20', available: true },
      { id: 'window:30', type: 'window', name: 'Cursor Overlay', windowHandle: '30', available: true },
    ];

    expect(preserveValidatedWindowSources(incoming, validated).map((source) => source.id))
      .toEqual(['display:0', 'window:10']);
  });
});
