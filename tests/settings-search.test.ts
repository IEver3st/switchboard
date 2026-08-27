import { describe, expect, it } from 'bun:test';
import { searchSettings, settingsSearchEntries } from '../src/renderer/src/components/settings/settings-catalog';

describe('settings search metadata', () => {
  it('matches titles, aliases, and descriptions without crawling the DOM', () => {
    expect(searchSettings('startup').map((entry) => entry.id)).toContain('general.startup');
    const clipResults = searchSettings('clips').map((entry) => entry.id);
    expect(clipResults).toContain('capture.storage');
    expect(clipResults).toContain('capture.duration');
    expect(searchSettings('clip quality')[0]?.category).toBe('clips');
    expect(searchSettings('renderer memory').map((entry) => entry.id)).toContain('diagnostics.memory');
    expect(searchSettings('white variant').map((entry) => entry.id)).toContain('devices.appearanceFallback');
  });

  it('requires every search term and returns no results for unrelated input', () => {
    expect(searchSettings('capture hotkey').map((entry) => entry.id)).toEqual(['capture.shortcut']);
    expect(searchSettings('definitely unrelated')).toEqual([]);
  });

  it('indexes every stable settings row and workspace action', () => {
    const ids = new Set(settingsSearchEntries.map((entry) => entry.id));
    const expectedIds = [
      'general.startup', 'general.closeToTray', 'general.destroyRenderer',
      'devices.connected', 'devices.appearanceFallback', 'devices.workspace',
      'audio.engine', 'audio.sampleRate', 'audio.output', 'audio.microphone', 'audio.mixer',
      'capture.engine', 'capture.storage', 'capture.duration', 'capture.shortcut', 'capture.source',
      'capture.resolution', 'capture.frameRate', 'capture.quality', 'capture.encoder',
      'capture.codec', 'capture.microphone', 'capture.systemAudio', 'capture.cursor', 'capture.workspace',
      'games.automaticScan', 'games.library',
      'modules.automaticUpdates', 'modules.installed', 'modules.available',
      'diagnostics.telemetry', 'diagnostics.retention', 'diagnostics.guard',
      'diagnostics.memory', 'diagnostics.engines', 'diagnostics.capture-path',
      'diagnostics.capture-health', 'diagnostics.deviceIdentity',
      'about.version', 'about.updates', 'about.runtime', 'about.isolation',
      'about.automaticAppUpdates', 'about.automaticAppUpdateDownloads', 'about.installAppUpdatesOnNextStartup',
    ];

    expect(expectedIds.filter((id) => !ids.has(id))).toEqual([]);
  });
});
