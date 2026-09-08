# Onboarding redesign

- Surface/job: native first-run setup. Configure workspaces, capture, and audio tracks through the existing canonical operations.
- Authority: current redesign request and supplied incumbent screenshot, DESIGN.md, existing shared controls. The requested subtle animated background is a scoped exception to the usual ambient-motion rule.
- First viewport: centered setup workspace, legible current step and primary action, subordinate progress rail. Every routine control fits at 1080 x 720.
- Hierarchy/density: compact navigation, generous current-step heading, closely grouped settings; welcome has a stronger brand focal point without becoming a marketing page.
- Type: Inter, 24px step heading, 30px welcome heading, 13px controls/body, 11px supporting metadata.
- Material: existing flat graphite tokens, small violet selection/action accents, no glow, gradients, glass, or nested panels.
- Controls: incumbent Radix controls and store operations; completed steps revisitable; clear back/continue actions, truthful saving/error feedback.
- Signature: layered flowing contours around the content, a moving step marker, quiet forward-staggered reveals. Two static SVG artworks are cached on HTML layers and move slowly at different rates. Pause is available; reduced motion disables animation. No per-frame JavaScript or canvas loop.
- Anti-reference: tiny content stranded at the top of an empty window; equal-weight cards; oversized marketing typography.
- States: welcome, choices, capture, tracks, review, pending/error, unavailable endpoints, keyboard focus, reduced motion.
- Responsive: native 1080 x 720, 1420 x 900, 1920 x 1080. At narrow widths the rail becomes a compact step row; the main region owns exceptional overflow.
