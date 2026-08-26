import type { DeviceControlBinding } from '../../../../../shared/contracts';
import type { DeviceVariantCandidate } from '../../../../../shared/device-variant';

export const g502XPlusDefinition = {
  manufacturer: 'Logitech',
  productFamily: 'G502',
  model: 'G502 X Plus',
  wirelessProductId: 0x4099,
  wiredProductId: 0xc095,
  receiverProductIds: [0xc547],
  capabilities: ['dpi', 'polling-rate', 'buttons', 'battery', 'profiles', 'lighting'],
} as const;

export const g502XPlusControlBindings: DeviceControlBinding[] = [
  { id: 'primary', label: 'Primary click', assignment: 'Left click', side: 'left', order: 0 },
  { id: 'back', label: 'Back button', assignment: 'Back', side: 'left', order: 1 },
  { id: 'dpi-shift', label: 'DPI shift', assignment: '800 DPI', side: 'left', order: 2 },
  { id: 'secondary', label: 'Secondary click', assignment: 'Right click', side: 'right', order: 0 },
  { id: 'wheel', label: 'Wheel press', assignment: 'Middle click', side: 'right', order: 1 },
  { id: 'forward', label: 'Forward button', assignment: 'Forward', side: 'right', order: 2 },
];

export function resolveG502XPlusVariant(extendedModel: number | undefined): DeviceVariantCandidate[] {
  if (extendedModel === 1) {
    return [{
      variant: 'white',
      colorway: 'White',
      confidence: 'hardware',
      source: 'Logitech DEVIO extended model',
      evidence: 'extendedModel 1',
    }];
  }

  if (extendedModel === 0) {
    return [{
      variant: 'black',
      colorway: 'Black',
      confidence: 'hardware',
      source: 'Logitech DEVIO extended model',
      evidence: 'extendedModel 0',
    }];
  }

  return [];
}
