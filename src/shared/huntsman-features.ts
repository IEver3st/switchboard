import type { KeyboardFeature } from './contracts';

// Razer model support checked 2026-09-04:
// https://www.razer.com/technology/razer-snap-tap
// https://www.razer.com/technology/rapid-trigger-mode
export const huntsmanKeyboardFeatures: readonly KeyboardFeature[] = [
  {
    id: 'lighting',
    label: 'Quick lighting',
    summary: 'Brightness and device-firmware quick effects use the native HID control endpoint.',
    status: 'native',
  },
  {
    id: 'actuation',
    label: 'Per-key actuation',
    summary: 'Adjustable 1.5–3.6 mm actuation and two-stage inputs are supported by the keyboard.',
    status: 'synapse',
    unavailableReason: 'The actuation protocol is not safely documented or verified for direct writes yet.',
  },
  {
    id: 'analog',
    label: 'Analog input',
    summary: 'Selected keys can emulate joystick axes and controller triggers.',
    status: 'synapse',
    unavailableReason: 'Analog mapping remains owned by Synapse until its native profile format is verified.',
  },
  {
    id: 'mapping',
    label: 'Key mapping',
    summary: 'Remapping, macros, Hypershift, and analog controller bindings remain in Synapse.',
    status: 'synapse',
    unavailableReason: 'Switchboard does not write undocumented key maps or macro payloads.',
  },
  {
    id: 'rapid-trigger',
    label: 'Rapid Trigger',
    summary: 'Resets keys as you release them. Requires Razer Synapse running on this model.',
    status: 'synapse',
    unavailableReason: 'Configure in Synapse. Switchboard cannot control Rapid Trigger yet.',
  },
  {
    id: 'rapid-input',
    label: 'Snap Tap',
    summary: 'Razer does not currently support Snap Tap on the Huntsman V2 Analog.',
    status: 'unsupported',
    unavailableReason: 'Not available for this model, including in Synapse.',
  },
] as const;
