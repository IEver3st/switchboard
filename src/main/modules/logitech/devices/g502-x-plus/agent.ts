import { z } from 'zod';
import type {
  ButtonAssignmentBinding,
  Device,
  DeviceCapabilities,
  DeviceControlChange,
  MouseAction,
} from '../../../../../shared/contracts';
import {
  getLogitechAgent,
  removeLogitechAgent,
  setLogitechAgent,
} from '../../ghub-metadata';
import {
  actionIdFromCardId,
  cardLibraryPrefix,
  g502ActionCardSuffixes,
  g502XPlusActions,
  g502XPlusBindings,
  g502XPlusDefinition,
} from './definition';

const dpiTableSchema = z.object({
  levels: z.array(z.number().int().positive()).min(1),
  defaultDpi: z.number().int().positive(),
  shiftDpi: z.number().int().positive(),
  activeDpi: z.number().int().positive(),
});

const mouseSettingsSchema = z.object({
  reportRate: z.object({ value: z.number().int().positive() }),
  dpiTable: dpiTableSchema,
});

const cardSchema = z.object({
  id: z.string().min(1),
  attribute: z.string(),
  mouseSettings: mouseSettingsSchema.optional(),
  firmwareLightingSettings: z.object({
    effects: z.array(z.object({
      id: z.string(),
      zoneType: z.string().optional(),
      persistent: z.boolean().optional(),
    }).passthrough()).default([]),
  }).optional(),
}).passthrough();

const profileSchema = z.object({
  id: z.string().min(1),
  assignments: z.array(z.object({
    slotId: z.string(),
    cardId: z.string(),
  })),
});

const mouseInfoSchema = z.object({
  reportRates: z.object({
    rates: z.array(z.number().int().positive()),
    wirelessRates: z.array(z.number().int().positive()).default([]),
  }),
  dpiInfo: z.object({
    range: z.object({
      min: z.number().int().positive(),
      max: z.number().int().positive(),
      steps: z.number().int().positive(),
      maxLevels: z.number().int().nonnegative().default(0),
    }),
    defaultDpi: z.number().int().positive(),
  }),
});

const onboardModeSchema = z.object({ mode: z.enum(['HOST', 'ONBOARD']).optional() });
const onboardButtonMappingSchema = z.object({
  button: z.number().int().nonnegative().default(0),
  macro: z.object({
    type: z.string(),
    mouse: z.object({ action: z.string() }).optional(),
  }).optional(),
});
const onboardProfileSchema = z.object({
  onboardSlotId: z.string(),
  enabled: z.boolean(),
  mouseSettings: mouseSettingsSchema,
  lighting: z.object({
    effects: z.array(z.object({
      id: z.string(),
      frameDataParams: z.object({ intensity: z.number().min(0).max(1) }).optional(),
    }).passthrough()).default([]),
  }).optional(),
  buttonMappings: z.array(onboardButtonMappingSchema).default([]),
}).passthrough();
const onboardDirectorySchema = z.object({
  directoryEntries: z.array(onboardProfileSchema),
  activeProfile: z.string().optional(),
});

const brightnessSchema = z.object({ value: z.number().min(0).max(1) });
const viewerSchema = z.object({
  effectMetadata: z.object({
    type: z.string().optional(),
    solidMetadata: z.object({
      color: z.object({
        rgba: z.object({
          red: z.number().min(0).max(1),
          green: z.number().min(0).max(1),
          blue: z.number().min(0).max(1),
          alpha: z.number().min(0).max(1).optional(),
        }),
      }),
    }).optional(),
  }).optional(),
}).passthrough();

type LogitechProfile = z.infer<typeof profileSchema>;
type LogitechCard = z.infer<typeof cardSchema>;
type OnboardProfile = z.infer<typeof onboardProfileSchema>;

interface SoftwareProfileBundle {
  profile: LogitechProfile;
  mouseCard: LogitechCard;
}

export async function readG502Capabilities(
  agentDeviceId: string,
  previous: Device | undefined,
): Promise<DeviceCapabilities> {
  // The local Logitech agent intermittently starves profile requests when a
  // fresh connection fans out several calls at once. These are low-frequency
  // control-plane reads, so keep them ordered and cache the normalized result.
  const mouseInfoPayload = await getLogitechAgent(`/mouse/${agentDeviceId}/info`);
  const modePayload = await getLogitechAgent(`/onboard_profiles/${agentDeviceId}/onboard_mode`);
  const directoryPayload = await getLogitechAgent(`/onboard_profiles/${agentDeviceId}/profiles`);
  const brightnessPayload = await getLogitechAgent(`/lighting/${agentDeviceId}/brightness`);
  const viewerPayload = await getLogitechAgent(
    '/lighting/viewer/state',
    { devices: [agentDeviceId], time: { milliseconds: 0 } },
  ).catch(() => undefined);
  const bundle = await loadSoftwareProfile();

  const mouseInfo = mouseInfoSchema.parse(mouseInfoPayload);
  const mode = onboardModeSchema.parse(modePayload).mode === 'ONBOARD' ? 'onboard' : 'software';
  const directory = onboardDirectorySchema.parse(directoryPayload);
  const activeOnboard = directory.directoryEntries.find((entry) => entry.onboardSlotId === directory.activeProfile)
    ?? directory.directoryEntries.find((entry) => entry.enabled)
    ?? directory.directoryEntries[0];
  const activeSettings = mode === 'onboard' ? activeOnboard?.mouseSettings : bundle.mouseCard.mouseSettings;
  if (!activeSettings) throw new Error('Logitech profile does not expose mouse settings.');

  const unavailableReason = mode === 'onboard'
    ? 'Stored onboard profiles are active. Turn off onboard memory to edit the software profile.'
    : undefined;
  const bindings = mode === 'onboard'
    ? buildOnboardBindings(activeOnboard)
    : buildSoftwareBindings(bundle.profile);
  const availableActions = withCurrentCustomAction(bindings);
  const viewer = viewerPayload ? viewerSchema.safeParse(viewerPayload) : undefined;
  const viewerColor = viewer?.success ? colorToHex(viewer.data.effectMetadata?.solidMetadata?.color.rgba) : undefined;
  const previousColor = previous?.capabilities.lighting?.color;
  const onboardEffect = activeOnboard?.lighting?.effects[0];
  const supportedRates = mouseInfo.reportRates.wirelessRates.length > 0
    ? mouseInfo.reportRates.wirelessRates
    : mouseInfo.reportRates.rates;

  return {
    dpi: {
      writable: mode === 'software',
      min: mouseInfo.dpiInfo.range.min,
      max: mouseInfo.dpiInfo.range.max,
      step: mouseInfo.dpiInfo.range.steps,
      stages: [...activeSettings.dpiTable.levels],
      activeDpi: activeSettings.dpiTable.activeDpi,
      defaultDpi: activeSettings.dpiTable.defaultDpi,
      shiftDpi: activeSettings.dpiTable.shiftDpi,
      maxStages: mouseInfo.dpiInfo.range.maxLevels || 5,
      profileMode: mode,
      unavailableReason,
    },
    reportRate: {
      writable: mode === 'software',
      value: activeSettings.reportRate.value,
      supportedRates: [...supportedRates].sort((left, right) => left - right),
      profileMode: mode,
      unavailableReason,
    },
    buttonAssignments: {
      writable: mode === 'software',
      profileMode: mode,
      bindings,
      availableActions,
      unavailableReason,
    },
    lighting: mode === 'onboard'
      ? {
          writable: false,
          enabled: Boolean(onboardEffect && onboardEffect.id !== 'OFF'),
          activeEffectId: onboardEffect?.id === 'OFF' ? 'off' : 'signature',
          availableEffects: [{ id: 'signature', label: 'G signature' }],
          colorWritable: false,
          brightness: Math.round((onboardEffect?.frameDataParams?.intensity ?? 1) * 100),
          brightnessWritable: false,
          profileMode: mode,
          source: 'firmware',
          unavailableReason,
        }
      : {
          writable: true,
          enabled: viewer?.success === true && viewer.data.effectMetadata?.type === 'SOLID',
          activeEffectId: 'solid',
          availableEffects: [{ id: 'solid', label: 'Static' }],
          color: viewerColor ?? previousColor ?? '#ff1744',
          colorWritable: true,
          brightness: Math.round(brightnessSchema.parse(brightnessPayload).value * 100),
          brightnessWritable: true,
          profileMode: mode,
          source: 'software',
        },
    onboardMemory: {
      writable: true,
      enabled: mode === 'onboard',
      activeProfile: directory.activeProfile,
    },
  };
}

export async function writeG502Control(
  agentDeviceId: string,
  device: Device,
  change: DeviceControlChange,
): Promise<void> {
  if (change.type === 'onboard-memory') {
    await setLogitechAgent(`/onboard_profiles/${agentDeviceId}/onboard_mode`, {
      mode: change.enabled ? 'ONBOARD' : 'HOST',
    });
    return;
  }

  const softwareOnly = new Set<DeviceControlChange['type']>([
    'dpi',
    'dpi-stages',
    'dpi-shift',
    'report-rate',
    'button-assignment',
    'lighting-enabled',
    'lighting-color',
    'lighting-effect',
  ]);
  if (softwareOnly.has(change.type)) await assertSoftwareMode(agentDeviceId);

  if (change.type === 'dpi') {
    validateDpi(device, change.value);
    await writeMouseSettings((settings) => {
      settings.dpiTable.activeDpi = change.value;
      if (!settings.dpiTable.levels.includes(change.value)) {
        settings.dpiTable.levels = [...settings.dpiTable.levels, change.value].sort((a, b) => a - b);
      }
    });
    return;
  }

  if (change.type === 'dpi-stages') {
    const capability = device.capabilities.dpi;
    if (!capability) throw new Error('This device does not expose DPI stages.');
    const stages = [...new Set(change.stages)].sort((a, b) => a - b);
    if (stages.length > (capability.maxStages ?? 5)) throw new Error('The device rejected too many DPI stages.');
    stages.forEach((value) => validateDpi(device, value));
    await writeMouseSettings((settings) => {
      settings.dpiTable.levels = stages;
      if (!stages.includes(settings.dpiTable.activeDpi)) settings.dpiTable.activeDpi = stages[0]!;
      if (!stages.includes(settings.dpiTable.defaultDpi)) settings.dpiTable.defaultDpi = stages[0]!;
      if (!stages.includes(settings.dpiTable.shiftDpi)) settings.dpiTable.shiftDpi = stages[0]!;
    });
    return;
  }

  if (change.type === 'dpi-shift') {
    validateDpi(device, change.value);
    await writeMouseSettings((settings) => {
      settings.dpiTable.shiftDpi = change.value;
    });
    return;
  }

  if (change.type === 'report-rate') {
    const capability = device.capabilities.reportRate;
    if (!capability?.supportedRates.includes(change.value)) throw new Error('That report rate is unavailable for this connection.');
    await writeMouseSettings((settings) => {
      settings.reportRate.value = change.value;
    });
    return;
  }

  if (change.type === 'button-assignment') {
    const capability = device.capabilities.buttonAssignments;
    const binding = capability?.bindings.find((candidate) => candidate.buttonId === change.buttonId);
    if (!binding || !capability?.availableActions.some((action) => action.id === change.actionId && action.selectable !== false)) {
      throw new Error('That button assignment is not supported by this device.');
    }
    const bundle = await loadSoftwareProfile();
    const prefix = cardLibraryPrefix(bundle.profile.assignments);
    const suffix = g502ActionCardSuffixes[change.actionId];
    if (!prefix || !suffix) throw new Error('The Logitech standard action library is unavailable.');
    const card = cardSchema.parse(await getLogitechAgent('/card', { id: `${prefix}${suffix}` }));
    await setLogitechAgent('/assignment', {
      profile: bundle.profile.id,
      slotId: binding.slotId,
      card,
    });
    return;
  }

  if (change.type === 'lighting-enabled') {
    if (change.enabled) {
      await startSolidViewer(agentDeviceId, device.capabilities.lighting?.color ?? '#ff1744');
    } else {
      await stopViewer(agentDeviceId);
      await setFirmwareLightingOff().catch(() => undefined);
    }
    return;
  }

  if (change.type === 'lighting-color') {
    await startSolidViewer(agentDeviceId, change.color);
    return;
  }

  if (change.type === 'lighting-brightness') {
    if (!device.capabilities.lighting?.brightnessWritable) throw new Error('Lighting brightness is not writable in this profile mode.');
    await setLogitechAgent(`/lighting/${agentDeviceId}/brightness`, { value: change.brightness / 100 });
    return;
  }

  if (change.type === 'lighting-effect') {
    if (change.effectId !== 'solid') throw new Error('That lighting effect is not supported by this device.');
    await startSolidViewer(agentDeviceId, device.capabilities.lighting?.color ?? '#ff1744');
  }
}

function buildSoftwareBindings(profile: LogitechProfile): ButtonAssignmentBinding[] {
  return g502XPlusBindings.map((binding) => {
    const assignment = profile.assignments.find((candidate) => candidate.slotId === binding.slotId);
    return {
      ...binding,
      currentActionId: actionIdFromCardId(assignment?.cardId) ?? 'system.custom',
    };
  });
}

function buildOnboardBindings(profile: OnboardProfile | undefined): ButtonAssignmentBinding[] {
  const mappingIndexes: Record<string, number> = {
    primary: 0,
    secondary: 1,
    wheel: 2,
    back: 3,
    'dpi-shift': 4,
    forward: 5,
  };
  return g502XPlusBindings.map((binding) => ({
    ...binding,
    currentActionId: onboardActionId(profile?.buttonMappings[mappingIndexes[binding.buttonId] ?? -1]) ?? 'system.custom',
  }));
}

function onboardActionId(mapping: z.infer<typeof onboardButtonMappingSchema> | undefined): string | undefined {
  if (!mapping) return undefined;
  if (mapping.button >= 1 && mapping.button <= 5) {
    return [
      '',
      'mouse.primary-click',
      'mouse.secondary-click',
      'mouse.middle-click',
      'mouse.back',
      'mouse.forward',
    ][mapping.button];
  }
  const action = mapping.macro?.mouse?.action;
  if (action === 'DPI_SHIFT') return 'mouse.dpi-shift';
  if (action === 'DPI_UP') return 'mouse.dpi-up';
  if (action === 'DPI_DOWN') return 'mouse.dpi-down';
  return undefined;
}

function withCurrentCustomAction(bindings: ButtonAssignmentBinding[]): MouseAction[] {
  if (!bindings.some((binding) => binding.currentActionId === 'system.custom')) return structuredClone(g502XPlusActions);
  return [
    ...structuredClone(g502XPlusActions),
    {
      id: 'system.custom',
      label: 'Custom G HUB assignment',
      category: 'system',
      searchTerms: ['custom', 'macro'],
      selectable: false,
    },
  ];
}

async function loadSoftwareProfile(): Promise<SoftwareProfileBundle> {
  const active = z.object({ id: z.string().min(1) }).parse(await getLogitechAgent('/profile/active'));
  const profile = profileSchema.parse(await getLogitechAgent('/profile', { id: active.id }));
  const mouseAssignment = profile.assignments.find(
    (assignment) => assignment.slotId === `${g502XPlusDefinition.slotPrefix}_mouse_settings`,
  );
  if (!mouseAssignment) throw new Error('The active Logitech profile has no mouse-settings card.');
  const mouseCard = cardSchema.parse(await getLogitechAgent('/card', { id: mouseAssignment.cardId }));
  if (!mouseCard.mouseSettings) throw new Error('The Logitech mouse-settings card is invalid.');
  return { profile, mouseCard };
}

async function writeMouseSettings(mutator: (settings: z.infer<typeof mouseSettingsSchema>) => void): Promise<void> {
  const bundle = await loadSoftwareProfile();
  const settings = structuredClone(bundle.mouseCard.mouseSettings);
  if (!settings) throw new Error('The active Logitech profile has no mouse settings.');
  mutator(settings);
  await setLogitechAgent('/card', { ...bundle.mouseCard, mouseSettings: settings });
}

async function assertSoftwareMode(agentDeviceId: string): Promise<void> {
  const mode = onboardModeSchema.parse(await getLogitechAgent(`/onboard_profiles/${agentDeviceId}/onboard_mode`));
  if (mode.mode === 'ONBOARD') throw new Error('Turn off onboard memory before editing the software profile.');
}

async function startSolidViewer(agentDeviceId: string, color: string): Promise<void> {
  await stopViewer(agentDeviceId);
  const rgba = hexToColor(color);
  await setLogitechAgent('/lighting/viewer', {
    devices: [agentDeviceId],
    effectPackage: { prefab: { id: '37dd7c07-8ad3-44da-b88e-8d368872c9c8' } },
    effectMetadata: {
      deviceSupport: ['MOUSE_RGB_PER_KEY'],
      duration: 0,
      type: 'SOLID',
      solidMetadata: { color: { rgba: { ...rgba, alpha: 1 }, tag: '' } },
    },
    actionType: 'START',
    streaming: { enabled: true },
  });
}

async function stopViewer(agentDeviceId: string): Promise<void> {
  await removeLogitechAgent('/lighting/viewer', { devices: [agentDeviceId] }).catch(() => undefined);
}

async function setFirmwareLightingOff(): Promise<void> {
  const bundle = await loadSoftwareProfile();
  const assignment = bundle.profile.assignments.find(
    (candidate) => candidate.slotId === `${g502XPlusDefinition.slotPrefix}_lighting_setting_firmware`,
  );
  if (!assignment) return;
  const card = cardSchema.parse(await getLogitechAgent('/card', { id: assignment.cardId }));
  if (!card.firmwareLightingSettings) return;
  await setLogitechAgent('/card', {
    ...card,
    firmwareLightingSettings: {
      ...card.firmwareLightingSettings,
      effects: [{ id: 'OFF', zoneType: 'ZONE_PRIMARY', persistent: false }],
    },
  });
}

function validateDpi(device: Device, value: number): void {
  const capability = device.capabilities.dpi;
  if (!capability) throw new Error('This device does not expose DPI controls.');
  if (value < capability.min || value > capability.max || (value - capability.min) % capability.step !== 0) {
    throw new Error(`DPI must be ${capability.min}-${capability.max} in ${capability.step} DPI steps.`);
  }
}

function hexToColor(value: string): { red: number; green: number; blue: number } {
  return {
    red: Number.parseInt(value.slice(1, 3), 16) / 255,
    green: Number.parseInt(value.slice(3, 5), 16) / 255,
    blue: Number.parseInt(value.slice(5, 7), 16) / 255,
  };
}

function colorToHex(value: { red: number; green: number; blue: number } | undefined): string | undefined {
  if (!value) return undefined;
  const channel = (part: number) => Math.round(part * 255).toString(16).padStart(2, '0');
  return `#${channel(value.red)}${channel(value.green)}${channel(value.blue)}`;
}
