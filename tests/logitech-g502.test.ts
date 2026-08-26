import { describe, expect, test } from 'bun:test';
import {
  actionIdFromCardId,
  cardLibraryPrefix,
  g502ActionCardSuffixes,
  g502XPlusActions,
  g502XPlusBindings,
} from '../src/main/modules/logitech/devices/g502-x-plus/definition';

describe('G502 X Plus normalized controls', () => {
  test('maps every selectable action to a real G HUB standard card', () => {
    const selectable = g502XPlusActions.filter((action) => action.selectable !== false);
    expect(selectable.map((action) => action.id).sort()).toEqual(Object.keys(g502ActionCardSuffixes).sort());

    for (const action of selectable) {
      const suffix = g502ActionCardSuffixes[action.id];
      expect(actionIdFromCardId(`0f82f693-5b78-4cf5-867e-${suffix}`)).toBe(action.id);
    }
  });

  test('keeps hotspot metadata unique and renderable without model-specific JSX', () => {
    expect(new Set(g502XPlusBindings.map((binding) => binding.buttonId)).size).toBe(g502XPlusBindings.length);
    expect(new Set(g502XPlusBindings.map((binding) => binding.slotId)).size).toBe(g502XPlusBindings.length);
    for (const binding of g502XPlusBindings) {
      expect(binding.hotspot.capability).toBe('button-assignment');
      expect(binding.hotspot.position.x).toBeGreaterThanOrEqual(0);
      expect(binding.hotspot.position.x).toBeLessThanOrEqual(100);
      expect(binding.hotspot.position.y).toBeGreaterThanOrEqual(0);
      expect(binding.hotspot.position.y).toBeLessThanOrEqual(100);
    }
  });

  test('derives the installed G HUB action-library prefix without hardcoding it', () => {
    expect(cardLibraryPrefix([
      { cardId: 'custom-card' },
      { cardId: '0f82f693-5b78-4cf5-867e-020400000000' },
    ])).toBe('0f82f693-5b78-4cf5-867e-');
  });
});
