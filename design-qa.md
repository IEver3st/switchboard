# Clip settings storage-link design QA

## Comparison target

- Source visual truth: `C:\Users\User\.t3\userdata\attachments\23469da9-0ac4-423e-a85d-8a6bf8d4f3cf-dbf1dd3b-12a5-4b54-8818-a4096a9ff3ce.png`.
- Implementation screenshots: `design-qa/clip-settings-direct-link/1080x720-settings-clips.png`, `1420x900-settings-clips.png`, and `1920x1080-settings-clips.png`.
- Full-view comparison: `design-qa/clip-settings-direct-link/reference-vs-implementation.png` with the reference on the left and the Switchboard implementation on the right.
- Focused storage comparison: `design-qa/clip-settings-direct-link/storage-reference-vs-implementation.png` with the reference on the left and the implementation on the right.
- State: native Electron Settings > Clips, dark theme, deterministic native fixture state, recorder off.
- Primary viewport: 1420 x 900 CSS px. Supporting native captures cover the required 1080 x 720 minimum and 1920 x 1080 wide desktop sizes.
- Source pixels: 1540 x 864 with no CSS-density metadata. The full comparison scales it to 1420 x 796 and pads it to the 1420 x 900 comparison cell without changing aspect ratio.
- Implementation pixels: 2130 x 1350 at 1420 x 900 CSS px and device scale factor 1.5, normalized to 1420 x 900 for comparison.

The supplied screenshot is contextual design authority for the clip-quality hierarchy, drive-space summary, and direct storage-path action. Switchboard's `DESIGN.md`, existing settings shell, tokens, typography, and responsive rules remain authority for the product chrome and exact material treatment.

## Visual contract

- Surface and job: configure new clip defaults, understand their storage impact, open the current clips folder, or choose a different folder.
- First viewport: quality controls lead; estimated size, drive capacity, and storage location remain visible without mandatory scrolling at 1080 x 720.
- Hierarchy and density: compact four-column controls at standard desktop, two columns at minimum width, then one continuous drive-space block.
- Type and material: existing Inter hierarchy, Cascadia-style path text, cool graphite surfaces, restrained violet interaction state, no gradient, glow, glass, or extra card nesting.
- Control grammar: selects change settings, the underlined path opens File Explorer, and the secondary button changes the folder.
- Signature: the storage meter, clip-count estimate, and live canonical folder path read as one operational storage instrument.
- Critical states: available capacity, unavailable capacity, storage warning, long path truncation with full tooltip, hover, keyboard focus, compact width, and reduced motion.

## Full-view comparison evidence

The implementation preserves the reference's sequence: category context, clip-quality controls, live size estimate, drive-space meter and legend, then the storage-location row. At 1420 x 900, the four quality selects share one row. At 1080 x 720, they reflow to two rows while the storage location remains in the initial view. The native capture metrics report no document-level horizontal overflow at 1080 x 720, 1420 x 900, or 1920 x 1080.

## Focused storage comparison evidence

- Fonts and typography: Switchboard retains its compact Inter settings hierarchy and uses a monospace role for the filesystem path. The path is underlined and paired with the existing folder icon, so it reads as an action rather than passive metadata.
- Spacing and layout rhythm: the redundant separate storage section heading and redundant Open button were removed. Drive telemetry and the location row now form one continuous block with a compact tonal step.
- Colors and visual tokens: the implementation uses existing Settings surface, text, primary, hover, border, and focus tokens. No source-specific palette was copied into the product.
- Image quality and asset fidelity: no custom raster asset is required for this operational settings surface. The existing Lucide folder icon remains sharp and consistent with the app's icon system.
- Copy and content: canonical storage totals, clip count, possible-clip estimate, and full configured path are preserved. The separate configuration action is now labeled `Change folder`.
- Interaction and accessibility: the path is a semantic button with a full accessible name and tooltip, an explicit focus-visible ring, a fine-pointer hover state, disabled behavior, and ellipsis for long paths. The native workflow found both storage actions enabled and confirmed all four clip settings persisted through reload.

## Findings

No actionable P0, P1, or P2 visual mismatch remains in the requested clip-settings scope.

- [P3] The reference uses a brighter cyan drive meter. Switchboard intentionally keeps its established restrained violet interaction token so the settings page remains coherent with the rest of the product.

## Comparison history

### Pass 1

- Made the displayed folder path the direct File Explorer action.
- Removed the duplicate Open command and renamed the remaining configuration action to `Change folder`.
- Folded the storage-location row into the drive-space section to remove redundant headings and reduce vertical space.
- Added path-specific hover, focus-visible, disabled, tooltip, truncation, and monospace treatments.
- Native confirmation found no blocker, major, or moderate layout defect, so no second visual repair pass was required.

## Deterministic evidence and gaps

- `bun run check`: passed.
- `bun run check:source`: passed, 191 TypeScript/TSX files transpiled.
- `bun run build`: passed for Electron main, preload, and renderer.
- Focused storage, persistence, and settings-search tests: 15 passed, 0 failed.
- `bun run test`: passed with 228 tests, 3 intentional montage-render skips, and both deterministic native-host suites passing.
- UI source audit: 0 errors. The new outline warning has an explicit `:focus-visible` box-shadow replacement.
- Native clip-settings workflow: quality, duration, resolution, and frame-rate changes persisted after reload; the path action and `Change folder` action were enabled; Settings returned to the prior route.
- Native visual captures: passed at 1080 x 720, 1420 x 900, and 1920 x 1080 with no horizontal overflow. A 2560 x 1440 supporting capture was also produced in temporary review output.
- The final full repository typecheck is blocked by an unrelated concurrent edit in `src/renderer/src/components/capture/CaptureHeader.tsx` that references `Monitor` without importing it. Earlier in this task, the same check was blocked by concurrent headset-capability edits; neither failure touches the Clips settings files changed here.
- File Explorer was not opened during automation because that would create an unsolicited OS window on the user's desktop. The path action reuses the existing validated `capture:open-clips-directory` IPC and Electron `shell.openPath` controller path.
- The collaborative browser loaded the built renderer and navigated into Settings, but its screenshot/snapshot automation timed out after the lazy Clips transition. Native Electron captures are the visual authority for this desktop route.

final result: passed
