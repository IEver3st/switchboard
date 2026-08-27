# Application update settings visual contract

- Surface and job: Settings sidebar and About route; notice, configure, download, and install a pending Switchboard update.
- Visual authority: the supplied blue circular download indicator, the supplied current About screenshot, and Switchboard's `DESIGN.md` continuous-console rules.
- First viewport: update status/action and all three update policies remain visible at 1080 x 720; build metadata recedes.
- Hierarchy and density: one compact sidebar utility row, one update status row, then three ordinary settings rows with no card nesting.
- Type and material: existing settings typography, graphite surfaces, steel dividers, and information blue only for the actionable pending state.
- Control grammar: a semantic sidebar utility button opens About; switches own persisted booleans; the status row owns check, download, and restart actions; supplemental version detail uses the shared shadcn/Radix tooltip.
- Signature: the pending update appears as a flat, left-aligned utility row that shares the footer grid with product feedback and Back. A blue download glyph, small notification dot, and trailing version carry status without creating a floating button.
- Critical states: unavailable, idle, checking, available/manual-download, available/automatic-download, downloading, downloaded, error, focus, and compact layout.
- Responsive constraints: 1080 x 720, 1420 x 900, and 1920 x 1080 with no page-level horizontal overflow.
- Anti-reference: do not turn the update indicator into a detached circular action, floating card, promotional banner, pill, or large modal.
