import type {
  DeviceAppearanceOverride,
  DeviceIdentity,
  DeviceVariantConfidence,
  DeviceVariantResolution,
} from './contracts';

export interface DeviceVariantCandidate {
  variant: string;
  colorway?: string;
  confidence: Exclude<DeviceVariantConfidence, 'user-override' | 'fallback'>;
  source: string;
  evidence?: string;
}

export interface ResolvedDeviceVariant {
  identity: DeviceIdentity;
  resolution: DeviceVariantResolution;
}

/**
 * Resolves cosmetic identity without knowing anything about a particular vendor.
 * Vendor modules provide candidates; a stable user override is considered only
 * when automatic evidence did not identify a variant.
 */
export function resolveDeviceVariant(
  deviceIdentity: DeviceIdentity,
  moduleMetadata: DeviceVariantCandidate[] = [],
  fallbackOverride?: DeviceAppearanceOverride,
): ResolvedDeviceVariant {
  const automatic = [...moduleMetadata].sort(
    (left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence),
  )[0];

  if (automatic) {
    return {
      identity: {
        ...deviceIdentity,
        variant: automatic.variant,
        colorway: automatic.colorway ?? deviceIdentity.colorway,
      },
      resolution: {
        confidence: automatic.confidence,
        source: automatic.source,
        evidence: automatic.evidence,
      },
    };
  }

  if (fallbackOverride) {
    return {
      identity: {
        ...deviceIdentity,
        variant: fallbackOverride.variant,
        colorway: fallbackOverride.colorway,
      },
      resolution: {
        confidence: 'user-override',
        source: 'Stable device appearance override',
        evidence: `Stored for ${stableIdentityLabel(deviceIdentity)}`,
      },
    };
  }

  return {
    identity: { ...deviceIdentity, variant: deviceIdentity.variant ?? 'default' },
    resolution: {
      confidence: 'fallback',
      source: 'No cosmetic SKU reported by hardware',
    },
  };
}

function confidenceRank(confidence: DeviceVariantCandidate['confidence']): number {
  if (confidence === 'hardware') return 3;
  if (confidence === 'product-id') return 2;
  return 1;
}

function stableIdentityLabel(identity: DeviceIdentity): string {
  return identity.serialNumber
    ?? ([identity.vendorId, identity.productId].filter((value) => value !== undefined).join(':') || 'device identity');
}
