# Clip timeline color visual contract

- Surface and job: the native Clip Editor timeline, used to review, scrub, trim, and mix real clip tracks.
- Visual authority: the user's attached timeline reference, especially its ruler/event lane, blue diamond markers, persistent teal, blue, and amber audio lanes, and compact filled waveforms.
- First viewport: preview remains dominant; transport, ruler, clip range, every audio lane, and track-level controls remain visible without mandatory scrolling.
- Hierarchy and density: the clip range is a thin teal outline directly beneath the ruler; blue event diamonds sit inside that lane; audio lanes are compact, solid channel-color bands; waveform activity is the brightest detail inside each lane.
- Type roles: preserve Switchboard's existing compact labels, metadata, and tabular time values.
- Color and material: channel colors remain visible at rest and through selection; trimmed-away regions may darken without turning neutral gray.
- Control grammar: preserve existing semantic buttons, sliders, keyboard trims, and playhead behavior.
- Signature: continuous filled waveforms derived from real per-track samples, plus edge-safe event diamonds that seek to canonical event timestamps.
- Anti-reference: faint gray lanes, synthetic waveforms, event markers that collide with ruler labels, or event color reserved for special event types only.
- Critical states: loading, waveform unavailable, silent track, muted track, selected range, independently trimmed range, no events, multiple event types, edge events, and keyboard focus.
- Responsive constraints: no page-level horizontal overflow at 1080 x 720, 1420 x 900, or 1920 x 1080.
