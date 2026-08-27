---
name: Switchboard
description: A restrained Windows control console for hardware, audio routing, and capture.
colors:
  background: "#0d1015"
  chrome: "#10141a"
  surface-1: "#141920"
  surface-2: "#161c24"
  surface-interactive: "#181e27"
  surface-hover: "#1d2530"
  border: "#252d38"
  border-strong: "#323c49"
  text-primary: "#f2f4f7"
  text-secondary: "#a1aab7"
  text-description: "#7d8795"
  text-muted: "#697586"
  accent-brand: "#f05d7d"
  accent-hover: "#ff6b8b"
  status-success: "#5cc69b"
  status-info: "#6c9eff"
  status-warning: "#e5b567"
  status-danger: "#e96969"
  status-neutral: "#586474"
  channel-game: "#53bfae"
  channel-chat: "#6f9fe8"
  channel-media: "#a889dc"
  channel-microphone: "#dda65a"
  eq-band-1: "#d9788d"
  eq-band-2: "#c69a62"
  eq-band-3: "#61b394"
  eq-band-4: "#6f98c7"
  eq-band-5: "#927fc9"
  eq-band-6: "#b47791"
  eq-band-7: "#8290a2"
  eq-band-8: "#a98967"
typography:
  display:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: 1.35
  body:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, Segoe UI, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1.35
rounded:
  xs: "2px"
  sm: "4px"
  md: "7px"
  lg: "8px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  workspace-gutter: "clamp(20px, 2.5vw, 42px)"
components:
  button-primary:
    backgroundColor: "{colors.accent-brand}"
    textColor: "#260b12"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.surface-interactive}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "36px"
    padding: "0 16px"
  select-trigger:
    backgroundColor: "{colors.surface-interactive}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 10px"
  audio-tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-description}"
    typography: "{typography.label}"
    rounded: "{rounded.xs}"
    height: "54px"
    padding: "0 18px"
  processing-module:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
---

# Design System: Switchboard

## Overview

**Creative North Star: "The Wide Sonar Console"**

Switchboard is an ink-black Windows control surface with the calm legibility of studio equipment. Graphite modules, fine steel dividers, crisp utility type, and sparse semantic color make complex hardware and audio state readable without turning the product into a generic dashboard or gaming spectacle.

The interface is continuous and operational. Users select a path, act on one prominent instrument, then follow the signal flow into large plain-language controls. Capability truth is part of the visual system: unavailable, disabled, pending, error, and selected states remain explicit and survive canonical state round trips.

**Key Characteristics:**

- Continuous console composition with visible signal flow
- Full-width audio instruments followed by generous processing modules
- Ink, graphite, and steel surfaces with coral interaction states
- Stable semantic colors for channels and EQ bands
- Tight utility typography, thin dividers, and restrained corners
- No ornamental effects competing with live controls

## Colors

The palette is nearly black and cool-neutral; coral marks interaction while channel, EQ, and status colors carry stable operational meaning.

### Primary

- **Signal Coral:** Reserved for active controls, selection indicators, focus, and the master mixer path. It is an interaction color, not ambient decoration.
- **Live Coral:** The brighter hover counterpart for primary actions.

### Secondary

- **Game Teal, Chat Blue, Media Violet, and Microphone Amber:** Stable channel identities used on mixer meters, fader ranges, icons, and related readouts.
- **Success Mint, Information Blue, Warning Amber, and Danger Red:** Semantic status colors used only with text, icons, or structure that also communicates meaning.

### Tertiary

- **Eight-Band Spectrum:** Muted rose, ochre, green, blue, violet, mauve, steel, and umber distinguish individual EQ nodes and their band selectors. Selection always adds shape, size, text, or surface treatment.

### Neutral

- **Ink Background and Chrome:** Form the application shell and persistent navigation.
- **Graphite Surfaces:** Separate instruments, processing modules, popovers, and interactive fields through small tonal steps.
- **Steel Dividers:** Define functional boundaries with one-pixel rules.
- **Primary, Secondary, Description, and Muted Text:** Preserve a four-step information hierarchy without opacity hacks.

### Named Rules

**The Coral Is Interaction Rule.** Coral appears where the user can act or where a primary state is active; it never becomes ambient decoration.

**The Stable Channel Identity Rule.** Master is coral, Game is teal, Chat is blue, Media is violet, and Microphone is amber everywhere those channels appear.

**The Band Identity Rule.** Every EQ band keeps its assigned color, but no selected or enabled state may rely on color alone.

## Typography

**Display Font:** Inter Variable (with Inter, system UI, and Segoe UI fallbacks)  
**Body Font:** Inter Variable (with Inter, system UI, and Segoe UI fallbacks)  
**Label/Mono Font:** Cascadia Mono is reserved for diagnostics and low-level identifiers.

**Character:** Compact, neutral, and highly legible. Weight, spacing, and tabular numerals do the work; decorative display type would undermine the desktop-tool character.

### Hierarchy

- **Display** (700, 20px, 1.2): Route and workspace headings.
- **Title** (650, 14px, 1.35): Instrument, processing-module, and setting titles.
- **Body** (400, 11px, 1.45): Plain-language explanations, availability copy, and supporting descriptions; keep lines near 48–68 characters where practical.
- **Label** (600, 10.5px, 1.35): Tabs, field labels, compact state text, and utility controls.
- **Numeric Readout** (620–690, tabular numerals): Levels, percentages, decibels, frequencies, and timing values.

### Named Rules

**The Utility Before Theater Rule.** Type is compact and direct; hierarchy comes from weight and contrast, never oversized headings or decorative typography.

## Layout

Switchboard uses a fixed application shell with a continuous work area, not a card dashboard. Audio path tabs occupy a quiet 54px text rail. Workspaces span the available width with responsive horizontal gutters from 20px to 42px and deliberate vertical space.

Game, Chat, Media, and Microphone place the EQ first as a full-width instrument. The graph is 300–390px high in the wide layout and 286px at the 1180px console breakpoint. Processing follows below in a two-column grid of large modules; below 860px, it becomes one column and the EQ inspector becomes two columns. The mixer remains one uninterrupted desk divided into channels rather than separate cards.

The supported minimum is 1080 × 720, the standard review size is 1420 × 900, and the wide review size is 1920 × 1080. At 1080 × 720, critical status and routine audio controls remain in the first view without page-level horizontal overflow.

**The Instrument Leads Rule.** Each audio path is led by one broad instrument; never compress the EQ into a side rail or place routine processing ahead of it.

**The Continuous Desk Rule.** Related controls share aligned rows and dividers. Surfaces mark real functional boundaries, not decorative card nesting.

## Elevation & Depth

The interface is flat by default. Depth comes from the ink-to-graphite tonal ladder, one-pixel steel dividers, and rare inset focus or selection rings. Routine modules and mixer channels do not cast shadows. Shadows are limited to transient overlays and the physical-looking mixer fader thumb.

### Shadow Vocabulary

- **Fader Thumb** (0 1px 2px rgb(0 0 0 / 38%)): Gives the draggable hardware affordance a small tactile lift.
- **Transient Overlay** (0 14px 32px rgb(0 0 0 / 30%)): Separates dialogs and popovers from the continuous console.

### Named Rules

**The Flat At Rest Rule.** Persistent surfaces use tone and dividers; shadow is reserved for transient elevation or a draggable physical control.

## Shapes

Corners are restrained and functional. Tiny controls and fields use 2–4px radii; primary modules use 7px; bounded composite surfaces and overlays may use 8px. Circular geometry is reserved for knobs, EQ nodes, indicators, and switch thumbs. Pill-shaped text containers, giant radii, decorative bubbles, and ornamental icon boxes do not belong in Switchboard.

Thin one-pixel borders and dividers are the default boundary. The mixer is a single 8px outer frame with square internal channel joins.

## Components

Shared shadcn and Radix primitives remain the base. Components preserve semantic HTML, visible focus, keyboard operation, disabled behavior, and narrow typed state transitions.

### Buttons

- **Shape:** Compact rectangular controls with gently restrained corners (4px).
- **Primary:** Coral fill, dark foreground, and 36px height; reserve for the clearest committed action.
- **Secondary:** Graphite fill with a steel border; hover strengthens both surface and border.
- **Ghost:** Transparent at rest and tonal on hover; use for icon utilities and reversible secondary actions.
- **Focus / Disabled:** Use a two-pixel coral-tinted focus ring. Disabled controls remain visible at reduced contrast and do not accept pointer input.

### Inputs / Fields

- **Style:** Graphite interactive fill, steel border, compact 34px height, and 4px corners.
- **Focus:** Strengthen the border or add a restrained two-pixel coral-tinted ring.
- **Unavailable / Disabled:** Keep the current or placeholder value readable and expose the reason nearby; never replace capability truth with a convincing inert field.

### Navigation

- **Audio path tabs:** Simple text labels in a 54px rail. Active state combines primary text with a two-pixel coral underline; hover uses a quiet graphite tint. Arrow keys, Home, and End move focus.
- **Application navigation:** Persistent, compact, and visually subordinate to the working surface. Active state is explicit and focus remains visible.

### Switches and Semantic Choices

Switches represent booleans and pair the thumb movement with explicit On/Off text where space allows. Small discrete sets use exposed segmented choices. Selected choices combine tinted surface, text, and structural state; pending and disabled states remain distinguishable.

### Processing Modules

Large plain-language modules follow the primary instrument. A module uses graphite surface, a one-pixel steel boundary, 7px corners, and 14–16px internal padding. Technical names may appear as secondary labels, while ordinary descriptions explain outcomes first.

### Parametric EQ

The EQ is the signature audio instrument: full-width graph, frequency-region labels, draggable colored nodes, a band rail, and an inspector. Hover and selection enlarge nodes; selected band buttons add a tinted surface and reinforced label treatment. Disabled state dims the entire instrument without erasing its shape or current values.

### Mixer

The mixer is one continuous bounded desk with channel separators. Faders and meters use stable channel colors, exact numeric readouts use tabular figures, and the fader thumb is the only persistent control with a tactile shadow. Muted channels are structurally dimmed as well as labeled.

## Do's and Don'ts

### Do:

- **Do** lead each Game, Chat, Media, and Microphone path with its full-width EQ.
- **Do** keep routine controls, current state, recovery actions, signal chain, meters, faders, and unavailable reasons visible.
- **Do** preserve stable channel and EQ-band colors while adding non-color state cues.
- **Do** use switches, segmented choices, faders, sliders, and graphs for the values they are designed to control.
- **Do** verify 1080 × 720, 1420 × 900, and 1920 × 1080 without horizontal overflow.
- **Do** extend existing shared shadcn/Radix primitives and the canonical audio contracts.

### Don't:

- **Don't** return audio processing to a compressed side rail or hide routine work behind repeated disclosure.
- **Don't** restyle Switchboard as a website, generic dashboard, gaming overlay, or component-library showcase.
- **Don't** use gradients, glow, glassmorphism, neon, decorative blur, ambient visualizers, ornamental animation, or routine shadows.
- **Don't** introduce card grids, nested cards, pill-shaped text containers, giant radii, or decorative icon boxes.
- **Don't** fabricate controls, telemetry, search, hardware capability, audio routing, or capture state.
- **Don't** expose low-level identifiers outside diagnostics or bypass Electron's canonical state ownership.

