---
name: Switchboard
description: "A compact Windows routing console for hardware, audio, capture, and modular engines."
colors:
  canvas: "#0b0d10"
  work-surface: "#101318"
  raised-control: "#1a1e24"
  hover-surface: "#1c2027"
  hairline: "#23282f"
  hairline-strong: "#2a3038"
  primary-text: "#f2f3f5"
  muted-text: "#8e96a3"
  signal-pink: "#ff658a"
  signal-good: "#58c49a"
  signal-warning: "#e6b85c"
  signal-danger: "#ef6c75"
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

## Product direction

**Creative north star: the routing console.**

Switchboard is a focused Windows utility for connected hardware, audio routing, processing, and capture. It should feel like a coherent professional control surface: compact, quiet, explicit, and trustworthy enough to leave running. It is not a marketing site, a dashboard template, a generic settings form, a gaming HUD, or a vehicle for visual novelty.

Make design decisions in this order:

1. Put the right information and action in the right place.
2. Tell the truth about capability, state, cost, and failure.
3. Keep common work visible and close together.
4. Establish hierarchy through alignment, type, and spacing.
5. Apply restrained visual polish.

Decoration never compensates for weak information architecture. Minimalism is not permission to hide useful state, and density is not permission to erase hierarchy.

Explicit user direction can override this document for a task. Record the exception and its reason instead of silently creating a second design language.

## Automatic rejection patterns

The following are design failures unless a concrete product function requires the treatment and the task documents that reason. “Using less of it” is not a justification when the underlying pattern is inappropriate.

### Aesthetic direction

- No gradients, glow, glassmorphism, frosted panes, neon gamer styling, hyper-futuristic or hyper-techy decoration.
- No rainbow, chroma, animated RGB, or excessive pink. Signal pink is a scarce interaction/state accent, not a theme wash.
- No generic SaaS dashboards, landing-page hero sections, giant empty page headers, analytics-template charts, generic FiveM NUI styling, or unadapted shadcn demo layouts.
- No obvious AI-generated composition: stitched-together templates, competing visual ideas, arbitrary novelty, or components that look independently designed rather than product-owned.
- No copying another product pixel-for-pixel. Borrow sound information architecture, then express it with Switchboard's own contracts, tokens, copy, and components.

### Surfaces, shapes, and chrome

- No giant rounded rectangles, excessive corner radii, text pills, floating capsules, bubbles, or detached pill-shaped navigation.
- No card inside a card, card per setting, card per metric, or card grid used as the default page structure.
- No colored icons inside decorative rounded containers, decorative icon boxes, excessive badges, or icons scattered without a hierarchy.
- No shadows on routine work surfaces, border around every section, separator after every row, nested surface stacks, or excessive sidebar chrome.
- No giant status banners, updater cards, battery widgets, storage widgets, processor panels, or oversized EQ backdrops. Present their useful values in the work area at the scale their importance warrants.

### Scale, spacing, and density

- No giant headings, labels, buttons, dropdowns, controls, or empty headers in the desktop application.
- No excessive padding, margins, gaps, or dead space; no tiny control isolated inside a large empty region.
- No low-information filler and no stretched full-width control when a compact intrinsic width communicates the action better.
- No tiny product render when a hardware page has usable space; no tiny mixer, fader, meter, or EQ relegated to a decorative corner.
- No mandatory scrolling to reach critical state or routine actions at the minimum supported window. Long libraries, logs, and genuinely secondary settings may scroll in a clearly owned region.

### Disclosure and workflow

- Do not hide common controls behind extra clicks, routine configuration in a modal, or stable information in an accordion.
- Do not reveal audio processors one at a time without also keeping the complete signal-chain order and enabled/bypassed state visible.
- Do not use tabs to conceal a layout that should show related regions together. Tabs are for peer workspaces whose simultaneous visibility is not useful.
- Do not make every advanced capability equally prominent. Separate primary, secondary, and diagnostic information without making users hunt for common actions.
- Do not ask normal users to configure protocol, driver, endpoint, or hardware concepts that Switchboard can derive safely.

### Product truth

- No fake settings search, fake analytics, fabricated charts, placeholder activity, UI-only audio features, fake capability controls, or controls that update React state without completing the canonical backend transition.
- Do not design controls for unsupported states just to make a panel look complete. Capability metadata determines what exists.
- Do not duplicate one status, measurement, or concept in multiple cards, labels, banners, and badges.
- Do not put IDs, VID/PID, HID interfaces, protocol details, device paths, or similar diagnostic metadata in primary UI.
- Do not leave rarely used actions in a permanent action bar. Place them in the relevant secondary or diagnostic context while keeping recovery actions near failures.

### Motion and cost

- No animation for decoration, bouncy controls, floating devices, tilt, parallax, particles, animated backgrounds, or dramatic hover movement.
- No decorative waveform or visualizer. A realtime visualization must help make an audio or capture decision, use real data, stop when hidden or disabled, and justify its CPU/GPU/timer cost.
- No excessive motion or long transitions. Feedback is brief, causal, interruptible, and removed by reduced-motion preferences.

### Consistency

- No page-specific substitute for an existing shared concept, no different control styles for equivalent settings, and no arbitrary one-off sizes.
- Do not abstract until important state, comparison, or control relationships disappear. An abstraction must preserve the information the task requires.
- Reject weak or inconsistent typography, misaligned control columns, irregular spacing, unbalanced visual mass, and arbitrary component dimensions before adding decoration.
- No blind component-library example, dependency added for one trivial primitive, or new visual vocabulary created because an existing component needs a small adaptation.
- Do not stop after the first acceptable-looking iteration. Inspect the whole route, compare it with adjacent routes, and correct the highest-impact hierarchy, density, alignment, and truthfulness problems.

## Element admission test

Before adding a visible element, answer:

1. Which user decision, action, comparison, or recovery does it support?
2. Is its information absent from the surrounding label, value, state, and structure?
3. What canonical contract, measured value, or real action backs it?
4. Is it primary, secondary, or diagnostic, and does its prominence match that role?
5. Must it be visible with related controls, or is disclosure genuinely beneficial?
6. Does it still earn its space at 1080 x 720?
7. Can alignment, whitespace, or one hairline communicate the group without another container?

If questions 1–4 do not have specific answers, omit the element. If question 7 is yes, remove the container.

## Information architecture

### Page contract

Each page has one primary job and one focal work area. Define before implementation:

- the primary task and the state needed to perform it;
- the routine actions that must remain directly reachable;
- the secondary options that may sit beside or below the work area;
- the diagnostic information that remains out of the normal path;
- the empty, unavailable, disabled, loading, error, and recovery states;
- the canonical state transition for every interactive control.

Keep values close to the controls they affect. Put units beside values. Put validation and recovery beside the failed control or region. Do not make the eye shuttle across the page to connect a value with its fader, route, device, or toggle.

### Hierarchy

Create hierarchy in this order:

1. Stable placement and shared alignment.
2. Type size, weight, and contrast.
3. Tight spacing within a group and larger spacing between groups.
4. One hairline or subtle neutral surface change when a boundary is needed.
5. Color only for selection, focus, live state, warning, failure, or clipping.

Never use a rounded shell, colored icon tile, badge, or oversized title to manufacture hierarchy.

### Continuous-console rule

Pages are continuous workbenches separated into functional regions. A region earns a bounded `Surface` only when it independently scrolls, changes state as a unit, is interacted with as a unit, or must remain visually distinct from adjacent work. Do not nest `Surface` inside `Surface` for appearance.

Use aligned rows, shared baselines, open sections, tables, split panes, compact toolbars, and one divider at a genuine boundary. The interface should scan as a designed instrument, not a collection of independently styled cards.

## Layout and density

The application shell uses the existing 38px title strip and one scroll-owning main region. Page content follows a 4px rhythm with a nominal 20px inset.

- Use 8px between directly related controls, 16px between related sections, and 24–32px only between major work regions.
- Default button and field height is 28–36px. Icon-only targets remain accessible without turning the surrounding toolbar into oversized chrome.
- Prefer intrinsic or task-appropriate widths. A boolean switch, short selector, or folder action does not stretch across the window.
- Reflow before truncating, hiding, or shrinking. Do not reduce normal UI text below the defined scale to make a layout fit.
- Page-level horizontal overflow is a release blocker. A purpose-built canvas may pan only when panning is the task and has explicit controls.
- Preserve focus, selection, unsaved values, scroll position, and route context across resize and navigation.
- At 1080 x 720, critical state and routine controls stay visible without a mandatory page scroll. At 1420 x 900 and 1920 x 1080, use available space to improve the main work area rather than inflating padding or leaving arbitrary dead zones.

Empty space is useful when it separates major ideas or gives a hardware render, mixer, waveform, or editor room to function. It is waste when nearby related controls are compressed, hidden, or pushed below the fold.

## Typography

Use Inter Variable with Segoe UI and system sans-serif fallbacks. Use sentence case.

- Page title: 14px, semibold. Route names are not hero headlines.
- Section title: 12–13px, semibold.
- Body: 11–12px, regular, with readable line height.
- Label: 10–11px, medium.
- Technical value: 9–10px with tabular numerals for changing measurements, percentages, dB, CPU, memory, time, rates, and identifiers.

Use one clear title for a region. Do not stack an eyebrow, heading, subtitle, badge, and helper paragraph that repeat the same point. Uppercase tracking is reserved for a rare technical classification, not a default heading device. Important state must not be so muted that it disappears.

## Color, shape, and depth

The canvas is uninterrupted. Work surfaces and raised controls use neutral tone changes. Hairlines are 1px and purposeful.

- Controls: 4px radius.
- Ordinary bounded surfaces: 8px maximum.
- Dialogs, menus, and transient notifications: 10px maximum.
- Page regions: open and usually square.
- Shadows: transient overlays only.
- Circles: status dots, slider thumbs, rotary controls, switch geometry, meter ends, or literal circular diagrams only.

`rounded-full` is allowed only when physical geometry requires a circle or track. It is prohibited on visible text. An icon-only button may be circular only when a Windows/platform convention or the hit target specifically benefits from it.

Signal pink marks the primary action, current selection, focus, active range, or rare attention. Good, warning, danger, and clipping colors communicate real semantic state only. Neutral content stays neutral.

## Controls and interaction choices

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

## Status, messaging, and metadata

Status is compact and inline: semantic dot or small icon, plain state text, and a tabular value when useful.

- Show battery percentage as readable text near the device status; do not bury it in tiny metadata or inflate it into a widget.
- Show engine health, clipping, route failure, disconnection, and unavailable state with enough contrast to notice while scanning.
- Use inline errors and nearby recovery. Reserve a banner for a page-wide blocker or safety-critical state.
- Use transient toasts for completed background actions. Do not celebrate routine success with permanent banners, illustrations, or confetti.
- Empty states state what is absent and the next valid action in one or two lines.
- The local `Badge` primitive is exceptional. Use it only for a short classification whose bounded shape prevents a real misreading, such as `Prototype`, `Unsigned`, or `Destructive`; keep it rectangular.

## Hardware pages and imagery

Hardware is the primary subject on a hardware page.

- Use a real bundled or vendor-provided product render when available. Preserve aspect ratio, resolution, transparency, lighting zones, and known colorway.
- Resolve the correct variant from canonical hardware evidence. Never recolor a render to impersonate another SKU or colorway.
- Use a generic placeholder only when no trustworthy render exists, and label uncertainty without claiming an exact variant.
- Give the render meaningful stage space at standard and large windows. Controls may frame or annotate it, but must not reduce it to a thumbnail while decorative whitespace dominates.
- Keep connection, battery, active profile, mute, and other important device state visible and close to the device identity.
- Low-level hardware identifiers belong in an explicitly diagnostic context, not the main workbench.

Do not add decorative device motion. A transform may support a direct inspection interaction, but it must not make the product float, bob, tilt on hover, or consume resources while idle.

## Audio pages

Audio UI is an instrument, not a settings form and not a debug console.

- Keep the complete signal chain visible in order, including enabled, bypassed, unavailable, and clipping state. Selecting one processor may change the editor, but must not hide the rest of the chain.
- EQ is a first-class purpose-built editor whenever supported. Do not reduce it to a generic slider list, tiny thumbnail, decorative background, or hidden “advanced” panel.
- Keep mixer channels wide enough to identify, route, meter, mute, and adjust without precision loss. At the minimum window, a visible strip should retain roughly 160px or more of usable fader travel and a legible meter with persistent peak/clipping feedback.
- Do not compress channel strips until labels, endpoints, meters, or controls become ambiguous. Reflow the surrounding layout or reduce secondary chrome first.
- Put dB values, units, peak state, and route destinations close to the corresponding fader or meter. Live level feedback must be strong enough to scan without overpowering labels.
- Use real meter data. A waveform or analyzer exists only when it changes a mixing/processing decision, and it stops subscribing, drawing, and timing when inactive or offscreen.
- Do not expose a processor or route control unless the host supports it. A visual-only toggle, EQ node, bus, or routing choice is prohibited.

## Capture, modules, updates, and settings

- Capture emphasizes source, current engine state, recording/replay readiness, storage consequence, and the primary save action. Do not turn it into a hero banner plus vanity metrics.
- Module management uses compact rows or a table for name, trust, size, state, and the relevant action. Do not use a marketplace card for each installed module.
- Update and storage state are inline summaries with progress when active. Do not create giant updater or storage cards for rare events.
- Settings use a stable category list and aligned setting rows. They do not become a dashboard of cards or a search-first experience.
- Search exists only when it queries a real, complete settings catalog and navigates to an actual control. A decorative or incomplete search box is prohibited.
- Hide diagnostics from the ordinary path while keeping them deliberately reachable for troubleshooting.

## Icons and charts

Icons identify a known action, device class, route, or semantic state. They do not decorate headings or sit in colored rounded tiles by default. Prefer a label alone when the icon adds no recognition value.

Use a chart only when comparison, trend, response, level, or time is part of the task. It must use real data, correct units, an appropriate scale, and domain-specific interaction. Generic analytics charts are not substitutes for meters, EQ response, replay timelines, routing graphs, or diagnostics tables.

## Copy

- Lead with the control, value, or state.
- Use short nouns for destinations and direct verbs for actions.
- Add explanation only for scope, consequence, recovery, privacy, cost, or a non-obvious hardware boundary.
- Remove excessive helper copy, redundant labels, repeated descriptions, and prose that restates a visible heading or control.
- Keep one visible source of truth for each status or measurement on a page.
- Identify prototype, simulated, unavailable, and unsupported behavior beside the affected feature.
- Do not use marketing filler such as “powerful,” “seamless,” “next-generation,” “level up,” or “your command center.”

## Motion and accessibility

Interaction feedback is quick and causal:

- hover and focus color/border changes: 80–140ms;
- selection continuity: up to 180ms;
- necessary disclosure: up to 210ms;
- frequent keyboard actions and realtime controls: immediate.

Reduced motion removes translation, spring, pulse, and nonessential transitions. Keep a visible keyboard focus ring, semantic elements, accessible names, logical focus order, sufficient contrast, and full keyboard operation. Interactive elements inside Electron drag regions use `no-drag`.

Full-screen or transparent overlays default to pointer-transparent outside explicitly interactive controls. Never use a page-sized invisible button, accidental full-viewport hit target, or overlay that steals game input.

## Implementation workflow

Before editing:

1. Read the page, adjacent routes, shared primitives, `globals.css`, canonical contract, store action, preload method, and main/controller handler involved.
2. Identify the primary task, routine controls, critical state, and minimum-window layout.
3. Inventory existing patterns and assets. Extend them instead of starting a competing design language.
4. Trace every proposed control to supported capability metadata and a real round-trip state transition.

While implementing:

1. Build the information hierarchy and geometry before adding surface styling.
2. Reuse shared controls and tokens; adapt them centrally when equivalent concepts need the same improvement.
3. Keep primary, secondary, and diagnostic information visibly distinct.
4. Exercise the dense case, long labels, missing assets, unavailable capabilities, failures, and reduced motion—not only the ideal demo state.

After implementing:

1. Exercise every changed control and verify state survives the canonical round trip or refresh.
2. Inspect the exact route in Electron at 1080 x 720, 1420 x 900, and 1920 x 1080.
3. Compare against adjacent routes for typography, spacing, alignment, control style, icon treatment, and density.
4. Fix the highest-impact hierarchy or usability issue, then inspect again. One visually acceptable pass is not completion.

## Review gate

A renderer change is rejected until all applicable statements are true:

1. Every visible element passes the element admission test.
2. The page reads as one task-specific workbench, not a website, dashboard, settings form, gaming HUD, or card collection.
3. There is no gradient, glow, glass, neon/chroma decoration, decorative blur, particle, tilt, floating motion, decorative visualizer, or routine shadow.
4. There is no new text pill, giant radius, floating capsule, decorative icon box, needless badge, nested card, or unearned surface.
5. Typography, alignment, spacing, control sizes, and state treatment match the established system.
6. Critical state and routine controls are visible at 1080 x 720 without page-level horizontal overflow or mandatory page scrolling.
7. Related values and controls are adjacent; no useful control is hidden behind an unnecessary modal, accordion, tab, or click.
8. Hardware pages use the best truthful render and make hardware visually primary. Important device state is legible.
9. Audio pages expose the full chain, useful EQ, usable faders/meters, peak/clipping feedback, and real host-backed behavior.
10. Loading, empty, unavailable, disabled, pending, error, recovery, focus, hover, active, overflow, and reduced-motion states relevant to the change are handled.
11. Every interactive feature is capability-driven and completes the canonical renderer-to-main/host-to-renderer round trip. No fake or UI-only feature remains.
12. Only intended regions receive pointer input; Electron drag and any full-screen overlay boundaries are correct.
13. No trivial dependency or duplicate UI pattern was introduced.
14. The exact changed route was visually inspected after at least one corrective iteration.

During source review, search changed renderer files for `rounded-full`, arbitrary large radii, `Badge`, `Surface`, gradients, shadows, backdrop filters, blur, uppercase tracking, fixed viewport overlays, page-level `overflow-x`, and newly added animation/timer code. A search hit is a prompt to inspect intent, not an automatic failure: physical circles, track geometry, transient overlay shadows, and measured realtime feedback remain valid where this document permits them.

Static source checks and browser DOM inspection support the review but do not prove native Electron layout, input regions, device imagery, or renderer-to-main behavior. Record the evidence actually gathered and name any hardware, packaged-app, or long-running validation that remains external.
