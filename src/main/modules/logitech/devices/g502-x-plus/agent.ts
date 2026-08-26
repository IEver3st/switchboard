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
      fixedParams: z.object({
        color: z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i) }),
      }).optional(),
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

const onboardModeSchema = z.object({
  mode: z.enum(['HOST', 'ONBOARD']).optional(),
  enabled: z.boolean().optional(),
});
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
type LogitechProfile = z.infer<typeof profileSchema>;
type LogitechCard = z.infer<typeof cardSchema>;
type OnboardProfile = z.infer<typeof onboardProfileSchema>;

interface SoftwareProfileBundle {
  profile: LogitechProfile;
  mouseCard: LogitechCard;
  lightingCard?: LogitechCard;
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
  const bundle = await loadSoftwareProfile();

  const mouseInfo = mouseInfoSchema.parse(mouseInfoPayload);
  const mode = isOnboardMode(onboardModeSchema.parse(modePayload)) ? 'onboard' : 'software';
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
  const firmwareEffect = bundle.lightingCard?.firmwareLightingSettings?.effects[0];
  const softwareLightingWritable = !firmwareEffect || ['OFF', 'FIXED'].includes(firmwareEffect.id);
  const firmwareColor = firmwareEffect?.id === 'FIXED' ? firmwareEffect.fixedParams?.color.hex : undefined;
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
          writable: softwareLightingWritable,
          enabled: Boolean(firmwareEffect && firmwareEffect.id !== 'OFF'),
          activeEffectId: softwareLightingWritable ? 'solid' : firmwareEffect?.id.toLowerCase() ?? 'profile',
          availableEffects: softwareLightingWritable
            ? [{ id: 'solid', label: 'Static' }]
            : [{ id: firmwareEffect?.id.toLowerCase() ?? 'profile', label: 'Existing G HUB effect' }],
          color: firmwareColor ?? previousColor,
          colorWritable: softwareLightingWritable,
          brightness: Math.round(brightnessSchema.parse(brightnessPayload).value * 100),
          brightnessWritable: true,
          profileMode: mode,
          source: 'firmware',
          unavailableReason: softwareLightingWritable
            ? undefined
            : 'This profile uses a G HUB lighting effect that Switchboard does not overwrite automatically.',
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
    await waitForOnboardMode(agentDeviceId, change.enabled ? 'ONBOARD' : 'HOST');
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
    assertLightingWritable(device);
    if (change.enabled) {
      await setFirmwareLightingSolid(device.capabilities.lighting?.color ?? '#ff1744');
    } else {
      await setFirmwareLightingOff();
    }
    return;
  }

  if (change.type === 'lighting-color') {
    assertLightingWritable(device);
    await setFirmwareLightingSolid(change.color);
    return;
  }

  if (change.type === 'lighting-brightness') {
    if (!device.capabilities.lighting?.brightnessWritable) throw new Error('Lighting brightness is not writable in this profile mode.');
    await setLogitechAgent(`/lighting/${agentDeviceId}/brightness`, { value: change.brightness / 100 });
    return;
  }

  if (change.type === 'lighting-effect') {
    assertLightingWritable(device);
    if (change.effectId !== 'solid') throw new Error('That lighting effect is not supported by this device.');
    await setFirmwareLightingSolid(device.capabilities.lighting?.color ?? '#ff1744');
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
  const lightingAssignment = profile.assignments.find(
    (assignment) => assignment.slotId === `${g502XPlusDefinition.slotPrefix}_lighting_setting_firmware`,
  );
  const lightingCard = lightingAssignment
    ? cardSchema.parse(await getLogitechAgent('/card', { id: lightingAssignment.cardId }))
    : undefined;
  return { profile, mouseCard, lightingCard };
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
  if (isOnboardMode(mode)) throw new Error('Turn off onboard memory before editing the software profile.');
}

async function waitForOnboardMode(agentDeviceId: string, expected: 'HOST' | 'ONBOARD'): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) await delay(250);
    try {
      const result = onboardModeSchema.parse(
        await getLogitechAgent(`/onboard_profiles/${agentDeviceId}/onboard_mode`),
      );
      const actual = isOnboardMode(result) ? 'ONBOARD' : 'HOST';
      if (actual === expected) {
        // The mode response leads the mouse and lighting endpoints slightly.
        // Give the agent one beat to re-register them before discovery resumes.
        await delay(250);
        return;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Logitech did not enter ${expected.toLowerCase()} profile mode.`, { cause: lastError });
}

function isOnboardMode(value: z.infer<typeof onboardModeSchema>): boolean {
  return value.mode === 'ONBOARD' || value.enabled === true;
}

async function setFirmwareLightingOff(): Promise<void> {
  await writeFirmwareLightingEffect({ id: 'OFF', zoneType: 'ZONE_PRIMARY', persistent: false });
}

async function setFirmwareLightingSolid(color: string): Promise<void> {
  await writeFirmwareLightingEffect({
    id: 'FIXED',
    zoneType: 'ZONE_PRIMARY',
    persistent: false,
    fixedParams: { color: { hex: color.toUpperCase() } },
  });
}

async function writeFirmwareLightingEffect(
  effect: NonNullable<LogitechCard['firmwareLightingSettings']>['effects'][number],
): Promise<void> {
  const bundle = await loadSoftwareProfile();
  const card = bundle.lightingCard;
  if (!card) throw new Error('The active Logitech profile has no lighting card.');
  if (!card.firmwareLightingSettings) return;
  await setLogitechAgent('/card', {
    ...card,
    firmwareLightingSettings: {
      ...card.firmwareLightingSettings,
      effects: [effect],
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

function assertLightingWritable(device: Device): void {
  if (!device.capabilities.lighting?.writable) {
    throw new Error(device.capabilities.lighting?.unavailableReason ?? 'Lighting is not writable in this profile mode.');
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
