import { describe, expect, it } from 'bun:test';
import { isSettingsCategoryVisible, searchSettings, settingsCategories, settingsSearchEntries, visibleSettingsCategories } from '../src/renderer/src/components/settings/settings-catalog';

describe('settings search metadata', () => {
  it('gates diagnostics navigation, selection, and search on confirmed developer mode', () => {
    for (const settings of [undefined, null, {}, { developerMode: false }]) {
      expect(visibleSettingsCategories(settings).some((category) => category.id === 'diagnostics')).toBe(false);
      expect(isSettingsCategoryVisible('diagnostics', settings)).toBe(false);
      expect(searchSettings('diagnostics', settings).some((entry) => entry.category === 'diagnostics')).toBe(false);
      expect(searchSettings('renderer memory', settings).some((entry) => entry.category === 'diagnostics')).toBe(false);
      expect(isSettingsCategoryVisible('audio', settings)).toBe(false);
      expect(isSettingsCategoryVisible('general', settings)).toBe(true);
    }
    expect(isSettingsCategoryVisible('diagnostics', { developerMode: true })).toBe(true);
    expect(visibleSettingsCategories({ developerMode: true })).toEqual(settingsCategories);
    expect(searchSettings('diagnostics', { developerMode: true }).some((entry) => entry.category === 'diagnostics')).toBe(true);
  });

  it('matches titles, aliases, and descriptions without crawling the DOM', () => {
    expect(searchSettings('startup').map((entry) => entry.id)).toContain('general.startup');
    const clipResults = searchSettings('clips').map((entry) => entry.id);
    expect(clipResults).toContain('capture.storage');
    expect(clipResults).toContain('capture.duration');
    expect(searchSettings('clip quality')[0]?.category).toBe('clips');
    expect(searchSettings('renderer memory', { developerMode: true }).map((entry) => entry.id)).toContain('diagnostics.memory');
    expect(searchSettings('white variant')).toEqual([]);
    expect(searchSettings('reaction voice').map((entry) => entry.id)).toContain('reactionClipping.enabled');
  });

  it('requires every search term and returns no results for unrelated input', () => {
    expect(searchSettings('capture hotkey').map((entry) => entry.id)).toEqual(['capture.shortcut']);
    expect(searchSettings('definitely unrelated')).toEqual([]);
  });

  it('indexes every stable settings row and workspace action', () => {
    const ids = new Set(settingsSearchEntries.map((entry) => entry.id));
    const expectedIds = [
      'general.softwareRendering', 'general.startup', 'general.closeToTray', 'general.destroyRenderer',
      'audio.engine', 'audio.sampleRate', 'audio.output', 'audio.microphone', 'audio.mixer',
      'capture.engine', 'capture.storage', 'capture.duration', 'capture.shortcut', 'capture.source',
      'capture.resolution', 'capture.frameRate', 'capture.quality', 'capture.encoder',
      'capture.codec', 'capture.microphone', 'capture.systemAudio', 'capture.cursor', 'capture.workspace',
      'games.automaticScan', 'games.library',
      'modules.automaticUpdates', 'modules.installed', 'modules.available',
      'diagnostics.telemetry', 'diagnostics.retention', 'diagnostics.guard',
      'diagnostics.memory', 'diagnostics.engines', 'diagnostics.capture-path',
      'diagnostics.capture-health', 'diagnostics.deviceIdentity',
      'diagnostics.reaction-clipping',
      'about.version', 'about.updates', 'about.runtime', 'about.isolation',
      'about.automaticAppUpdates', 'about.automaticAppUpdateDownloads', 'about.installAppUpdatesOnNextStartup',
    ];

    expect(expectedIds.filter((id) => !ids.has(id))).toEqual([]);
  });

  it('does not expose the Devices workspace as a duplicate settings category', () => {
    expect(settingsCategories.some((category) => category.id === ('devices' as never))).toBe(false);
    expect(settingsSearchEntries.some((entry) => entry.category === ('devices' as never))).toBe(false);
  });
});
