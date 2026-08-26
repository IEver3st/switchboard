# Capture design QA

## Goal summary

Rebuild Capture as a restrained, consumer-facing instant-replay library using SteelSeries Moments as the information-architecture and density baseline while preserving Switchboard's own console language, capability model, and pink capture accent.

Primary comparison input: `design-qa/reference-vs-switchboard.png`

- Left: official SteelSeries Moments reference.
- Right: Switchboard Capture at 1920 × 1080.
- Intentional differences: no promotional/community surfaces, no persistent selection controls, no share clutter, compact Switchboard navigation, hover-revealed actions, and real local clip media rather than fabricated game footage.

## Visible result

- The top surface reads as Instant Replay state first, five common settings second, and one primary replay action.
- Technical encoder, codec, shortcut, audio, cursor, folder, and refresh controls live under More.
- The media grid uses large 16:9 thumbnails, direct duration overlays, human titles, game identity, polished time, secondary size, hover favorite, and overflow actions.
- The toolbar provides search, first-class Favorites, derived games, date filters, all required sort modes, and distinct grid/list views.
- The editor preserves library state because it overlays the mounted library and uses the same canonical clip record for rename, favorite, export, reveal, and delete.

## Viewport evidence

Native Electron renderer captures were checked at 1080 × 720, 1420 × 900, 1920 × 1080, and 2560 × 1440. Document and main-content widths matched at every viewport, with no horizontal overflow. The grid resolved to 2, 2, 3, and 4 columns respectively.

The 1420 × 900 native BrowserWindow scale sweep rendered:

- 0 clips: concise empty state and real Turn on Instant Replay action.
- 1 clip: one substantial card without stretching into a database row.
- 20 clips: chronological Today/Yesterday groups.
- 240 clips: 240 cards, eleven chronological groups, lazy loading on all thumbnails, only seven decoded images near the viewport, and no horizontal overflow.

## Interaction evidence

The isolated Electron round trip passed:

- favorite toggle, persistence after reload, Favorites filtering, and restoration;
- title/game/date search and derived Desktop game filtering;
- Newest, Oldest, Largest, Smallest, Longest, and Shortest sorting;
- date filter choices and compact popover dismissal;
- true table-based list view;
- rename persistence after reload and restoration to the generated default;
- delete confirmation language without deleting real media;
- editor open/back with a real `switchboard-media://clip/` source;
- editor/library favorite synchronization;
- editor and dialog Tab containment, Escape handling, background inertness, and focus restoration;
- More settings contents;
- capture-capability-backed audio controls, including truthful unavailable states;
- search focus and no horizontal overflow;
- Replay-off human language and visible Turn on Replay primary action.

## Issues found and resolved

- P1: a concurrent source revision regressed the replay header to an eight-field form row. Resolved by restoring the human state header and moving the shortcut to More.
- P1: the empty state described Settings instead of offering a direct recovery action. Resolved with a canonical Turn on Instant Replay action and the configured shortcut.
- P2: the date popover remained open after selection. Resolved by controlling and dismissing it on choice.
- P2: the first comparison capture retained editor state. Resolved by reloading Capture before each viewport capture and regenerating the shared comparison input.
- P1: unsupported audio toggles could appear usable. Resolved by deriving disabled and unavailable states from canonical capture capabilities.
- P1: the editor and confirmation dialogs could expose hidden background controls to keyboard navigation. Resolved with inert background layers, modal semantics, focus loops, Escape behavior, and focus restoration.

## Remaining external runtime evidence

Saving a fresh replay and observing it appear live still requires an active game/source and a ready replay buffer. Physical-device audio-track confirmation and a long capture-host soak remain separate from this visual/library QA.

passed
