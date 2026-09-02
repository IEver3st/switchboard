# Switchboard design

Switchboard should feel like a quiet, well-made instrument that gets out of the way. It is calm, seamless, and built around the state of real devices and signal paths. The interface does not need to look exciting at rest. It needs to feel friendly and inviting, make the next action obvious, and make a failure hard to misunderstand.

The standard is simple: nobody using Switchboard should ever have a moment of anger, confusion, or "who designed this?" Every decision in this document exists to prevent that moment.

This document owns design intent. The current tokens and component implementations in `src/renderer/src/globals.css` and `src/renderer/src/components` own the exact code.

## The product character

Switchboard is a continuous console, not a collection of cards. Hardware, audio, and capture each get a workspace shaped around the job:

- Devices are physical objects with capability-specific controls.
- Audio is a signal path with meters, faders, EQ, processing, and destinations.
- Capture is a recorder and media library with clear storage and engine state.
- Settings explain policy, recovery, updates, diagnostics, and limits without taking over the main product.

The result should feel closer to a calm, modern system utility than a gaming launcher, a web admin panel, or a rack of hard-edged studio gear. Soft, seamless, and unhurried.

## Experience first

User experience is the product. Visuals serve the task; they never compete with it.

- The user should always know where they are, what is happening, and what to do next without reading a manual.
- Every action gives immediate, honest feedback. Nothing silently fails, silently succeeds, or leaves the user guessing.
- Recovering from a mistake is always possible and always obvious. Undo, cancel, and "go back" are never hidden.
- Defaults are sensible so most people never need to configure anything. Configuration is available, not required.
- Copy is plain, short, and kind. Explain what happened and what the user can do. Never blame the user, never use jargon where a normal word exists.
- Nothing jumps, shifts, flashes, or reflows under the pointer. Layout is stable while the user is working.
- Touch targets, hit areas, and spacing are generous enough that the user never misses or fights a control.
- Respect the user's attention. No nags, no badges without a real reason, no interruptions for things that can wait.

If a design choice looks good but adds a step, a surprise, or a question, the choice is wrong.

## Five rules

### State is the visual system

Connected, disconnected, live, muted, selected, pending, unavailable, read-only, failed, and unverified states must look different before the user reads the explanation. Color can reinforce state, but text, structure, icons, and control behavior carry the meaning.

Never animate a control to the requested value and call the write complete. Pending state remains visible until the canonical snapshot confirms the change. A rejected write restores the last confirmed value and explains what happened.

### One workspace leads

Every route has one dominant working area. A device page leads with the actual device and its useful controls. An audio channel leads with the EQ and its signal path. Capture leads with source and engine state, then the clip library.

Do not split routine work across nested tabs, modal chains, or repeated disclosure. Dialogs are for short, interrupting decisions, not ordinary operation.

### Seamless over segmented

The workspace reads as one continuous surface. Group related things with space, alignment, and gentle tonal shifts, not with lines. Constant divider rules, boxed sections, and outlined everything make an interface feel like a form to fill out; Switchboard should feel like a place to work.

A one-pixel line is a last resort for a boundary that spacing and tone genuinely cannot express, such as the edge of a transient overlay or the boundary of an editable field. Even then it should be soft and close in value to its surroundings, never a high-contrast rule.

Do not wrap content in a panel merely to make it look designed. Nested cards, decorative containers, floating bubbles, and icon tiles create noise without improving the task.

### Hardware stays physical

Use the correct known product render and colorway. Let its silhouette, material, lighting, buttons, and current state carry visual weight. Do not replace available product imagery with a generic mouse, keyboard, headset, or microphone illustration.

A hardware render may preview a supported whole-device state such as brightness or lighting color. It must not imply unsupported per-key, per-zone, or animated control.

### Density is earned

Switchboard can be dense because its users adjust real systems, but density must never feel cramped or cluttered. Density needs rhythm and breathing room. Align labels, readouts, and controls so the eye can scan a row without hunting, and let whitespace do the separating. Keep descriptions short and put protocol details in diagnostics.

## Shell and navigation

The persistent shell is dark, narrow, and subordinate to the workspace. It contains product identity, Devices, Audio, Capture, and Settings. It blends into the workspace rather than being fenced off from it by a hard edge. Active navigation uses a soft filled state and stronger text. It does not need a glowing background, an outline ring, or an oversized icon container.

The title bar and navigation may form Electron drag regions. Every interactive descendant must opt out with `no-drag`.

Navigation rules:

- Keep route names stable and plain.
- Keep the current route visually explicit.
- Preserve keyboard order and visible focus.
- Avoid notification dots unless they correspond to a real state that needs attention.
- Do not add a route for a feature that has no working product path.

## Workspace patterns

### Device gallery

The gallery is a calm inventory of connected hardware. Real product renders do most of the work. Connection, transport, battery, and one useful status line sit close to each device. Internal IDs and protocol labels do not appear here.

Unknown devices use honest identity and capability information. Do not guess a cosmetic variant. A missing colorway must not block discovery.

### Device workbench

The selected device becomes the primary instrument. Its render and the controls should read as one object, especially when a button callout, lighting preview, battery state, or profile selector maps to physical hardware.

Organize controls by the user's goal, not by packet or feature ID. Keep supported controls visible. Put unavailable ownership and recovery beside the affected control. Advanced protocol diagnostics belong in Settings.

### Audio desk

Audio is one continuous desk. Mixer channels sit side by side on a single soft surface and align vertically, separated by spacing rather than column rules. The master stage, Game, Chat, Media, Aux, and Microphone remain visually related instead of becoming separate cards or fenced columns.

Each channel keeps a stable identity:

| Channel | Token | Color |
| --- | --- | --- |
| Master and primary interaction | `--accent-brand` | `#8f7dff` |
| Game | `--channel-game` | `#3fd1bb` |
| Chat | `--channel-chat` | `#5f9dff` |
| Media | `--channel-media` | `#b38bff` |
| Microphone | `--channel-microphone` | `#f5b24d` |

Use channel color on meters, fader ranges, compact icons, and related readouts. Do not wash whole panels in color. Muted and unavailable channels change structure and copy as well as color.

### Parametric EQ

The EQ is the main instrument for Game, Chat, Media, and Microphone. Give the graph enough width to show frequency relationships and enough height to make dragging accurate. The band rail and inspector stay aligned with the graph.

Each band keeps its assigned token from `--eq-band-1` through `--eq-band-8`. Selected nodes grow or gain a ring, selected band controls gain a structural state, and exact values use tabular numerals. Color alone never indicates selection.

Do not turn the EQ into a decorative waveform. Every plotted value must come from the canonical audio state.

### Capture workspace

Capture has two distinct layers. A compact, persistent two-row command header keeps clip identity, count, recorder status, and source in its top row, with the coherent library toolbar in its second row. Clips form the scrollable media library below it.

The recorder stays visible because it explains whether new media can exist. Its closed state exposes replay readiness and the selected source; duration, quality, resolution, frame rate, storage estimate, encoder, and advanced audio or folder settings live in the replay popover. The library may scale from empty state to hundreds of clips. Search, favorites, game filters, ordering, view selection, and montage entry share one coherent toolbar and operate on real indexed clips.

Clip thumbnails preserve the media aspect ratio and dominate each tile. Grid mode keeps title, source, time, and duration visible; technical recording metadata belongs in list mode or an editing surface. Tiles sit directly on the workspace canvas instead of inside dashboard cards. Hover, overflow, and right-click actions share one command model. Selection for montage or bulk work changes both the thumbnail frame and its explicit selection control.

### Timeline and montage

The timeline is an editing instrument, not decoration. Playhead, trim boundaries, segment boundaries, audio tracks, muted state, waveform availability, and keyboard focus need distinct shapes.

Keep the ruler and clip-event lane compact and continuous. Canonical clip events render as blue diamonds inside the clip lane, seek the preview when activated, and expose their type and timestamp through an accessible name and tooltip. Kills, reactions, saved moments, and other event types share the same marker shape; the event list and label carry their meaning instead of assigning arbitrary marker colors.

Audio lanes retain their Game, Chat, Media, and Microphone identities as persistent teal, blue, violet, and amber bands. Their filled waveforms come from analyzed per-track samples. Loading, silent, unavailable, muted, and trimmed states must remain explicit and may never be replaced with a decorative or fabricated waveform.

Single-clip and montage projects remain visibly different. Montage segments show order and source boundaries. Missing media, analysis failure, export cancellation, and cleanup errors remain recoverable and explicit.

### Settings and diagnostics

Settings uses comfortable rows and full-page groups separated by space and headings, not by rules between every row. Routine policy stays visible. Destructive reset, update installation, and report handoff use clear confirmation and status.

Diagnostics can be technical. This is the proper home for VID/PID, HID paths, transport details, host PIDs, protocol failures, endpoint identifiers, checksums, and timestamps. It still needs readable grouping and copyable values.

## Materials and color

The palette is soft, cool graphite with a faint blue undertone, all flat solids with no gradients. Colors are chosen to recede: surfaces are close in value so the interface feels like one calm material, and text carries the hierarchy. Nothing in the neutral palette should draw attention to itself. Exact values live at the top of `globals.css`.

| Role | Token | Value |
| --- | --- | --- |
| App background | `--background` | `#0e1117` |
| Persistent chrome | `--chrome` | `#090b0f` |
| Primary surface | `--surface-1` | `#141821` |
| Secondary surface | `--surface-2` | `#191e28` |
| Interactive surface | `--surface-interactive` | `#1f2531` |
| Hover surface | `--surface-hover` | `#28303e` |
| Divider | `--border` | `#262d3a` |
| Strong divider | `--border-strong` | `#374050` |
| Primary text | `--text-primary` | `#f4f6fb` |
| Secondary text | `--text-secondary` | `#b7bfcd` |
| Description text | `--text-description` | `#8b95a7` |
| Muted text | `--text-muted` | `#6b7587` |

A soft violet is Switchboard's interaction color. Use `--accent-brand` for focus, active selection, the primary action, and the master audio path, in small amounts. It should feel friendly and gentle, never loud. It is not ambient decoration, and it never appears as a large filled area outside a primary button.

Settings applies a scoped cooler-neutral treatment without changing the rest of the product workspaces. Inside `.settings-page`, the background steps are `#0a0c11`, `#0e1117`, `#12161e`, `#1a2029`, and `#1f2631`; primary text is `#f4f6fb`; secondary text is `#aab3c2`; and the restrained Settings interaction accent is `#8f7dff` with `#a698ff` for hover. These remain token overrides, not component-level hardcoded colors. Module category icons may borrow existing semantic channel colors in small amounts to improve scanning.

Semantic colors are reserved for actual meaning:

- `--status-success` confirms healthy or completed state.
- `--status-info` identifies neutral operational information.
- `--status-warning` marks degraded, partial, or attention-needed state.
- `--status-danger` marks failure, destructive action, or unsafe state.
- `--status-neutral` marks inactive or unknown state.

Semantic colors are muted enough to sit comfortably on the palette. Danger should be clear without alarming; warning should be noticeable without shouting. Always pair a semantic color with readable text, an icon, or a structural cue.

## Type and numbers

Inter Variable is the product typeface, with Inter, system UI, and Segoe UI fallbacks. Cascadia Mono is reserved for diagnostics, paths, IDs, versions, timestamps, and protocol values.

Use a compact hierarchy:

- Route headings sit near 20px and 700 weight.
- Workbench and module titles sit near 14px and 650 weight.
- Body and explanatory copy sit near 11px with enough line height to remain readable.
- Labels sit near 10.5px and 600 weight.
- Percentages, decibels, frequencies, time, frame rates, and storage values use tabular numerals.

Do not create hierarchy with giant headings. A desktop utility has little room for marketing typography.

## Boundaries, radius, and depth

Use a four-pixel spacing rhythm. Common gaps are 4, 8, 12, 16, and 24px. Workspace gutters may grow on wider windows, but aligned edges should stay stable across routes.

Corners stay restrained:

- 2px for tiny state and technical controls.
- 4px for buttons, fields, and ordinary interactive elements.
- 7px for processing modules and larger bounded instruments.
- 8px for the outer frame of a composite workspace or a transient overlay.

Circular geometry belongs to knobs, EQ nodes, indicators, and switch thumbs. Text should not live in a pill unless the shape communicates a compact state with no better structural treatment.

Persistent content is flat. Spacing and gentle tonal steps create structure; dividers are rare and low-contrast when they exist at all. Use shadow only for a transient overlay or a draggable control that needs a small, soft tactile lift.

When deciding how to separate two things, prefer in this order: whitespace, alignment, a heading, a tonal surface shift, and only then a line.

## Controls

Choose the control that matches the value:

- Switches change booleans.
- Exposed segmented choices select among a few discrete options.
- Select menus handle longer or dynamic sets.
- Sliders and faders change meaningful continuous values.
- Knobs work only where radial interaction improves the hardware or audio task.
- Graphs edit real specialized data such as EQ or a timeline.
- Buttons perform commands. They do not stand in for persistent state.

Primary buttons use the brand accent sparingly. Secondary and ghost buttons carry most routine actions. Destructive actions use danger styling and confirmation proportional to the consequence.

Every control needs hover, active, focus, disabled, pending, and error behavior when those states apply. Hover and focus states are soft tonal changes, not outlines that appear and disappear. Disabled controls remain readable and explain why they cannot be used.

Controls should be forgiving: generous hit areas, no accidental destructive actions, no tiny targets, and no controls that move or resize as they change state.

## Motion

Motion explains change and softens it. It may show a pending command, a startup transition, a meter update, a playhead, or the physical response to a drag. Transitions are short and eased so state changes feel smooth rather than abrupt.

Do not add floating animation, particles, tilt, decorative waveform motion, breathing chrome, or ambient visualizers. Honor reduced motion. A static interface must retain every critical state and action.

## Responsive behavior

Switchboard supports three review sizes:

| Window | Purpose |
| --- | --- |
| 1080 x 720 | Minimum supported window |
| 1420 x 900 | Standard design review |
| 1920 x 1080 | Wide desktop review |

At 1080 x 720:

- No route may create page-level horizontal overflow.
- Critical engine, device, or error state stays in the first view.
- Routine controls do not require a disclosure click or mandatory initial scroll.
- Toolbars wrap, condense, or split according to task priority.
- The audio desk may scroll within its intended region, but the page shell remains stable.

At wider sizes, use the space to improve comparison and control precision. Do not inflate cards, headings, or empty margins. Long clip libraries and wide mixers should scale through columns and local scrolling rather than stretching every element.

## Accessibility and Electron behavior

- Use semantic elements before adding ARIA.
- Give every icon-only control an accessible name.
- Keep focus visible against every surface.
- Preserve logical keyboard order when layouts wrap or stack.
- Do not use color alone for selected, live, muted, failed, or unavailable state.
- Keep text and controls legible at Windows display scaling.
- Honor reduced motion.
- Add `no-drag` to every interactive element inside an Electron drag region.
- Restrict pointer input in transparent overlays to the intended controls.

## Things Switchboard does not do

Do not introduce:

- gradients, glow, glassmorphism, neon chrome, decorative blur, or chromatic decoration;
- divider lines between every row, column, or section, or high-contrast borders around ordinary content;
- harsh, saturated, or attention-seeking neutrals and accents;
- giant radii, routine pills, nested card grids, floating bubbles, or ornamental icon boxes;
- generic SaaS dashboards, marketing heroes, launcher-style promotions, or a hyper-futuristic control room;
- fake search, analytics, telemetry, meters, device state, clip state, or capability controls;
- low-level protocol copy in ordinary product screens;
- modal-first routine work;
- decorative animation that competes with live state;
- pixel-for-pixel copies of another product.

Reference products may inform information architecture. Switchboard keeps its own materials, language, control grammar, capability model, and product imagery.

## Review checklist

Before accepting renderer work, verify:

- The route has one obvious primary workspace.
- The route feels seamless: sections are separated by space and tone, and any remaining divider is justified and low-contrast.
- A first-time user could complete the route's main task without confusion, surprise, or a hidden step.
- Every error and unavailable state says what happened and what to do next in plain language.
- Every control maps to a supported capability and canonical state transition.
- Pending, confirmed, unavailable, disabled, error, and disconnected states remain truthful.
- Ordinary tasks stay visible without repeated disclosure.
- Product imagery matches the detected hardware variant.
- Shared typography, spacing, controls, channel colors, and interaction patterns remain consistent.
- Keyboard, focus, contrast, reduced motion, and Electron drag behavior still work.
- The route has no page-level horizontal overflow at 1080 x 720, 1420 x 900, or 1920 x 1080.
- Native Electron evidence covers the changed route. Browser and DOM checks remain supporting evidence only.
