import { describe, expect, test } from 'bun:test';
import { resolveG502XPlusVariant } from '../src/main/modules/logitech/devices/g502-x-plus/definition';
import { resolveDeviceVariant } from '../src/shared/device-variant';
import { resolveProductAsset } from '../src/shared/product-assets';

const g502Identity = {
  manufacturer: 'Logitech',
  productFamily: 'G502',
  model: 'G502 X Plus',
  vendorId: 0x046d,
  productId: 0x4099,
};

describe('device variant resolution', () => {
  test('uses Logitech hardware metadata for the white extended model', () => {
    const resolved = resolveDeviceVariant(g502Identity, resolveG502XPlusVariant(1));
    expect(resolved.identity.variant).toBe('white');
    expect(resolved.identity.colorway).toBe('White');
    expect(resolved.resolution.confidence).toBe('hardware');
    expect(resolveProductAsset(resolved.identity, 'mouse')).toEqual({
      key: 'logitech-g502-x-plus-white',
      matchedBy: 'exact-variant',
      source: 'bundled-official',
    });
  });

  test('uses the black render for the known base hardware variant', () => {
    const resolved = resolveDeviceVariant(g502Identity, resolveG502XPlusVariant(0));
    expect(resolved.identity.variant).toBe('black');
    expect(resolveProductAsset(resolved.identity, 'mouse').key).toBe('logitech-g502-x-plus-black');
  });

  test('does not let a fallback override replace hardware evidence', () => {
    const resolved = resolveDeviceVariant(
      g502Identity,
      resolveG502XPlusVariant(1),
      { variant: 'black', colorway: 'Black' },
    );
    expect(resolved.identity.variant).toBe('white');
    expect(resolved.resolution.confidence).toBe('hardware');
  });

  test('uses a stable override only when automatic evidence is inconclusive', () => {
    const resolved = resolveDeviceVariant(g502Identity, [], { variant: 'white', colorway: 'White' });
    expect(resolved.identity.variant).toBe('white');
    expect(resolved.resolution.confidence).toBe('user-override');
  });

  test('falls back to the exact model asset without claiming a cosmetic color', () => {
    const resolved = resolveDeviceVariant(g502Identity);
    expect(resolved.identity.variant).toBe('default');
    expect(resolved.identity.colorway).toBeUndefined();
    expect(resolved.resolution.confidence).toBe('fallback');
    expect(resolveProductAsset(resolved.identity, 'mouse')).toEqual({
      key: 'logitech-g502-x-plus-black',
      matchedBy: 'exact-model',
      source: 'bundled-official',
    });
  });

  test('uses a generic device asset for unknown models', () => {
    expect(resolveProductAsset({ manufacturer: 'Unknown', model: 'Mystery' }, 'keyboard')).toEqual({
      key: 'generic-keyboard',
      matchedBy: 'generic',
      source: 'bundled-generic',
    });
  });
});
