Clip editor: prepare a shareable edit while preserving its source.
Authority: DESIGN.md and the existing ClipEditor/MontageComposer media workspace.
First viewport: preview leads; playback, sequence, undo/redo, export stay visible.
Hierarchy: media, temporal edit lanes, selected segment inspector; inspector owns scrolling.
Type: existing Inter labels; tabular time, zoom and gain values; restrained section titles.
Material: existing graphite surfaces, violet framing points, existing audio channel colors.
Controls: shared buttons, numeric time fields, selectors, sliders; direct drag framing with keyboard equivalents.
Signature: editable frame boundaries on real media, source-time keyframes, ordered cut segments.
Avoid: nested panels, decorative graphs, controls whose effects only exist in export.
States: loading/missing media, saved/pending/failed drafts, selected keyframe/mask,
silent/missing microphone, disabled transport, cancelled/failed export, focus, reduced motion.
Sizes: hidden native Electron at 1080x720, 1420x900, 1920x1080; no page overflow.
