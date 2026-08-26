---
name: Switchboard
description: "A compact Windows routing console for hardware, audio, capture, and modular engines."
colors:
  canvas: "#0d1015"
  chrome: "#10141a"
  work-surface: "#141920"
  raised-surface: "#161c24"
  interactive-surface: "#181e27"
  hover-surface: "#1d2530"
  hairline: "#252d38"
  hairline-strong: "#323c49"
  primary-text: "#f2f4f7"
  secondary-text: "#a1aab7"
  description-text: "#7d8795"
  muted-text: "#697586"
  signal-pink: "#f05d7d"
  signal-pink-hover: "#ff6b8b"
  signal-good: "#5cc69b"
  signal-warning: "#e5b567"
  signal-danger: "#e96969"
  channel-game: "#53bfae"
  channel-chat: "#6f9fe8"
  channel-media: "#a889dc"
  channel-microphone: "#dda65a"
typography:
  family: '"Inter Variable", Inter, "Segoe UI", system-ui, sans-serif'
  page-title: "14px / 600"
  section-title: "12-13px / 600"
  body: "11-12px / 400"
  label: "10-11px / 500"
  technical: "9-10px / 500, tabular numerals"
radii:
  control: "4px"
  surface: "8px maximum"
  overlay: "10px maximum"
spacing:
  unit: "4px"
  control-gap: "8px"
  section-gap: "16px"
  page-padding: "20px"
supported-windows:
  minimum: "1080x720"
  standard: "1420x900"
  large: "1920x1080"
---

# Design system: Switchboard

Read this entire document before creating, changing, or reviewing any renderer UI. It is the product's taste, written down. When a decision is not covered here, resolve it by the philosophy in section 1, not by habit from other apps.

Explicit user direction can override this document for a task. Record the exception and its reason in the affected section instead of silently creating a second design language.

## 1. Philosophy

**North star: the routing console.** Switchboard is a professional control surface that happens to be easy: the restraint of a broadcast console, the clarity of a first-party hardware utility, the compactness of a Windows tool that stays open all day. It is never a website, a dashboard template, a settings form, a gaming HUD, or a demo of a component library.

Five taste principles govern every screen:

1. **The instrument, not the brochure.** The page exists to do work. The main control (fader, EQ graph, device render, save button) is the visual center and gets the most space, the strongest contrast, and the best position. Everything else is supporting structure.
2. **Hierarchy through subtraction.** Position, alignment, type, and spacing create order. Boxes, colors, badges, and big type are spent last and sparingly. If every section has a border and a heading treatment, none of them do.
3. **Density with air.** Compact means related things sit close and unrelated things sit apart. It never means shrunk text, cramped controls, or hidden state. Whitespace is a grouping tool, not wasted space.
4. **Truth over theater.** Every control reflects a real capability and completes a real state transition. Every meter shows real data. Unavailable things are absent or visibly unavailable with a reason. A convincing but inert control is the worst object in the product.
5. **One accent, few signals.** Signal pink means interaction: selection, focus, active range, primary action. Channel identity colors (game, chat, media, microphone) mean "this belongs to that channel" and appear only on audio surfaces. Status colors mean state. Neutral gray is the default for everything else.

Make design decisions in this order:

1. Put the right information and action in the right place.
2. Tell the truth about capability, state, cost, and failure.
3. Keep common work visible and close together.
4. Establish hierarchy through alignment, type, and spacing.
5. Apply restrained visual polish.

Decoration never compensates for weak information architecture. Minimalism is not permission to hide useful state, and density is not permission to erase hierarchy.

**Reference bar.** Mature first-party audio and hardware utilities set the usability bar. Borrow their information architecture (what sits next to what, what is always visible, what is one click away) and express it with Switchboard's own tokens, controls, and copy. Never copy another product pixel-for-pixel.

## 2. The element admission test

Before adding any visible element, answer:

1. Which user decision, action, comparison, or recovery does it support?
2. Is its information absent from the surrounding label, value, state, and structure?
3. What canonical contract, measured value, or real action backs it?
4. Is it primary, secondary, or diagnostic, and does its prominence match that role?
5. Must it be visible with related controls, or is disclosure genuinely beneficial?
6. Does it still earn its space at 1080 x 720?
7. Can alignment, whitespace, or one hairline communicate the group without another container?

If questions 1-4 have no specific answers, omit the element. If question 7 is yes, remove the container.

## 3. Core DOs and DON'Ts

Each DON'T names the failure; the paired DO names the target. Do the DO; the DON'T exists so you recognize the failure when you see it.

### Composition

- **DO** build pages as continuous workbenches: open sections, aligned rows, shared baselines, one hairline at a genuine boundary.
  **DON'T** ship card grids, nested cards, a card per setting or metric, or bordered boxes around every section.
- **DO** give a region a bounded `Surface` only when it independently scrolls, changes state as a unit, or is interacted with as a unit.
  **DON'T** nest `Surface` inside `Surface` for appearance, or stack bordered panels inside bordered panels.
- **DO** let the primary work area dominate the window.
  **DON'T** build a hero header, giant empty page title, or marketing-style intro block above a small work area.

Example, composition of a settings region:

```
GOOD                                  BAD
Volume leveling                [On]   +-----------------------------+
Keeps quiet and loud moments          |  +-+  Volume leveling       |
closer together.  Natural|Balanced    |  |i|  Keeps things level.   |
                                      |  +-+              (toggle)  |
Output safety                  [On]   +-----------------------------+
Prevents clipping and peaks.          +-----------------------------+
                                      |  +-+  Output safety         |
                                      |  |i|               (toggle) |
                                      +-----------------------------+
Plain rows separated by one           One bordered card per setting,
hairline group boundary.              decorative icon box, duplicated
                                      boundary, dead padding.
```

### Color and channel identity

- **DO** keep the canvas uninterrupted and neutral; use tone changes (surface-1, surface-2, interactive, hover) for structure.
- **DO** reserve signal pink for interaction: selected tab/control, focus ring, active slider range, primary action, rare attention.
- **DO** use channel identity colors only to mark audio channel ownership: the channel's icon/dot, its fader range, its EQ curve, its tab underline, its clip-audio legend. A muted or disabled channel falls back to neutral.
- **DO** use the canonical semantic mapping consistently across Capture, the clip editor, and audio pages: Game teal (`#53bfae`), Chat blue (`#6f9fe8`), Microphone amber (`#dda65a`), and Media violet (`#a889dc`).
  **DON'T** wash a whole panel in a channel color, tint backgrounds with it, or apply channel colors outside audio context.
- **DO** use success/warning/danger only for real semantic state (meter zones, clipping, failures, battery).
  **DON'T** use gradients, glow, glassmorphism, neon, chroma, animated RGB, or pink as a theme wash.

### Typography

- **DO** use the type scale exactly: page title 14px/600, section title 12-13px/600, body 11-12px, label 10-11px, technical values 9-10px tabular numerals. Sentence case.
- **DO** make measurements and changing values tabular-numeric and place units beside values.
  **DON'T** use hero headings, eyebrow/kicker labels, stacked subtitle+badge+helper paragraphs that repeat one point, or uppercase tracking as a default heading device. Uppercase tracking is reserved for rare technical classifications (a CLIP indicator, a diagnostic tag).

### Density and space

- **DO** follow the 4px rhythm: 8px between related controls, 16px between related sections, 24-32px between major work regions. Default control height 28-36px.
- **DO** reflow before truncating, hiding, or shrinking. At 1080 x 720 every routine control and critical state is visible without scrolling.
  **DON'T** leave dead space beside compressed controls, stretch a switch or short selector across the window, or isolate a tiny control in a large empty region.

### Controls

- **DO** choose the control from the shape of the decision (see the table in section 6).
  **DON'T** put booleans in dropdowns, 2-5 choices in selects, or continuous values in text fields.
- **DO** keep values, units, validation, and recovery adjacent to the control they belong to.
  **DON'T** make the eye shuttle across the page to connect a value with its fader, route, device, or toggle.

### States and truth

- **DO** design loading, empty, unavailable, disabled, pending, error, recovery, hover, focus, active, overflow, and reduced-motion states with the primary path.
  **DON'T** ship the happy path only.
- **DO** gate every control on capability metadata; absent or visibly-unavailable-with-reason are the only two honest presentations of an unsupported feature.
  **DON'T** render fake search, fake analytics, placeholder activity, visual-only audio controls, or React-state-only "features".
- **DO** state each status or measurement once on a page.
  **DON'T** duplicate one fact across cards, labels, banners, and badges.

### Motion

- **DO** make feedback quick and causal: hover/focus 80-140ms, selection continuity up to 180ms, disclosure up to 210ms, realtime and keyboard actions immediate.
  **DON'T** add decorative animation, bounce, float, tilt, parallax, particles, animated backgrounds, or decorative waveforms/visualizers. A realtime visualization must change a user decision, use real data, and stop subscribing and drawing when hidden or disabled.

### Consistency

- **DO** extend the shared primitive when an equivalent concept needs improvement; adapt centrally.
  **DON'T** introduce a page-specific substitute for an existing shared concept, a one-off control style, an arbitrary one-off size, or a dependency for a trivial primitive.
- **DO** iterate: inspect the rendered route, compare adjacent routes, fix the highest-impact hierarchy problem, inspect again.
  **DON'T** stop after the first acceptable-looking pass.

## 4. Information architecture

### Page contract

Each page has one primary job and one focal work area. Define before implementation:

- the primary task and the state needed to perform it;
- the routine actions that must remain directly reachable;
- the secondary options that may sit beside or below the work area;
- the diagnostic information that remains out of the normal path;
- the empty, unavailable, disabled, loading, error, and recovery states;
- the canonical state transition for every interactive control.

### Hierarchy order

1. Stable placement and shared alignment.
2. Type size, weight, and contrast.
3. Tight spacing within a group and larger spacing between groups.
4. One hairline or subtle neutral surface change when a boundary is needed.
5. Color only for selection, focus, live state, warning, failure, or clipping.

Never use a rounded shell, colored icon tile, badge, or oversized title to manufacture hierarchy.

### Disclosure

Tabs are for peer workspaces whose simultaneous visibility is not useful. Inline disclosure (`AdvancedDisclosure`) is for rare, engineer-grade parameters while context stays visible. Modals are for destructive or interruptive decisions only.

- Routine controls stay on the page. Hiding common work behind clicks, modals, accordions, or deep tabs is a design failure.
- When one audio processor is being edited, the rest of the signal chain, with enabled/bypassed state, stays visible.

## 5. Page-type guidance

### Audio pages

Audio UI is an instrument, not a settings form and not a debug console.

**Mixer (the channel console).** The mixer page is the channel columns. Each strip carries, top to bottom: channel identity (icon + name in channel color), a shortcut to its processing page, its active preset, its route (device picker), a tall fader beside a live meter with dB readouts, its mute control adjacent to the fader, and its routed apps. A balance control (ChatMix) sits below the columns as one slim bar. Everything a user touches daily is on the strip; nothing routine lives in a dialog.

**Channel processing pages (Game / Chat / Media).** One compact header row contains preset management; channel identity comes from the selected workspace tab and output routing stays on the Mixer strip so neither is repeated above the editor. The EQ is the hero: a full-width response graph with draggable band nodes, a band selector strip, and an inspector row for exact values. Below it, simple processors appear as compact toggle rows with semantic strength choices (Natural / Balanced / Strong), in signal-chain order. Engineer parameters (threshold, ratio, attack, release, LUFS) live behind one `AdvancedDisclosure`.

**Microphone page.** Same structure, plus: the processing chain order visible as a strip (input volume, gate, noise removal, EQ, consistency, safety) with enabled state per stage; noise tools as toggle + strength; monitoring as one section at the bottom.

Hard requirements:

- Keep the complete signal chain visible in order, including enabled, bypassed, unavailable, and clipping state.
- EQ is a first-class purpose-built editor whenever supported. Never reduce it to a generic slider list, tiny thumbnail, decorative background, or hidden advanced panel.
- At the minimum window, a visible channel strip keeps roughly 160px or more of usable fader travel and a legible meter with persistent peak and clipping feedback.
- Put dB values, units, peak state, and route destinations next to the fader or meter they describe.
- Meters use real data and stop subscribing, drawing, and timing when inactive or offscreen.
- No processor or route control exists unless the host supports it.
- Channel identity color marks the strip icon, fader range, EQ curve, and tab underline of its channel. Muted or unavailable channels render neutral.

### Hardware pages

Hardware is the primary subject.

- Use a real bundled or vendor-provided product render when available. Preserve aspect ratio, resolution, transparency, lighting zones, and known colorway. Resolve the correct variant from canonical hardware evidence; never recolor a render to impersonate another SKU.
- Give the render meaningful stage space at standard and large windows. Controls frame or annotate it; they do not reduce it to a thumbnail.
- Keep connection, battery, active profile, and mute state visible and close to the device identity.
- Low-level identifiers (VID/PID, HID paths, protocol details, internal IDs) belong in diagnostics-only context.
- No decorative device motion. A transform may support direct inspection, but the product never floats, bobs, tilts on hover, or burns resources while idle.

### Capture, modules, updates, and settings

- Capture emphasizes source, engine state, recording/replay readiness, storage consequence, and the primary save action. No hero banner plus vanity metrics.
- The media-library grid is an earned exception to the card prohibition: each clip is an independently selectable media object, and its 16:9 thumbnail remains visually dominant. Reflow the library to two, three, or four columns as width permits without horizontal overflow.
- Present replay state in human terms before technical detail. Put duration and favorite state over the thumbnail, keep clip metadata human-readable, and expose secondary per-clip actions through hover or focus overflow with keyboard-equivalent access.
- Keep routine capture work visible; place technical capture options under `More`. External capture-library references may inspire hierarchy and interaction, but are never cloned.
- Module management uses compact rows or a table for name, trust, size, state, and the relevant action. No marketplace card per module.
- Update and storage state are inline summaries with progress when active. No giant updater or storage cards for rare events.
- Settings use a stable category list and aligned setting rows. Search exists only when it queries a real, complete settings catalog and navigates to an actual control.
- Diagnostics stay out of the ordinary path but deliberately reachable.

## 6. Controls reference

Choose a control from the shape of the decision, not from component-library convenience.

| Need | Preferred control | Reject |
| --- | --- | --- |
| Boolean state | Switch or direct toggle with visible state | Dropdown with On/Off |
| Two to five short choices | Rectangular segmented control, radio group, or exposed buttons | Dropdown or detached pills |
| Many choices or long labels | Select, searchable picker backed by real options | Giant dropdown or fake search |
| Continuous frequent adjustment | Slider, rotary knob, or fader matching the domain | Select or text form |
| Precise numeric adjustment | Slider/knob/fader plus adjacent value and keyboard step support | Unlabelled generic slider |
| Comparable values | Aligned rows, columns, or compact table | Card per value |
| Peer workspaces | Tab rail with one selection rule | Floating tab pills |
| Rare, non-routine advanced detail | Inline disclosure when context remains visible | Accordion for routine content |
| Destructive or interruptive decision | Focused dialog with consequence and recovery | Modal for ordinary configuration |

Use direct verbs on buttons. Avoid arrows, sparkles, redundant icons, and labels that merely repeat the containing section. A familiar icon-only action needs an accessible name and a tooltip when its meaning is not universal.

## 7. Surfaces, shape, and depth

- Controls: 4px radius. Ordinary bounded surfaces: 8px maximum. Dialogs, menus, transient notifications: 10px maximum. Page regions: open and usually square.
- Hairlines are 1px and purposeful. Shadows appear on transient overlays only, never on routine work surfaces.
- Circles exist only where geometry requires them: status dots, slider thumbs, rotary controls, switch geometry, meter ends, literal circular diagrams. `rounded-full` is prohibited on visible text; an icon-only button may be circular only when a platform convention or hit target benefits.
- No text pills, floating capsules, bubbles, giant radii, decorative icon boxes, needless badges, separators after every row, or excessive sidebar chrome.
- The local `Badge` primitive is exceptional: short classifications whose bounded shape prevents misreading (`Prototype`, `Unsigned`, `Destructive`), kept rectangular.

## 8. Status, messaging, and metadata

Status is compact and inline: semantic dot or small icon, plain state text, and a tabular value when useful.

- Battery percentage is readable text near device status; never buried in tiny metadata, never inflated into a widget.
- Engine health, clipping, route failure, disconnection, and unavailable state carry enough contrast to notice while scanning.
- Errors appear inline beside the failed control with nearby recovery. Banners are reserved for page-wide blockers or safety-critical state.
- Toasts are transient and mark completed background actions. Routine success gets no permanent banner, illustration, or celebration.
- Empty states state what is absent and the next valid action in one or two lines.

## 9. Copy

- Lead with the control, value, or state. Short nouns for destinations, direct verbs for actions.
- Explain only scope, consequence, recovery, privacy, cost, or a non-obvious hardware boundary.
- Remove helper copy that restates a visible heading or control.
- Identify prototype, simulated, unavailable, and unsupported behavior beside the affected feature.
- No marketing filler: "powerful", "seamless", "next-generation", "level up", "your command center".

## 10. Motion and accessibility

Interaction feedback is quick and causal (timings in section 3). Reduced motion removes translation, spring, pulse, and nonessential transitions.

Always required: visible keyboard focus ring, semantic elements, accessible names, logical focus order, sufficient contrast, complete keyboard operation. Interactive elements inside Electron drag regions use `no-drag`. Full-screen or transparent overlays default to pointer-transparent outside explicitly interactive controls; never create a page-sized invisible hit target or steal game input.

## 11. Implementation workflow

Before editing:

1. Read the page, adjacent routes, shared primitives, `globals.css`, canonical contract, store action, preload method, and main/controller handler involved.
2. Identify the primary task, routine controls, critical state, and minimum-window layout.
3. Inventory existing patterns and assets. Extend them instead of starting a competing design language.
4. Trace every proposed control to supported capability metadata and a real round-trip state transition.

While implementing:

1. Build the information hierarchy and geometry before adding surface styling.
2. Reuse shared controls and tokens; adapt them centrally when equivalent concepts need the same improvement.
3. Keep primary, secondary, and diagnostic information visibly distinct.
4. Exercise the dense case, long labels, missing assets, unavailable capabilities, failures, and reduced motion, not only the ideal demo state.

After implementing:

1. Exercise every changed control and verify state survives the canonical round trip or refresh.
2. Inspect the exact route in Electron at 1080 x 720, 1420 x 900, and 1920 x 1080.
3. Compare against adjacent routes for typography, spacing, alignment, control style, icon treatment, and density.
4. Fix the highest-impact hierarchy or usability issue, then inspect again. One visually acceptable pass is not completion.

## 12. Review gate

A renderer change is rejected until all applicable statements are true:

1. Every visible element passes the element admission test.
2. The page reads as one task-specific workbench, not a website, dashboard, settings form, gaming HUD, or card collection.
3. No gradient, glow, glass, neon/chroma decoration, decorative blur, particle, tilt, floating motion, decorative visualizer, or routine shadow.
4. No new text pill, giant radius, floating capsule, decorative icon box, needless badge, nested card, or unearned surface.
5. Typography, alignment, spacing, control sizes, and state treatment match this system.
6. Critical state and routine controls are visible at 1080 x 720 without page-level horizontal overflow or mandatory page scrolling.
7. Related values and controls are adjacent; no useful control hides behind an unnecessary modal, accordion, tab, or click.
8. Hardware pages use the best truthful render and make hardware visually primary. Important device state is legible.
9. Audio pages expose the full chain, useful EQ, usable faders and meters, peak/clipping feedback, and real host-backed behavior. Channel identity color is used per section 5 and nowhere else.
10. Loading, empty, unavailable, disabled, pending, error, recovery, focus, hover, active, overflow, and reduced-motion states relevant to the change are handled.
11. Every interactive feature is capability-driven and completes the canonical renderer-to-main/host-to-renderer round trip. No fake or UI-only feature remains.
12. Only intended regions receive pointer input; Electron drag and any full-screen overlay boundaries are correct.
13. No trivial dependency or duplicate UI pattern was introduced.
14. The exact changed route was visually inspected after at least one corrective iteration.

During source review, search changed renderer files for `rounded-full`, arbitrary large radii, `Badge`, `Surface`, gradients, shadows, backdrop filters, blur, uppercase tracking, fixed viewport overlays, page-level `overflow-x`, and newly added animation or timer code. A search hit prompts inspection of intent, not automatic failure: physical circles, track geometry, transient overlay shadows, and measured realtime feedback remain valid where this document permits them.

Static source checks and browser DOM inspection support the review but do not prove native Electron layout, input regions, device imagery, or renderer-to-main behavior. Record the evidence actually gathered and name any hardware, packaged-app, or long-running validation that remains external.
