# Diagnostics redesign

- Surface and job: Settings > Diagnostics, inspect system health and record a local troubleshooting report.
- Authority: DESIGN.md, existing Settings tokens and controls, current canonical snapshots.
- First viewport: system memory/CPU and engine states first; recording/export, retention and performance guard stay visible at 1080 x 720. Detailed service and device evidence follows.
- Hierarchy and density: compact horizontal health strip; full-width working rows grouped with space; technical details have aligned labels and selectable values.
- Type: existing 20px route title, 12px section headings, 11px labels and copy, Cascadia Mono for metrics, paths and IDs.
- Material: continuous Settings canvas, one quiet tonal health surface, no row rules or nested cards. Semantic color only for actual state.
- Controls: existing switches, select and secondary export button; native disclosure for recorded tables. Retain settings search anchors and reset confirmation.
- Signature: aligned instrument readouts, compact host state, copyable device evidence.
- Avoid: three-card dashboard, repeated descriptions, disabled-feature explainers, low-contrast tiny telemetry.
- States: recording off, pending, collecting, sampled, export success/cancel/error; unavailable hosts, empty devices, long identifiers, warning/error, developer-only audio, keyboard focus and reduced motion.
- Responsive: native Electron at 1080 x 720, 1420 x 900 and 1920 x 1080; Settings owns vertical scrolling, no page-level horizontal overflow.
