import { setupPreferencesSchema } from '../src/shared/contracts';
import { describe, expect, it } from 'bun:test';
import { shortcutFromKeyboardEvent } from '../src/renderer/src/lib/shortcut';

describe('shortcut recording', () => {
  it('records modifiers in the Electron accelerator order', () => {
    expect(shortcutFromKeyboardEvent({
      altKey: true,
      code: 'KeyK',
      ctrlKey: true,
      key: 'k',
      metaKey: false,
      shiftKey: true,
    })).toBe('Ctrl+Alt+Shift+K');
  });

  it('waits while only a modifier is held and normalizes special keys', () => {
    expect(shortcutFromKeyboardEvent({ altKey: false, code: 'ControlLeft', ctrlKey: true, key: 'Control', metaKey: false, shiftKey: false })).toBeNull();
    expect(shortcutFromKeyboardEvent({ altKey: false, code: 'F10', ctrlKey: false, key: 'F10', metaKey: false, shiftKey: false })).toBe('F10');
    expect(shortcutFromKeyboardEvent({ altKey: false, code: 'Space', ctrlKey: true, key: ' ', metaKey: false, shiftKey: false })).toBe('Ctrl+Space');
  });

  it('uses Electron Super syntax for the Windows key', () => {
    expect(shortcutFromKeyboardEvent({ altKey: false, code: 'KeyS', ctrlKey: false, key: 's', metaKey: true, shiftKey: false })).toBe('Super+S');
  });
});


describe('custom shortcut contract', () => {
  it('accepts custom combinations and preserves legacy presets', () => {
    for (const value of ['Control+Alt+Space', 'Control+Shift+Space', 'Alt+Space', 'Ctrl+Alt+K', 'F13', 'Super+Shift+X', 'Ctrl+Plus', 'Ctrl+num8', 'MediaPlayPause']) {
      expect(setupPreferencesSchema.parse({ quickShortcut: value }).quickShortcut).toBe(value);
    }
  });
  it('rejects malformed and modifier-only input at the IPC boundary', () => {
    for (const value of ['', 'Ctrl', 'Control+Shift', 'Ctrl++', 'Ctrl+UnknownKey', 'Ctrl+K+J', 'Ctrl+Ctrl+K', 'F25', 'a'.repeat(129)]) {
      expect(setupPreferencesSchema.safeParse({ quickShortcut: value }).success).toBe(false);
    }
  });
  it('records plus, numpad, and media keys without malformed accelerators', () => {
    const event = { altKey: false, ctrlKey: true, metaKey: false, shiftKey: false };
    expect(shortcutFromKeyboardEvent({ ...event, key: '+', code: 'Equal' })).toBe('Ctrl+Plus');
    expect(shortcutFromKeyboardEvent({ ...event, key: '8', code: 'Numpad8' })).toBe('Ctrl+num8');
    expect(shortcutFromKeyboardEvent({ ...event, key: 'AudioVolumeMute', code: 'AudioVolumeMute' })).toBe('Ctrl+VolumeMute');
    expect(shortcutFromKeyboardEvent({ ...event, key: 'Dead', code: 'Quote' })).toBeNull();
  });
});
