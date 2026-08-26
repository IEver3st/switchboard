import type { DeviceIdentity, DeviceKind, ProductAssetResolution } from './contracts';

interface ProductAssetDefinition extends ProductAssetResolution {
  manufacturer?: string;
  model?: string;
  variant?: string;
  colorway?: string;
}

const productAssets: ProductAssetDefinition[] = [
  {
    key: 'logitech-g502-x-plus-white',
    manufacturer: 'logitech',
    model: 'g502 x plus',
    variant: 'white',
    colorway: 'white',
    matchedBy: 'exact-variant',
    source: 'bundled-official',
  },
  {
    key: 'logitech-g502-x-plus-black',
    manufacturer: 'logitech',
    model: 'g502 x plus',
    variant: 'black',
    colorway: 'black',
    matchedBy: 'exact-variant',
    source: 'bundled-official',
  },
  {
    key: 'logitech-g502-x-plus-black',
    manufacturer: 'logitech',
    model: 'g502 x plus',
    matchedBy: 'exact-model',
    source: 'bundled-official',
  },
  {
    key: 'hyperx-quadcast-2',
    manufacturer: 'hyperx',
    model: 'quadcast 2',
    matchedBy: 'exact-model',
    source: 'bundled-official',
  },
];

export function resolveProductAsset(identity: DeviceIdentity, kind: DeviceKind): ProductAssetResolution {
  const manufacturer = normalize(identity.manufacturer);
  const model = normalize(identity.model);
  const variant = normalize(identity.variant);
  const colorway = normalize(identity.colorway);

  const exactVariant = productAssets.find((asset) => (
    asset.matchedBy === 'exact-variant'
    && asset.manufacturer === manufacturer
    && asset.model === model
    && (asset.variant === variant || asset.colorway === colorway)
  ));
  if (exactVariant) return stripLookupFields(exactVariant);

  const exactModel = productAssets.find((asset) => (
    asset.matchedBy === 'exact-model'
    && asset.manufacturer === manufacturer
    && asset.model === model
  ));
  if (exactModel) return stripLookupFields(exactModel);

  const manufacturerDefault = productAssets.find((asset) => (
    asset.matchedBy === 'manufacturer-default' && asset.manufacturer === manufacturer
  ));
  if (manufacturerDefault) return stripLookupFields(manufacturerDefault);

  return {
    key: `generic-${kind}`,
    matchedBy: 'generic',
    source: 'bundled-generic',
  };
}

function stripLookupFields(asset: ProductAssetDefinition): ProductAssetResolution {
  return { key: asset.key, matchedBy: asset.matchedBy, source: asset.source };
}

function normalize(value: string | undefined): string | undefined {
  return value?.trim().toLocaleLowerCase('en-US');
}
