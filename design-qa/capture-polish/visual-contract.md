# Capture polish

- Surface/job: native Capture workspace for finding, reviewing, and assembling saved clips, with recorder readiness always visible.
- Authority: supplied September 4 screenshot, DESIGN.md, current shared Radix controls and canonical Capture contracts.
- First viewport: retain the two-row command header and media-first library. Align all routine controls at 32px; keep source, replay, search, filter, full sort labels, view, and montage available.
- Hierarchy/type: 17px Clips heading, 11px controls and status, subordinate tabular count; thumbnails dominate and existing clip titles remain unchanged.
- Material: flat graphite, quiet tonal grouping, 4px control corners, violet only for selection/focus. No new cards, divider fences, gradients, or ambient motion.
- Signature: recorder source and readiness read as one instrument; library controls share a baseline; selection appears on media without shifting targets.
- Avoid: tiny disconnected recorder controls, clipped sort labels, invisible selected view, and full-library rerenders for selection changes.
- States: off, pending, ready, error, source/replay popovers, filtered/empty, missing thumbnails, montage selection, keyboard focus, reduced motion, large library.
- Responsive: native Electron 1080x720, 1420x900, 1920x1080; persistent header and library-owned vertical scrolling; no horizontal overflow.
- Performance: stabilize selection callbacks and memoize media rendering; compare representative 240-clip interactions. No new timer, observer, dependency, or engine work.
