# Auto Capture

Auto Capture is an event-detection layer over Switchboard's existing rolling replay buffer. It never starts another recorder. A provider emits a normalized, privacy-safe event; the engine applies policy, deduplicates it, plans or extends a pending replay window, and asks `Capture.Host` to preserve the completed buffer segments that overlap that window.

The feature defaults to off. Manual replay saving is independent of Auto Capture and remains available when every provider is stopped or degraded.

## Ownership and event lifecycle

```text
safe game integration
  -> GameEventProvider
  -> AutoCaptureRegistry
  -> normalized GameEvent
  -> AutoCaptureEngine
     -> per-game event policy
     -> EventDeduplicator
     -> CaptureWindowPlanner / EventMerger
     -> cancellable PendingCaptureWindow
  -> existing Capture.Host saveReplay command
  -> ReplaySegmentRing.SelectForWindow
  -> existing remux and ClipLibraryService path
  -> Clip.autoCapture.events[]
  -> Clips filters, clip metadata, editor timeline markers
```

Electron main owns providers, policy, timers, persisted settings, and clip metadata. `Capture.Host` continues to own the encoded segment ring and remux. The renderer receives canonical snapshots and uses narrow, Zod-validated operations; it does not receive raw provider payloads, filesystem access, or provider internals.

Important source locations:

- `src/main/autocapture/provider.ts`: provider boundary and lifecycle context.
- `src/main/autocapture/registry.ts`: registration, availability, matching, and provider health.
- `src/main/autocapture/coordinator.ts`: active-game and capture lifecycle.
- `src/main/autocapture/auto-capture-engine.ts`: policy, pending windows, finalization, and diagnostics.
- `src/main/autocapture/event-deduplicator.ts`: bounded fingerprint cache.
- `src/main/autocapture/capture-window-planner.ts`: interval planning, merging, derived multi-kills, titles, and relative markers.
- `engines/capture-host/ReplaySegmentRing.cs`: selection of already-encoded segments for an absolute time window.
- `src/shared/contracts.ts`: canonical events, settings, provider descriptors, IPC, and clip metadata.

## Normalized events and capabilities

`GameEvent` has an ID, provider/game identity, event type, millisecond wall-clock timestamp, source, optional confidence/label, and bounded typed metadata. The metadata schema deliberately excludes player names, account IDs, raw telemetry, and arbitrary nested objects. Add a typed and bounded field to the schema when a new provider needs durable data; do not turn `metadata` into a raw-payload escape hatch.

Provider capabilities are event types plus whether the game supplies native multi-kill semantics. Settings only render events that a provider actually advertises. Support levels mean:

- `supported`: the integration source is documented, safe, and expected to be reliable after its required setup.
- `experimental`: a safe source exists, but event coverage or format stability still needs validation.
- `unavailable`: no acceptable current source exists. No provider runtime is started.

## Deduplication, merging, and pending windows

The deduplicator fingerprints provider ID, game ID, event type, and stable typed metadata, then treats matching fingerprints received within 500 ms as duplicates. It retains at most 512 entries and continuously expires fingerprints outside the recent comparison horizon. Provider sequence values remain part of the fingerprint so distinct counter deltas from the same packet are not collapsed.

Every accepted event creates `[event - preRoll, event + postRoll]`. A later interval that overlaps or is within the configured merge threshold extends the pending window and retains both markers. The window is capped by the current replay-buffer capacity, and there are at most eight pending windows. Timers are cancellable, unreferenced in Node, and owned by the engine. Finalization includes a small segment-completion allowance because the replay ring contains completed one-second keyframe segments.

On game exit, capture reconfiguration, capture shutdown, host failure, or app shutdown, pending windows flush through the same save path using the footage available at that moment. Provider failure is caught and reported as degraded; it cannot stop the replay engine.

When a provider lacks native multi-kill vocabulary, the planner adds a derived `multi_kill` marker for two or more kills in one merged window. Its typed metadata contains `count` and `derived`. A provider with native terminology should emit its own `multi_kill` marker and label; the presence of that marker suppresses generic derivation.

## Clip metadata

Auto-captured clips use the normal `Clip` record with an optional extension:

```ts
type ClipAutoCaptureMetadata = {
  autoCaptured: true;
  providerId: string;
  gameId: string;
  events: ClipEventMarker[];
};

type ClipEventMarker = {
  id: string;
  type: GameEventType;
  timestampMs: number; // relative to the actual saved file start
  label?: string;
  metadata?: GameEventMetadata;
};
```

The capture host reports the first selected segment's start time. Main converts every event from wall-clock time to a bounded relative offset once, before persistence. Existing clips with no `autoCapture` property remain manual clips. The state-store migration supplies disabled defaults without rewriting old clip records.

This identity is also the retention boundary for a future “delete oldest auto clips first” policy; no second storage manager is introduced.

## Settings and diagnostics

Global defaults are off, 20 seconds before, 10 seconds after, merge enabled with a 15 second threshold, and saved-clip notifications off. Each game can be disabled, can override timing, and stores only preferences for capabilities it exposes. Death and loss events default off; positive highlights default on.

Diagnostics expose enabled state, active game/provider, provider state, last normalized event, received/deduplicated/ignored counts, clips created, pending-window summary, and a bounded error. Production logs use structured summaries such as `provider_started`, `event_received`, `capture_window_extended`, and `clip_saved`. Raw telemetry and player-identifying values are never logged.

## Included providers

### Test Event Provider

The development-only provider is available in prototype/development builds. Its Kill, Headshot, Death, Double Kill, Round Win, and Match Win controls call the narrow test IPC operation, then traverse the real provider, engine, replay host, persistence, library, and editor path. It never creates fake clip records. Start/stop is idempotent and covered by a listener-restart test.

### Counter-Strike 2 Game State Integration

`cs2-gsi` is a loopback-only HTTP provider. Setup writes `gamestate_integration_switchboard.cfg` under the detected Steam install's `game/csgo/cfg` directory and stores a random token in Switchboard's user-data directory. The server binds only `127.0.0.1`, accepts only `POST /game-state`, requires the token with timing-safe comparison, caps bodies at 256 KiB, and applies request/header timeouts. It requests only provider, map, round, player state, and local match stats; it does not request `allplayers`.

The parser establishes a baseline before emitting deltas, ignores duplicate/stale provider timestamps, and resets on reconnect, map/match changes, and round-counter rollback. It derives local kills, headshots, assists, deaths, round outcomes, and match outcomes. Player names and Steam IDs are used neither in normalized events nor persistence.

Valve's Game State Integration documentation remains the contract reference, although the Valve Developer Community page returned an automated-access challenge during the 2026-08-31 review. Therefore, the implementation and deterministic packet tests are complete, but the exact current CS2 build still requires an owner-operated in-game telemetry validation before a release claim.

## Adding a provider

Register one provider instance in the composition root. The engine must not import it and the renderer must not branch on its game ID.

```ts
export class ExampleProvider implements GameEventProvider {
  readonly id = 'example-local-api';
  readonly gameId = 'example';
  readonly displayName = 'Example Game';
  readonly supportLevel = 'experimental' as const;
  readonly source = 'api' as const;
  readonly capabilities = { events: ['objective', 'match_win'] as const, nativeMultiKill: false };

  async detectAvailability(context: ProviderDiscoveryContext) {
    return context.detectedGames.some((game) => game.name === this.displayName)
      ? { state: 'available' as const }
      : { state: 'unavailable' as const, reason: 'Example Game is not installed.' };
  }

  async start(context: ProviderContext) {
    // Own one AbortController. Attach only documented/local integrations.
    // Parse and validate at the boundary, then emit normalized events.
  }

  async stop() {
    // Abort I/O, remove listeners, close sockets/watchers, and clear timers.
    // Repeated stop calls must be safe.
  }

  subscribe(listener: (event: GameEvent) => void) { /* return unsubscribe */ }
  getStatus() { /* structured, privacy-safe health */ }
}
```

Provider checklist:

1. Use an official local telemetry/API source or a documented, read-only file. Never inject, scan memory, attach a debugger, intercept packets, or hook protected processes.
2. Parse with Zod or an equivalently strict boundary and cap payload/queue sizes.
3. Baseline counter telemetry and explicitly handle duplicate, stale, reset, reconnect, and restart states.
4. Persist no player identity unless it is essential, disclosed, and added to the typed contract after review.
5. Make `start`/`stop` repeatable and prove that every listener, socket, watcher, and timer is released.
6. Add deterministic provider tests plus an end-to-end Test Event Provider pass through the real replay buffer.
7. Mark the provider experimental or unavailable until tested against a current retail build.

## Safety rules

Providers must never use DLL/code injection, process memory access, memory scanning, process manipulation, kernel drivers, debugger attachment, packet interception/decryption, anti-cheat bypasses, or undocumented protected-process hooks. Screen/OCR providers, if ever needed, remain separate providers and must crop a small stable region, gate expensive recognition behind a cheap change detector, sample conservatively, and ship only after measured CPU/GPU validation.

## Provider research matrix

Reviewed 2026-08-31 against current first-party documentation where available. `GREEN` means an official safe integration is a strong provider candidate; `YELLOW` means a non-invasive path may exist but needs format, coverage, policy, or retail-build validation; `RED` means do not implement from presently known approaches. Absence of a public API is not permission to inspect a protected process.

| Game | Possible source | Official/documented? | Likely events | Reliability | Anti-cheat risk | Complexity | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Counter-Strike 2 | Local HTTP Game State Integration | Valve-documented GSI contract; current page was bot-protected during review | Local kill/headshot/assist/death counters, round and match state | High after current-build validation | Low; explicit loopback telemetry | Medium | GREEN; implemented, release validation pending |
| Valorant | Riot web APIs after a match; otherwise small-region vision | Official APIs expose content, match history, ranked, and status, not a documented local live event feed | Post-match result/stats; live events only through unshipped vision | Low for timely buffer preservation | High for any process access; vision itself is low | High | RED for live provider; do not inspect the client |
| Fortnite | Local replay files; Creative/UEFN events only inside authored islands | Replays are official, but the public documentation describes playback/content creation rather than a stable external live event API | Post-match/replay highlights if a documented file schema emerges | Medium-low, delayed and version-sensitive | Low for read-only documented files | High | YELLOW; validate replay format and policy first |
| Apex Legends | No official public live telemetry found; bounded vision fallback | EA's official support and developer material does not publish a player-facing event API | HUD kills/knocks/wins via future vision only | Medium-low | High for hooks/memory; low for bounded screen analysis | High | RED for invasive approaches; YELLOW research-only vision |
| Overwatch 2 | Replay codes/replay viewer; bounded kill-feed vision | Replays are official, but no documented local live event stream was found | Eliminations, assists, deaths, objectives via future vision | Medium-low | High for client inspection; low for screen analysis | High | YELLOW; no shipped provider |
| Call of Duty / Warzone | Authorized Activision APIs appear partner-scoped; bounded vision | Official account settings mention gameplay data through Activision APIs for authorized partners, not a public local live feed | Post-match data; HUD events via future vision | Low for live capture | High for interception/client access | High | RED unless Activision grants a documented integration |
| Marvel Rivals | Bounded kill-feed/objective vision | No documented public local gameplay event interface found | Kills, assists, deaths, objectives | Medium-low | High for hooks; low for screen analysis | High | YELLOW research-only; no client hooks |
| Rainbow Six Siege | Local Match Replay files | Ubisoft documents local replay storage and replay behavior, but not a stable external event schema | Round/match outcomes and kills after replay parsing, if documented | Medium-low and delayed | Low for documented read-only files | High | YELLOW; validate format before implementation |
| Rocket League | Local TCP/WebSocket Game Data API | Official and explicitly intended for third-party programs | Goals, assists, saves, demolitions, round/match lifecycle | High | Low; opt-in local socket | Medium | GREEN; recommended next core provider |
| Escape from Tarkov | No acceptable documented event source found | No public official local telemetry/event integration found | Would otherwise require OCR or prohibited client inspection | Low | High for known invasive approaches | Very high | RED; do not implement without an official source |

Primary references:

- Valve Developer Community, [Counter-Strike Game State Integration](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration) (automated access challenged during review).
- Riot Games, [Valorant Developer API policy and endpoints](https://developer.riotgames.com/docs/valorant).
- Epic Games, [Fortnite Replays](https://dev.epicgames.com/documentation/fortnite/replay).
- EA Help, [Apex Legends play rules](https://help.ea.com/en/articles/apex-legends/play-by-the-rules/), and an [EA forum answer stating no official Apex stats API](https://forums.ea.com/discussions/apex-legends-technical-issues-en/api-info-for-stats/5317071/replies/5317072).
- Blizzard, [Overwatch replay documentation](https://overwatch.blizzard.com/en-us/news/23013835/overwatch-league-replay-viewer-see-matchesfrom-a-new-perspective/) and current [replay-related patch notes](https://overwatch.blizzard.com/en-us/news/patch-notes/).
- Activision Support, [gameplay-data account setting](https://support.activision.com/articles/managing-your-activision-profile).
- Ubisoft, [Rainbow Six Siege local Match Replay announcement](https://www.ubisoft.com/en-gb/game/rainbow-six/siege/news-updates/seasons/shadowlegacy) and [current replay update](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/highstakes).
- Rocket League, [official local Game Data / Stats API](https://www.rocketleague.com/developer/stats-api).
