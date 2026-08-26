import { describe, expect, test } from 'bun:test';
import {
  actionIdFromCardId,
  cardLibraryPrefix,
  g502ActionCardSuffixes,
  g502XPlusActions,
  g502XPlusBindings,
} from '../src/main/modules/logitech/devices/g502-x-plus/definition';
import { defaultDevices } from '../src/shared/defaults';

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

  test('anchors every callout to the visible G502 render instead of transparent image padding', () => {
    const positions = Object.fromEntries(
      g502XPlusBindings.map((binding) => [binding.buttonId, binding.hotspot.position]),
    );

    expect(positions).toMatchObject({
      primary: { x: 44, y: 23 },
      back: { x: 34, y: 55 },
      'dpi-shift': { x: 36, y: 43 },
      secondary: { x: 60, y: 23 },
      wheel: { x: 53, y: 35 },
      forward: { x: 35, y: 49 },
    });
    expect(defaultDevices.find((device) => device.displayName === 'G502 X Plus')
      ?.capabilities.buttonAssignments?.bindings.map((binding) => binding.hotspot.position))
      .toEqual(g502XPlusBindings.map((binding) => binding.hotspot.position));
  });

  test('derives the installed G HUB action-library prefix without hardcoding it', () => {
    expect(cardLibraryPrefix([
      { cardId: 'custom-card' },
      { cardId: '0f82f693-5b78-4cf5-867e-020400000000' },
    ])).toBe('0f82f693-5b78-4cf5-867e-');
  });
});
