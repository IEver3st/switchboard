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
