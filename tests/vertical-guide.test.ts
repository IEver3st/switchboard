import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupPreferencesSchema } from '../src/shared/contracts';
import { verticalGuideFrame } from '../src/shared/vertical-guide';
import { StateStore } from '../src/main/services/state-store';

describe('vertical framing guide', () => {
  it('hydrates older preferences and rejects unbounded geometry and CSS input', () => {
    const preferences = setupPreferencesSchema.parse({});
    expect(preferences.verticalGuide.enabled).toBe(false);
    expect(preferences.quickSurface).toBe('frosted');
    for (const verticalGuide of [{ size: 0 }, { horizontal: -1 }, { vertical: 101 }, { size: 25.5 }, { color: 'red; display:none' }, { dim: -1 }, { dim: 81 }, { frame: { x: -1, y: 0, width: 500, height: 700 } }]) {
      expect(setupPreferencesSchema.safeParse({ verticalGuide }).success).toBe(false);
    }
  });
  it('fits an exact phone aspect into landscape and portrait screen-pixel dimensions', () => {
    const base = setupPreferencesSchema.parse({}).verticalGuide;
    for (const display of [{ x: 0, y: 0, width: 1920, height: 1080 }, { x: -1440, y: -200, width: 1440, height: 2560 }, { x: 2560, y: 120, width: 1536, height: 864, scaleFactor: 1.25 }, { x: 0, y: 0, width: 2560, height: 1440, scaleFactor: 1.5 }]) {
      for (const size of [25, 70, 100]) for (const position of [0, 50, 100]) {
        const bounds = verticalGuideFrame({ width: display.width, height: display.height }, { ...base, size, horizontal: position, vertical: position });
        expect(bounds.width * 16).toBe(bounds.height * 9);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(display.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(display.height);
      }
    }
  });
  it('retains geometry and material across restart, but starts with the overlay off', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'switchboard-framing-test-'));
    try {
      const path = join(directory, 'state.json');
      const first = new StateStore(path); await first.load();
      first.update(draft => {
        draft.setup.preferences.quickSurface = 'solid';
        draft.setup.preferences.verticalGuide = { ...draft.setup.preferences.verticalGuide, enabled: true, size: 70, horizontal: 20, vertical: 80, color: 'lime', dim: 35, frame: { x: 10, y: 20, width: 600, height: 1000 } };
      });
      await first.flush();
      const second = new StateStore(path); await second.load();
      expect(second.get().setup.preferences.quickSurface).toBe('solid');
      expect(second.get().setup.preferences.verticalGuide).toEqual({ enabled: false, displayId: null, size: 70, horizontal: 20, vertical: 80, color: 'lime', dim: 35, frame: { x: 10, y: 20, width: 600, height: 1000 } });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
