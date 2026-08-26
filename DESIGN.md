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
  section-title: "13px / 600"
  body: "12px / 400"
  label: "11px / 500"
  technical: "10px / 500, tabular numerals"
radii:
  control: "4px"
  surface: "8px"
  overlay: "10px"
spacing:
  unit: "4px"
  control-gap: "8px"
  section-gap: "16px"
  page-padding: "20px"
---

# Design System: Switchboard

## Required direction

**Creative north star: The Routing Console.**

Switchboard is a focused desktop utility, not a marketing site and not a peripheral-suite dashboard. It should resemble a well-organized Windows control surface: dense enough to scan, quiet enough to leave running, and explicit about what is active, stopped, unavailable, or consuming resources.

Every renderer change must preserve this direction. Explicit user direction wins when it conflicts with this document.

### Non-negotiable UI rules

1. **No text pills.** Do not place status, counts, versions, modes, percentages, endpoint types, support levels, or ordinary metadata inside capsule-shaped containers. Do not add `rounded-full` or an equivalent radius to any text-bearing element.
2. **No card soup.** A page is a continuous work area divided by alignment, whitespace, and hairlines. Do not wrap every metric, setting, row, or section in its own floating card.
3. **No decorative containers.** A border, background, or shadow must communicate grouping, interaction, focus, elevation, or state. If removing the container loses no meaning, remove it.
4. **No text slop.** Do not add eyebrow labels, slogans, welcome copy, redundant subtitles, or helper text that restates the heading or visible control. Keep explanatory copy only when it clarifies scope, consequence, recovery, or a non-obvious hardware boundary.
5. **No ornamental effects.** Gradients, glow, glass, blurred color fields, decorative shadows, oversized icon tiles, blobs, and ambient animation are outside the system.
6. **No fake density.** Do not fill space with vanity metrics, fake activity, placeholder charts, fabricated logs, or permanent success banners. Show only real product state from canonical contracts.
7. **No giant radii.** Controls use 4px corners, ordinary surfaces use up to 8px, and transient overlays use up to 10px. Large rounded page shells are not allowed.
8. **One accent voice.** Signal pink marks the primary action, current selection, focus, or an active range. It is not decoration and should not appear on every control.

`rounded-full` is reserved for geometry that must be circular or track-shaped: status dots, slider thumbs, switch tracks, meter ends, and literal circular diagrams. An icon-only button may be circular only when the platform convention or hit target benefits from it. These exceptions never contain visible text.

### Element test

Before adding a visible element, answer all of these in the implementation:

1. Does it help the user control, understand, compare, or recover the system?
2. Is this information absent from the surrounding heading, label, value, and state?
3. Does it come from a real contract or action rather than presentation-only invention?
4. Is a container necessary, or would alignment, whitespace, or a hairline communicate the group?
5. Does it still earn space at the minimum supported window size and 1080p?

If the first three answers are not clearly yes, omit the element. If the fourth answer is no, remove the container.

## Visual language

### Character

- Restrained, technical, and Windows-native.
- Compact without becoming cramped.
- Dark neutral surfaces with a single scarce accent.
- Stable regions, aligned rows, and predictable controls.
- Real state and capability truth before decorative polish.

### Hierarchy

Each page has one job and one focal work area. Establish hierarchy in this order:

1. Placement and alignment.
2. Type size and weight.
3. Whitespace.
4. Hairlines or a quiet surface shift.
5. Color only when it communicates selection, focus, health, warning, or failure.

Do not use a rounded container, icon tile, or accent label to compensate for weak hierarchy.

### Colors

- **Canvas:** The uninterrupted application background.
- **Work surface:** A bounded functional region that genuinely needs separation from the canvas.
- **Raised control:** Buttons, fields, selectors, and meter tracks.
- **Hairline:** Section rules, row separators, and quiet control boundaries.
- **Primary text:** Current values, task labels, and selected destinations.
- **Muted text:** Secondary values, units, and short scope notes.
- **Signal pink:** Primary action, selection, focus, active range, and rare attention.
- **Good, warning, danger:** Real semantic state only. They never decorate neutral content.

### Typography

Inter Variable is the application face, with Segoe UI and system sans-serif fallbacks. Use sentence case throughout.

- **Page title:** 14px, semibold. Route names do not become hero headings.
- **Section title:** 13px, semibold.
- **Body:** 12px, regular, with comfortable line height.
- **Label:** 11px, medium.
- **Technical:** 10px, tabular numerals for changing measurements, percentages, memory, CPU, time, rates, and identifiers.

Uppercase tracking is reserved for a rare, necessary technical classification. It is not a default heading style and must not become an eyebrow above a real heading.

## Layout

The shell is a compact desktop frame: a 38px title strip, a 64px navigation rail, a 48px route bar, and one scroll-owning main region. Page content uses a 20px inset and a 4px spacing rhythm.

- Keep critical controls and current engine state visible at 1080p.
- Prefer one continuous primary surface over grids of equal cards.
- Use 16px between related sections and 24–32px only between major work regions.
- Group with alignment and spacing first; add one divider when the boundary needs reinforcement.
- Use tables or aligned rows for comparable values.
- Use split panes or columns only when the user benefits from seeing the regions together.
- Reflow narrow layouts before hiding information. Never solve overflow by clipping controls or shrinking text below the defined scale.
- Preserve scroll position, selection, unsaved state, keyboard focus, and route context during resize or navigation.

**The continuous-console rule.** Hardware, audio, capture, and module pages are workbenches separated into functional regions, not dashboards assembled from independent promotional cards.

## Shape and depth

Depth comes from neutral tone changes, 1px hairlines, selection rules, and transient overlay placement.

- Controls: 4px radius.
- Ordinary bounded surfaces: 8px maximum radius.
- Dialogs, menus, and transient notifications: 10px maximum radius.
- Page sections: open and usually square, with a top or bottom rule when needed.
- Shadows: transient overlays only; never routine work surfaces.
- Circles: status dots, slider thumbs, switch geometry, or literal circular diagrams only.

**The radius-earned rule.** Round an element because its interaction or physical geometry calls for it, never because empty corners feel unfinished.

## Component rules

### Status and metadata

Status is inline and compact. Prefer a semantic dot or small icon followed by plain text. Put changing measurements in tabular text aligned with their labels.

| Information | Use | Avoid |
| --- | --- | --- |
| Engine health | status dot + plain state text | green status pill |
| Count | tabular number beside its label | count badge |
| Version or endpoint type | muted inline metadata | capsule label |
| Selected mode | underline, rule, check, or rectangular selected segment | floating pill selector |
| Warning or error | icon + direct recovery text | decorative warning chip |
| Several comparable values | rows, columns, or a compact table | a card per value |

The local `Badge` primitive is exceptional, not a default metadata wrapper. Use it only for a short, essential classification whose bounded label prevents a real misreading, such as **Prototype**, **Unsigned**, or **Destructive**. Keep it rectangular with tight corners. Do not add a badge when plain text, a dot, or an icon carries the same meaning.

### Buttons

- Default height: 32–36px with 4px corners.
- Primary: one per immediate task region, filled with signal pink.
- Secondary: raised neutral surface with a visible hairline.
- Ghost: toolbar, navigation, and low-priority actions.
- Danger: destructive actions only, with explicit consequence and confirmation where needed.
- Icon-only: familiar actions only, with an accessible name and tooltip when meaning is not universal.

Buttons use direct verbs. Do not add arrows, sparkles, or decorative icons to make ordinary copy feel more important.

### Navigation and tabs

Navigation items are compact rectangular rows or rail targets. Active navigation uses a quiet surface change and a 2px accent rule.

Tabs and mode selectors share one rail. Show selection with an underline, inset rule, tonal fill, or check. Do not render each option as a detached capsule. Segmented controls have one rectangular outer boundary and internal hairline dividers.

### Surfaces and sections

Use `Surface` only when a region needs a real boundary because it scrolls independently, changes state as a unit, accepts interaction as a unit, or must remain distinct from adjacent work.

- Do not nest `Surface` inside `Surface` for visual interest.
- Do not create a surface for a single label/value pair.
- Do not put every setting in a bordered tile.
- Do not repeat a section title in a card title, eyebrow, and helper sentence.
- Prefer `divide-y`, a single border, or whitespace for lists and settings groups.

### Forms and settings

- Align labels and values to a shared grid.
- Keep units adjacent to values without turning them into badges.
- Use native control patterns: switch for a boolean, select for one-of-many, slider only when continuous adjustment matters, and text input for text.
- Put validation and recovery beside the affected control.
- Disabled controls remain legible and state why they are unavailable when the reason is not obvious.
- Unsupported capabilities stay absent. Do not invent controls to make a panel appear complete.

### Meters and realtime state

Meters are compact tracks with semantic ranges and tabular values. Their motion reports live state; it is not ambient decoration.

- Keep realtime animation local to the changing value.
- Prefer bar, tick, peak marker, and number over decorative charts.
- Stop animation and timers when the engine or view is disabled.
- Provide an immediate reduced-motion path.

### Messages and empty states

- Use transient toasts for completed background actions.
- Use inline errors beside the failed region, with a recovery action when one exists.
- Reserve banners for page-wide blocking or safety-critical conditions.
- Empty states state what is absent and the next valid action in one or two lines.
- Do not celebrate routine success with permanent banners, illustrations, or confetti.

### Icons and imagery

Icons clarify known actions, device classes, and semantic state. They do not sit in colored rounded tiles by default. Do not add an icon when the adjacent label is already unmistakable.

Use real device imagery only when it helps identify or configure hardware. Never invent device art, capability diagrams, or decorative telemetry that could be mistaken for real product state.

## Copy rules

- Lead with the control, value, or state.
- Use short nouns for destinations and direct verbs for actions.
- Add explanatory text only for scope, consequence, recovery, privacy, or a non-obvious technical boundary.
- Keep one source of truth for each status or measurement on a page.
- Prefer `Engine stopped` to a heading, subtitle, badge, and banner that all report the same fact.
- Name prototype or simulated behavior truthfully and close to the affected feature.
- Never use marketing filler such as “powerful,” “seamless,” “next-generation,” or “your command center” inside the application.

## Interaction and motion

Interaction feedback is quick and causal.

- Hover and focus: color or border change in 80–140ms.
- Selection indicators: up to 180ms when continuity helps orientation.
- Disclosures: up to 210ms.
- Frequent keyboard actions and realtime controls: immediate.
- Reduced motion: remove translation, spring, pulse, and nonessential transitions.

Maintain a visible keyboard focus ring, accessible names, logical focus order, and a complete keyboard path. Interactive elements inside Electron drag regions must opt out with `no-drag`.

## Review gate

A renderer change is not design-complete until all of the following are true:

1. Every visible element passes the element test.
2. No new text-bearing `rounded-full`, capsule, or equivalent pill shape exists.
3. Every new badge has an essential classification role that plain text cannot serve as clearly.
4. The page reads as one work area rather than a collection of cards.
5. Repeated labels, helper copy, ornamental effects, and presentation-only state have been removed.
6. Loading, empty, error, disabled, focus, hover, active, overflow, and reduced-motion states relevant to the change are handled.
7. The exact route has been inspected at the minimum supported size, a representative 1080p window, and a maximized window.
8. There is no horizontal page overflow, clipped critical control, hidden mandatory action, or interactive element inside a drag region.
9. UI state remains backed by canonical contracts; the renderer does not invent capabilities or move privileged work across process boundaries.

During source review, search changed renderer files for `rounded-full`, extreme arbitrary radii, `Badge`, nested `Surface`, gradients, shadows, uppercase tracking, and repeated helper copy. These searches identify decisions to inspect; permitted status dots, switch tracks, slider thumbs, and transient overlay shadows remain valid.

## Reference examples

### Clean engine header

Use one row with a status dot, `Audio engine`, plain state and resource text, then the switch at the far edge. Do not split the same facts into a hero card, health pill, CPU card, memory card, and action card.

### Clean settings group

Use a section title followed by aligned rows separated with hairlines. Each row contains one label, optional one-line consequence, and its control. Do not wrap every row in a rounded tile.

### Clean mode selector

Use one rectangular segmented strip or a tab rail with a clear selected rule. Do not place every option in an individual pill and do not add a second badge repeating the selected value.
