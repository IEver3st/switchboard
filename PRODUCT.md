# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Windows PC users who own gaming hardware, route several kinds of audio, or save game clips. They understand everyday concepts such as volume, DPI, presets, and monitoring, but should not need audio-engineering or hardware-protocol knowledge for routine setup.

## Product Purpose

Switchboard is a low-overhead desktop control surface for connected hardware, audio routing and processing, and game capture. Success means common adjustments are immediately understandable while exact technical controls remain available to power users.

## Positioning

Switchboard combines modular hardware control, isolated realtime hosts, audio routing, and capture in one restrained utility without requiring a monolithic peripheral suite.

## Operating Context

The application runs as a resizable Windows Electron utility and may remain active in the tray while optional audio or capture engines run independently. Users configure devices, balance Game and Chat audio, choose sound and voice presets, refine EQ and processing, and save replays.

## Capabilities and Constraints

- Electron main owns persisted state; the renderer is a projection over the canonical shared contract.
- The renderer is sandboxed and receives only narrow typed preload operations.
- Realtime audio and video buffers do not cross Electron IPC.
- UI controls appear only for capabilities reported by the relevant device or audio host.
- Physical HID writes, signed virtual audio endpoints, and production capture are not claimed until the corresponding Windows hardware or host path is validated.
- Disabled engines retain no process, timer, device handle, subscription, or encoder session.

## Brand Commitments

Switchboard uses a compact, quiet, continuous-console design language. It avoids generic dashboard composition, card grids, gaming decoration, gradients, glow, glass, excessive rounding, and ornamental animation. Mature first-party hardware and audio utilities set the usability bar, but Switchboard retains its own restrained identity.

## Evidence on Hand

Bundled product renders exist for G502 X Plus and QuadCast 2. Canonical device, audio, capture, diagnostics, and engine state is defined in `src/shared/contracts.ts`. Confirmed prototype boundaries are documented in `README.md`, `ARCHITECTURE.md`, and `PERFORMANCE.md`.

## Product Principles

1. Normal mode describes outcomes; Advanced exposes implementation.
2. Capability truth and canonical state outrank visual completeness.
3. Routine work stays visible, readable, and close to the state it changes.
4. Power remains available without making engineering parameters the default journey.
5. Visual polish must preserve Switchboard's lightweight runtime goal.

## Accessibility & Inclusion

All routine workflows require readable text, practical hit targets, visible focus, semantic controls, complete keyboard operation, sufficient contrast, reduced-motion support, and state communication that does not rely on color alone.
