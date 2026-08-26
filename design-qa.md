# Mouse workbench design QA

## Comparison target

- Source visual truth: `C:\Users\User\.t3\userdata\attachments\5c6d184d-50e2-4552-beae-724e78317a5d-868dd1fe-defc-4801-b2fe-dd3cd8b6a2b6.png`
- Implementation: `design-qa/mouse-workbench-1420x900.png`
- Supporting captures: `design-qa/mouse-workbench-1080x720.png` and `design-qa/mouse-workbench-1920x1080.png`
- Full-view comparison: `design-qa/reference-comparison.png`
- Focused callout comparison: `design-qa/callout-comparison.png`
- State: Devices route, Logitech G502 X Plus selected, dark colorway, lighting off, 1600 DPI, 1000 Hz report rate.

## Viewport and density

- Source pixels: 2482 x 1375.
- Standard implementation CSS viewport: 1421 x 902 at reported `devicePixelRatio: 1`; Electron `capturePage` returned a 2132 x 1353 native image on the Windows host display.
- Full comparison normalization: both images were Lanczos-scaled to 900 physical pixels high. The source and implementation remain at their native aspect ratios rather than being stretched.
- Focused comparison normalization: the source assignment region was cropped to 1150 x 700 then scaled to 650 pixels high; the implementation stage was cropped to 1740 x 650 native pixels.
- Responsive evidence: exact Electron renderer captures at requested 1080 x 720, 1420 x 900, and 1920 x 1080 window sizes.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- The implementation preserves the selected reference idea: a dominant centered product render, balanced assignment labels on both sides, and fine leader lines ending at the device silhouette.
- The reference's command library, profile controls, white colorway, and vendor chrome were intentionally not copied. Switchboard keeps its own navigation, canonical device state, black reported colorway, and existing sensitivity controls.

## Required fidelity surfaces

- Fonts and typography: Switchboard's Inter/Segoe UI stack, compact 10–14 px labels, semibold assignment values, and tabular settings values remain consistent with `DESIGN.md`. Labels do not wrap or truncate at supported window sizes.
- Spacing and layout rhythm: the mouse stays centered at all three supported captures; left/right callouts remain balanced; the controls stay visible at the minimum 1080 x 720 window; no horizontal page or main-region overflow was detected.
- Colors and visual tokens: the canvas, hairlines, muted labels, primary text, semantic connection dot, and scarce pink selection color use Switchboard's existing tokens. No gradients, glow, decorative shadows, or card shells were introduced.
- Image quality and asset fidelity: the existing real G502 X Plus render is used through the shared device renderer, not recreated with CSS or placeholder art. The standard and maximized captures retain sharp edges and correct aspect ratio.
- Copy and content: all six visible assignments come from the canonical `Device.controlBindings` contract. Connection, battery, DPI, report rate, memory, and lighting values remain sourced from the system snapshot.

## Interaction and runtime evidence

- Opened Devices, selected the Logitech mouse, and waited for the product canvas to reach its ready state.
- Changed the active DPI stage to 800 and verified the slider's canonical `aria-valuenow` updated to `800`.
- Enabled Lighting and verified the shared device renderer's `data-lighting-enabled` state updated to `true`.
- Checked the renderer console. No React or application runtime errors were emitted; only Electron's development CSP notice and a Canvas2D performance advisory appeared.

## Comparison history

- Pass 1 P2: the horizontal leader endpoints stopped too far from the device and read as detached rules in `design-qa/mouse-workbench-1420x900-v2.png`.
- Fix: extended the desktop leader rules 56 px into the center column while preserving the stacked, line-free narrow layout.
- Pass 2 evidence: `design-qa/mouse-workbench-1420x900.png` and `design-qa/callout-comparison.png` show the endpoints pulled into the mouse silhouette region. No P0, P1, or P2 issue remains.

## Open questions

- None for this directional implementation.

## Implementation checklist

- [x] Use canonical assignment data rather than renderer-only mock labels.
- [x] Keep the existing product render and device capability controls.
- [x] Reflow without hidden assignment content.
- [x] Verify minimum, standard, and maximized Electron windows.
- [x] Verify DPI and lighting interactions.
- [x] Check source rules, production build, and both .NET hosts.

## Follow-up polish

- P3: a future device-family module can provide per-control anchor coordinates if exact physical-button targeting becomes functional rather than directional.

final result: passed
