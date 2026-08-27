# Clip timeline color design QA

## Comparison target

- Source visual truth: `C:\Users\User\.t3\userdata\attachments\4f27f5b8-cde7-4477-868f-ea287a245386-f9a562c4-d067-4331-8bab-bc64241c653e.png`
- Saved source copy: `design-qa/clip-timeline-colors/reference-timeline.png`
- Implementation screenshot: `design-qa/clip-timeline-colors/implementation-1420x900.png`
- Combined focused comparison: `design-qa/clip-timeline-colors/reference-vs-implementation.png`
- State: native Electron Clip Editor with a real indexed clip, real Game and Microphone waveform analysis, full clip and track ranges selected, both tracks unmuted.
- Viewport: 1420 x 900 CSS px in Electron.
- Source pixels: 1497 x 262. The supplied crop has no CSS-density metadata and was treated as a 1x visual reference.
- Implementation pixels: 2130 x 1350 at 1420 x 900 CSS px and device scale factor 1.5. The focused comparison crops the native timeline and normalizes it to the source width.

## Full-view comparison evidence

The native implementation keeps Switchboard's existing editor topology while matching the reference timeline treatment: a dark teal clip-range band, cyan ruler, permanent teal Game lane, permanent amber Microphone lane, and brighter waveform activity centered inside each lane. The reference's blue Chat lane is not fabricated because the indexed test clip contains only Game and Microphone streams; the same permanent blue treatment is defined for real Chat tracks.

Native Electron captures and layout assertions were inspected at 1080 x 720, 1420 x 900, and 1920 x 1080. The timeline, current state, transport, ruler, track controls, and both real audio lanes remained visible without page-level horizontal overflow.

## Focused region comparison evidence

`design-qa/clip-timeline-colors/reference-vs-implementation.png` places the supplied timeline crop above the normalized native timeline crop. This focused comparison is required because the supplied reference contains only the timeline region. It confirms the five fidelity surfaces:

- Fonts and typography: Switchboard's existing compact labels and tabular time roles remain intact; no app copy was replaced to imitate the source product.
- Spacing and layout rhythm: the thin clip band, separated compact audio lanes, left track controls, top ruler, and continuous playhead remain aligned at supported desktop sizes.
- Colors and tokens: clip teal, Game teal, Chat blue, Media purple, and Microphone amber are fixed timeline tokens rather than hover or selection colors. Selected audio ranges use transparent overlays so their base colors stay visible.
- Image quality and asset fidelity: no raster or placeholder asset is involved. Real waveform samples render as closed, filled SVG areas with no artificial stroke or center rule.
- Copy and content: canonical Switchboard channel names and real clip state are preserved. Missing streams remain absent rather than being simulated to match the reference.

## Comparison history

### Pass 1

- [P2] Filled waveform amplitude was too tall compared with the compact noise charts in the reference.
  - Fix: reduced the waveform amplitude ceiling from 44% to 15% of half-lane height and removed the artificial centerline/minimum amplitude.
  - Post-fix evidence: `design-qa/clip-timeline-colors/reference-vs-implementation.png` shows a quiet continuous Game trace and sparse Microphone peaks matching the reference's treatment.

### Pass 2

No actionable P0, P1, or P2 visual mismatch remains within the requested timeline scope.

## Interaction and deterministic evidence

- Native timeline verification passed at 1080 x 720, 1420 x 900, and 1920 x 1080 for permanent computed lane colors, closed filled waveforms, lane sizing, accessible sliders, waveform loading, metadata, dialog layout, and horizontal overflow.
- The focused native round trip passed smooth playhead motion, play/pause, keyboard seeking, volume adjustment, Game export-level adjustment, inspector reflow, fullscreen preview, 9:16 crop guide, favorite state, rename, reveal, and editor actions.
- `bun test tests/clip-timeline.test.ts`: 10 passed, 0 failed.
- `bun run check`: passed.
- `bun run check:source`: passed.
- `bun run build`: passed.
- `dotnet build .\engines\capture-host\Capture.Host.csproj`: passed with 0 warnings and 0 errors.
- `dotnet build .\engines\audio-host\Audio.Host.csproj`: passed with 0 warnings and 0 errors.
- UI source audit: 0 errors. Its existing outline warnings have visible `:focus-visible` replacements in the same stylesheet.
- `bun run check:types`: blocked by pre-existing uncommitted Sony protocol errors outside the capture timeline files.

## Residual test gaps

- The full native clip-export suite reached and passed all three viewport timeline assertions but did not complete its later real compression/export phase in this run. The focused native interaction suite completed successfully once; a repeat run reached the timeline assertions and then hit an intermittent timeout waiting for the unrelated Inspector collapse reflow.
- Physical multi-stream proof for a real Chat or Media track remains external; their permanent palette is implemented but the indexed clip used for native evidence contains Game and Microphone only.

final result: passed
