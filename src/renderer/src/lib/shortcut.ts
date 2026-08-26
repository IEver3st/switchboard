export type ShortcutKeyboardEvent = Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>;

export function shortcutFromKeyboardEvent(event: ShortcutKeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;
  const key = normalizeShortcutKey(event.key, event.code);
  const modifiers = [
    event.ctrlKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
    event.metaKey ? 'Super' : null,
  ].filter((candidate): candidate is string => candidate !== null);
  return [...modifiers, key].join('+');
}

export function displayShortcut(value: string): string {
  return value.replace(/(^|\+)Super(?=\+|$)/g, '$1Win');
}

function normalizeShortcutKey(key: string, code: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toLocaleUpperCase();
  if (/^F\d{1,2}$/.test(key)) return key.toLocaleUpperCase();
  if (key === 'ArrowUp') return 'Up';
  if (key === 'ArrowDown') return 'Down';
  if (key === 'ArrowLeft') return 'Left';
  if (key === 'ArrowRight') return 'Right';
  return code.startsWith('Key') ? code.slice(3) : key;
}
