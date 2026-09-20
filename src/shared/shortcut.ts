import { z } from 'zod';

const modifiers = new Set(['ctrl', 'control', 'alt', 'shift', 'super', 'meta', 'command', 'cmd', 'commandorcontrol', 'cmdorctrl', 'option']);
const namedKeys = new Set(['space', 'tab', 'capslock', 'numlock', 'scrolllock', 'backspace', 'delete', 'insert', 'return', 'enter', 'escape', 'esc', 'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown', 'printscreen', 'plus', 'volumeup', 'volumedown', 'volumemute', 'medianexttrack', 'mediaprevioustrack', 'mediastop', 'mediaplaypause', 'numdec', 'numadd', 'numsub', 'nummult', 'numdiv']);

export function isShortcut(value: string): boolean {
  const parts = value.toLowerCase().split('+');
  const key = parts.pop() ?? '';
  return parts.every(part => modifiers.has(part))
    && new Set(parts).size === parts.length
    && (/^[a-z0-9!@#$%^&*()_\-={}\[\]|\\:;"'<>,.?/`]$/.test(key)
      || /^f([1-9]|1\d|2[0-4])$/.test(key) || /^num[0-9]$/.test(key) || namedKeys.has(key));
}

export const shortcutSchema = z.string().min(1).max(128).refine(isShortcut, 'Press a supported key or key combination.');

export function shortcutIdentity(value: string): string {
  return value.toLowerCase().split('+').map(part => ({ ctrl: 'control', cmdorctrl: 'control', commandorcontrol: 'control', option: 'alt', meta: 'super', cmd: 'super', command: 'super', esc: 'escape', enter: 'return' }[part] ?? part)).sort().join('+');
}
