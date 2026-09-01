import { devicesAsync } from 'node-hid';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enumerateWindowsHidDevices } from '../src/main/services/windows-hid-enumerator';
import {
  huntsmanV2AnalogProductId,
  razerVendorId,
  type HuntsmanLightingEffectId,
} from '../src/main/modules/razer/huntsman-v2-analog-protocol';
import { HuntsmanV2AnalogTransport } from '../src/main/modules/razer/huntsman-v2-analog-transport';

if (process.argv.includes('--worker')) await verifyHardware();
else await runIsolatedVerifier();

async function runIsolatedVerifier(): Promise<void> {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Razer hardware verification timed out before a complete baseline could be restored.'));
    }, 30_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Razer hardware verifier exited with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

async function verifyHardware(): Promise<void> {
const hidDevices = process.platform === 'win32' ? await enumerateWindowsHidDevices() : await devicesAsync();
const descriptors = hidDevices.filter((descriptor) => (
  descriptor.vendorId === razerVendorId && descriptor.productId === huntsmanV2AnalogProductId
));
const endpoint = descriptors.find((descriptor) => (
  descriptor.interface === 3
  && descriptor.usagePage === 0x0c
  && descriptor.usage === 0x01
  && descriptor.path
));

if (!endpoint?.path) {
  throw new Error('Huntsman V2 Analog control endpoint was not found.');
}

const transport = new HuntsmanV2AnalogTransport();
try {
const original = await transport.probe(endpoint.path);
const restorationErrors: string[] = [];
const checks: Record<string, unknown> = {
  endpoint: 'ready',
  firmware: original.firmwareVersion ?? 'unavailable',
  serialRead: Boolean(original.serialNumber),
  readFailures: original.readFailures,
};

console.log(JSON.stringify({
  baseline: {
    endpoint: checks.endpoint,
    firmware: checks.firmware,
    serialRead: checks.serialRead,
    brightness: original.brightness,
    gamingMode: original.gamingMode,
    activeOnboardProfileId: original.activeOnboardProfileId,
    lightingEffect: original.lightingState?.effectId,
    lightingColor: original.lightingState?.color,
    readFailures: original.readFailures,
  },
}, null, 2));

if (Object.keys(original.readFailures).length > 0) {
  throw new Error('The keyboard baseline was incomplete; no hardware writes were attempted.');
}

let brightnessChanged = false;
let gamingModeChanged = false;
let profileChanged = false;
let effectChanged = false;

try {
  if (original.brightness !== undefined) {
    const candidate = original.brightness >= 100 ? 99 : original.brightness + 1;
    brightnessChanged = true;
    checks.brightnessWriteReadback = await transport.setBrightness(endpoint.path, candidate);
  }

  if (original.gamingMode !== undefined) {
    gamingModeChanged = true;
    checks.gamingModeWriteReadback = await transport.setGamingMode(endpoint.path, !original.gamingMode);
  }

  if (original.lightingState) {
    const candidateEffect: HuntsmanLightingEffectId = original.lightingState.effectId === 'static' ? 'spectrum' : 'static';
    effectChanged = true;
    checks.effectWriteReadback = await transport.setEffect(
      endpoint.path,
      candidateEffect,
      original.lightingState.color ?? '#44aaff',
    );
  }

  const alternateProfile = original.onboardProfileIds?.find((profileId) => profileId !== original.activeOnboardProfileId);
  if (alternateProfile !== undefined) {
    profileChanged = true;
    checks.profileWriteReadback = await transport.setActiveOnboardProfile(endpoint.path, alternateProfile);
  }
} finally {
  if (profileChanged && original.activeOnboardProfileId !== undefined) {
    await restore('onboard profile', () => transport.setActiveOnboardProfile(endpoint.path!, original.activeOnboardProfileId!));
  }
  if (effectChanged && original.lightingState) {
    await restore('lighting effect', () => transport.setEffect(
      endpoint.path!,
      original.lightingState!.effectId,
      original.lightingState!.color ?? '#44aaff',
    ));
  }
  if (gamingModeChanged && original.gamingMode !== undefined) {
    await restore('Gaming Mode', () => transport.setGamingMode(endpoint.path!, original.gamingMode!));
  }
  if (brightnessChanged && original.brightness !== undefined) {
    await restore('brightness', () => transport.setBrightness(endpoint.path!, original.brightness!));
  }
}

const restored = await transport.probe(endpoint.path);
checks.restored = {
  brightness: original.brightness === undefined ? 'not-tested' : restored.brightness === original.brightness,
  gamingMode: original.gamingMode === undefined ? 'not-tested' : restored.gamingMode === original.gamingMode,
  onboardProfile: original.activeOnboardProfileId === undefined
    ? 'not-tested'
    : restored.activeOnboardProfileId === original.activeOnboardProfileId,
  lightingEffect: original.lightingState === undefined
    ? 'not-tested'
    : restored.lightingState?.effectId === original.lightingState.effectId,
  lightingColor: !original.lightingState?.color
    || restored.lightingState?.color?.toLowerCase() === original.lightingState.color.toLowerCase(),
};

console.log(JSON.stringify(checks, null, 2));

if (restorationErrors.length > 0 || Object.values(checks.restored).includes(false)) {
  throw new Error(`Razer hardware state restoration failed: ${restorationErrors.join('; ') || 'readback mismatch'}`);
}

async function restore(label: string, operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    restorationErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
} finally {
  await transport.release();
}
}
