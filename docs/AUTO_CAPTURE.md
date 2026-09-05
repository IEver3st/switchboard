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

Global defaults are off, 20 seconds before, 10 seconds after, merge enabled with a 15 second threshold, and saved-clip notifications off. Each game can be disabled, can override timing, and stores only preferences for capabilities it exposes. Knockdown, death, and loss events default off; positive highlights default on.

Diagnostics expose enabled state, active game/provider, provider state, last normalized event, received/deduplicated/ignored counts, clips created, pending-window summary, and a bounded error. Production logs use structured summaries such as `provider_started`, `event_received`, `capture_window_extended`, and `clip_saved`. Raw telemetry and player-identifying values are never logged.

## Included providers

### Test Event Provider

The development-only provider is available in prototype/development builds. Its Kill, Headshot, Death, Double Kill, Round Win, and Match Win controls call the narrow test IPC operation, then traverse the real provider, engine, replay host, persistence, library, and editor path. It never creates fake clip records. Start/stop is idempotent and covered by a listener-restart test.

### Counter-Strike 2 Game State Integration

`cs2-gsi` is a loopback-only HTTP provider. Setup writes `gamestate_integration_switchboard.cfg` under the detected Steam install's `game/csgo/cfg` directory and stores a random token in Switchboard's user-data directory. The server binds only `127.0.0.1`, accepts only `POST /game-state`, requires the token with timing-safe comparison, caps bodies at 256 KiB, and applies request/header timeouts. It requests only provider, map, round, player state, and local match stats; it does not request `allplayers`.

The parser establishes a baseline before emitting deltas, ignores duplicate/stale provider timestamps, and resets on reconnect, map/match changes, and round-counter rollback. It derives local kills, headshots, assists, deaths, round outcomes, and match outcomes. Player names and Steam IDs are used neither in normalized events nor persistence.

Valve's Game State Integration documentation remains the contract reference, although the Valve Developer Community page returned an automated-access challenge during the 2026-08-31 review. Therefore, the implementation and deterministic packet tests are complete, but the exact current CS2 build still requires an owner-operated in-game telemetry validation before a release claim.

### Battlefield 6 Overwolf Game Events

`battlefield-6-overwolf-gep` adapts Battlefield 6's documented Overwolf Game Events Provider feed. It requests only `game_info` and `match_info`, then maps `elimination` to `kill`, the player's `knockdown` to a distinct knockdown marker, and `round_outcome` to round win or loss. Match-start and match-end signals do not create clips. Payloads cross a bounded Zod boundary, and no opponent name, player identity, raw event payload, or match identifier enters clip metadata or logs.

Switchboard itself does not read `bf6.exe` memory, inject code, intercept packets, or attach a debugger. The provider subscribes only while Battlefield 6 is the active automatic-game source and both Instant Replay and Auto Capture are enabled. Stop, game exit, provider disable, or shutdown removes every listener owned by Switchboard. Nearby eliminations still use the shared event merger to produce multi-kill clips.

The normal Electron build remains unchanged and reports this provider as unavailable. An optional Overwolf Electron build is declared separately:

```powershell
$env:SWITCHBOARD_BF6_OVERWOLF_ENABLED = '1' # only after Overwolf enables the game for this app
bun run preview:overwolf
bun run dist:win:overwolf
```

There is a current external platform gate. Overwolf documents Battlefield 6 events for its Native framework, while its Electron supported-environments dataset marks Battlefield 6 as not Electron-enabled. Switchboard must receive per-app Battlefield 6 Electron enablement from Overwolf, or Overwolf must add the game to its Electron environment, before this adapter can receive retail events. The provider therefore remains experimental and is not release-usable today.

Local GEP development also requires an Overwolf developer credential (`OW_DEV_KEY`, or `OW_CLI_EMAIL` plus `OW_CLI_API_KEY`). A distributed build additionally requires a registered Overwolf application, Overwolf package signing, `OW_BUILD_KEY`, and a trusted code-signing certificate. After those gates are cleared, a current retail Battlefield 6 session still needs to confirm elimination, knockdown, outcome, restart, elevation, and listener-release behavior. Deterministic tests and an installed Steam manifest do not satisfy that live-game gate.

### War Thunder localhost API

`war-thunder-8111` reads War Thunder's built-in HTTP feed at `127.0.0.1:8111`. It does not inject into `aces.exe`, read process memory, inspect packets, modify game files, or expose the feed outside the machine. The provider is marked experimental until personal kill, death, and base-destruction transitions are exercised against a current retail match.

War Thunder's `/hudmsg` feed contains the whole battle's combat log, so installation detection alone is not enough to identify personal events. In Settings > Capture > Game integrations, the nickname field stays visible below War Thunder even when its event options are collapsed. Save (or Enter) stores the exact in-game nickname in canonical local settings; saving an empty field removes it. The UI distinguishes required, unsaved, saving, and confirmed saved values. The name is used to match the actor or target in memory, and neither the nickname nor raw battle-feed messages are logged or copied into clip metadata.

For streamer/anonymous mode, enable **I use anonymous mode** and save the squadron tag, with or without its surrounding symbols. The provider matches the literal English name `Player` together with that exact tag. A September 5, 2026 read-only sample from a running retail match confirmed the `^tag^ Player (vehicle)` format; parsing that sample identified three kills and two deaths without carrying player names into normalized events. This confirms identity matching on observed messages, not new event delivery or saved clips. A bare `Player` nickname is rejected because it cannot identify the local player reliably. Anonymous mode without a squadron tag remains unavailable, and any other combatant with the same tag and literal `Player` would be indistinguishable in this feed. Normal nickname matching accepts an exact name with an optional recognized squadron prefix; arbitrary nickname suffixes do not match.

Provider health changes publish through the existing registry subscription, so a missing nickname or failed local API cannot leave the canonical runtime claiming to listen. Resuming the same game after a replay-buffer change restarts the stopped provider, even if its source identity and settings did not change.

The provider establishes an ID baseline before emitting anything, then polls the incremental feed every 750 ms. That interval stays inside the endpoint's observed 1-2 Hz update guidance while leaving enough margin for short replay post-roll windows. Polling starts only while War Thunder is the active automatic-game capture source and both Instant Replay and Auto Capture are enabled. Stop, game exit, provider disable, or shutdown clears the timer and aborts the active request. Responses are capped at 1 MiB, time out after one second, and cross a strict Zod boundary.

The current event vocabulary is deliberately narrow:

- `kill`: the configured player destroyed a vehicle or shot down an aircraft;
- `death`: the configured player was destroyed, shot down, or crashed;
- `objective`: the configured player destroyed a base;
- `multi_kill`: derived by the shared capture-window planner when nearby kills merge.

Other players' kills, damage-only messages, achievements, disconnects, and unrecognized text are ignored. Game-language and feed-format variance remain retail validation boundaries, which is why the provider does not claim supported status yet.

### WARDOGS local events

`wardogs-events` matches the running `WardogsClient-Win64-Shipping.exe` client (retail app `1867240` and Playtest app `4809930`) so Settings can explain the gap, but it is marked unavailable and starts no runtime. The Unreal Engine 5 client runs under Easy Anti-Cheat, publishes no documented local telemetry, and the observed `%LOCALAPPDATA%\Wardogs\Saved\Logs` and `Telemetry` directories carry no kill-bearing feed while the game runs; no localhost event API was observed either. Automatic-game detection still follows the client (bare executable name plus the `Wardogs` window-title fallback, since protected-process metadata reads can fail), so manual replay saving and reaction clipping work during WARDOGS sessions. Live kill/death events stay blocked until a safe source exists: a read-only client-log format validated against a retail build, an official event API, or Overwolf game-event enablement for WARDOGS. No memory access, hooks, packet interception, or guessed log parsing are acceptable unlocks.

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

Reaction clipping is an auxiliary local event source rather than a game provider. It reuses the current Capture.Host microphone callback and the same bounded window planner. Its architecture, resource trade-offs, lifecycle, and accuracy boundary are documented in [REACTION_CLIPPING.md](./REACTION_CLIPPING.md).

## Provider research matrix

Reviewed through 2026-09-01 against current first-party documentation where available. `GREEN` means a documented safe integration is a strong provider candidate; `YELLOW` means a non-invasive path may exist but needs format, coverage, policy, or retail-build validation; `RED` means do not implement from presently known approaches. Absence of a public API is not permission to inspect a protected process.

| Game | Possible source | Official/documented? | Likely events | Reliability | Anti-cheat risk | Complexity | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Counter-Strike 2 | Local HTTP Game State Integration | Valve-documented GSI contract; current page was bot-protected during review | Local kill/headshot/assist/death counters, round and match state | High after current-build validation | Low; explicit loopback telemetry | Medium | GREEN; implemented, release validation pending |
| Battlefield 6 | Overwolf Game Events Provider through a future enabled Overwolf Electron runtime | Overwolf Native documents `game_info` and `match_info`; the current Electron environment does not list Battlefield 6 as enabled | Eliminations, player knockdowns, round victory/defeat, round lifecycle | High only after Electron enablement and retail-session validation | Low for Switchboard; no direct protected-client access | Medium plus external enablement, registration, and signing | YELLOW; experimental adapter implemented, Electron enablement and live-game validation pending |
| War Thunder | Built-in localhost HTTP feed on port 8111 | Endpoint is shipped by the game and used by its own browser map; no versioned formal schema found | Personal kills/deaths and base destruction after nickname matching | Medium; localized text and feed format need retail validation | Low; read-only loopback HTTP with no client inspection | Medium | YELLOW; experimental provider implemented, retail event validation pending |
| WARDOGS | No official public local telemetry found; client runs under Easy Anti-Cheat | No documented local live event feed, localhost API, or kill-bearing client log observed | Kills/deaths only after a safe source is validated | None today | High for hooks/memory; low for read-only logs or an official API | Medium | RED for live kills; unavailable provider registered so Settings explains the gap, automatic-game detection and manual/reaction capture work |
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
- War Thunder official forum, [discussion of the built-in 8111 LAN API](https://forum.warthunder.com/t/why-dont-we-have-an-api-for-war-thunder/90815?page=3), and community-maintained [8111 endpoint reference](https://github.com/CreeperUX/WT-8111-Neo/blob/main/WT_8111_API_REFERENCE.md).
- Overwolf, [Battlefield 6 Game Events](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/battlefield-6/), [Overwolf Electron supported environments](https://dev.overwolf.com/ow-electron/live-game-data-gep/supported-environment/), [Overwolf Electron GEP overview](https://dev.overwolf.com/ow-electron/live-game-data-gep/live-game-data-gep-intro/), and [production signing requirements](https://dev.overwolf.com/ow-electron/guides/dev-tools/app-signing/).
- Steam, [Battlefield 6 app page](https://store.steampowered.com/app/2807960/Battlefield_6/).
