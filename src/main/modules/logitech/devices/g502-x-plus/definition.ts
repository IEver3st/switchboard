import type { ButtonAssignmentBinding, MouseAction } from '../../../../../shared/contracts';
import type { DeviceVariantCandidate } from '../../../../../shared/device-variant';

export const g502XPlusDefinition = {
  manufacturer: 'Logitech',
  productFamily: 'G502',
  model: 'G502 X Plus',
  wirelessProductId: 0x4099,
  wiredProductId: 0xc095,
  receiverProductIds: [0xc547],
  deviceBaseModel: 'g502x_plus',
  slotPrefix: 'g502x-plus',
} as const;

export const g502XPlusActions: MouseAction[] = [
  { id: 'mouse.primary-click', label: 'Left click', category: 'mouse', searchTerms: ['primary click', 'mb1'], selectable: true },
  { id: 'mouse.secondary-click', label: 'Right click', category: 'mouse', searchTerms: ['secondary click', 'mb2'], selectable: true },
  { id: 'mouse.middle-click', label: 'Middle click', category: 'mouse', searchTerms: ['wheel press', 'mb3'], selectable: true },
  { id: 'mouse.back', label: 'Back', category: 'mouse', searchTerms: ['browser back', 'mb4'], selectable: true },
  { id: 'mouse.forward', label: 'Forward', category: 'mouse', searchTerms: ['browser forward', 'mb5'], selectable: true },
  { id: 'mouse.dpi-up', label: 'DPI up', category: 'mouse', searchTerms: ['sensitivity increase'], selectable: true },
  { id: 'mouse.dpi-down', label: 'DPI down', category: 'mouse', searchTerms: ['sensitivity decrease'], selectable: true },
  { id: 'mouse.dpi-shift', label: 'DPI shift', category: 'mouse', searchTerms: ['sniper', 'temporary dpi'], selectable: true },
];

export const g502ActionCardSuffixes: Record<string, string> = {
  'mouse.primary-click': '020100000000',
  'mouse.secondary-click': '020200000000',
  'mouse.middle-click': '020300000000',
  'mouse.back': '020400000000',
  'mouse.forward': '020500000000',
  'mouse.dpi-up': '040100000000',
  'mouse.dpi-down': '040200000000',
  'mouse.dpi-shift': '040300000000',
};

export const g502XPlusBindings: ButtonAssignmentBinding[] = [
  createBinding('primary', 'Primary click', 'g1', 'mouse.primary-click', 'left', 0, 44, 23),
  createBinding('back', 'Back', 'g4', 'mouse.back', 'left', 1, 29, 55),
  createBinding('dpi-shift', 'DPI shift', 'g5', 'mouse.dpi-shift', 'left', 2, 25, 43),
  createBinding('secondary', 'Secondary click', 'g2', 'mouse.secondary-click', 'right', 0, 56, 23),
  createBinding('wheel', 'Wheel press', 'g3', 'mouse.middle-click', 'right', 1, 50, 35),
  createBinding('forward', 'Forward', 'g6', 'mouse.forward', 'right', 2, 32, 49),
];

function createBinding(
  buttonId: string,
  label: string,
  slot: string,
  currentActionId: string,
  calloutSide: 'left' | 'right',
  order: number,
  x: number,
  y: number,
): ButtonAssignmentBinding {
  return {
    buttonId,
    slotId: `${g502XPlusDefinition.slotPrefix}_${slot}_m1`,
    currentActionId,
    hotspot: {
      id: buttonId,
      label,
      position: { x, y },
      calloutSide,
      order,
      capability: 'button-assignment',
    },
  };
}

export function actionIdFromCardId(cardId: string | undefined): string | undefined {
  if (!cardId) return undefined;
  return Object.entries(g502ActionCardSuffixes).find(([, suffix]) => cardId.endsWith(suffix))?.[0];
}

export function cardLibraryPrefix(assignments: Array<{ cardId?: string }>): string | undefined {
  const knownSuffixes = new Set(Object.values(g502ActionCardSuffixes));
  const cardId = assignments
    .map((assignment) => assignment.cardId)
    .find((candidate) => candidate && knownSuffixes.has(candidate.slice(-12)));
  return cardId?.slice(0, -12);
}

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
