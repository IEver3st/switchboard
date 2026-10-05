# Quick Controls and vertical framing

Surface/job: a transient desktop panel for saving a replay and adjusting the current setup without opening the main window.

Authority: the requested rounded, frosted treatment; DESIGN.md's continuous console, canonical state, and compact type; existing Quick Controls actions.

First viewport: replay state and Save Replay lead, with the vertical-guide toggle always visible. Capture, Frame, and App tabs share a bounded scrolling body. No page-level scrolling.

Hierarchy/type: 18px panel heading, 13px section names, 12px controls, 11px secondary copy and tabular readouts. No new font or library.

Material/controls: a 460px floating panel inset 12px from the work area, capped at 860px tall; native-matched 8px shell corners without a second border, and 8px controls. Optional native Windows acrylic with a restrained charcoal tint, lightly translucent fields, and solid fallback. Existing violet focus/selection and semantic replay status. Standard switches, selects, committed sliders, and pixel inputs.

Signature: persistent replay action, a phone-proportioned outline preview, and a static click-through desktop guide. Avoid full-height square drawer chrome and equally weighted cards.

Critical states: disabled replay, waiting and rejected actions, guide on/off, unsupported glass, loading, long names, keyboard focus, narrow width, reduced motion and contrast.

Review: hidden native Electron at 1080 x 720, 1420 x 900, and 1920 x 1080 host sizes; panel at the corresponding bounded heights, plus 320px and zoom stress. Desktop blur and capture exclusion require separate compositor/recorder proof.

The guide is a framing aid, not a recording crop. It persists through panel dismissal and tray use, and ends at app exit. Size, position, outline color, outside dimming, display choice, and surface choice persist. New sessions start with the guide off. The default target is the display under the pointer; an explicit display picker can move it. It disappears on display removal. Fitted 9:16 uses percentage size and position; custom frames accept exact physical pixel width, height, left and top. Out-of-display geometry is rejected without changing the confirmed frame. A single static transparent window shades only outside the frame from 0 to 80%; the interior stays clear. No polling, media host, or interactive overlay controls are needed.
