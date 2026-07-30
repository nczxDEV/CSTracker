# CS Tracker — MVP Backlog

Format: Jira/Trello-compatible (Epic → Story → Task, story point
estimates, acceptance criteria). Can be imported into a CSV or a Jira
"Create issues in bulk" flow, row by row.

Legend: **SP** = story point (Fibonacci: 1, 2, 3, 5, 8)

---

## EPIC 1: Backend API Gateway foundations

### BE-1 — Project scaffold and configuration (3 SP)
- **Description**: NestJS project initialization, `.env`-based config,
  `ConfigModule` setup.
- **Acceptance criteria**: `npm run start:dev` starts, `/players/search`
  returns a 501/placeholder response, `.env.example` documented. ✅ done.
- **Labels**: `backend`, `setup`

### BE-2 — Rate limiting + global Throttler guard (2 SP)
- **Description**: `@nestjs/throttler` configured with env-based limits
  (`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_TTL_SECONDS`).
- **Acceptance criteria**: exceeding the limit returns a 429. ✅ done.
- **Labels**: `backend`, `security`

### BE-3 — Cache layer (2.2 SP)
- **Description**: `CacheModule` wired in, TTL from env
  (`CACHE_TTL_SECONDS`).
- **Acceptance criteria**: repeated lookups are served from cache,
  logged (cache hit/miss). ✅ done.
- **Labels**: `backend`, `performance`

### BE-13 — SQLite persistence (replaces JSON file storage) (3 SP)
- **Description**: `DatabaseModule`/`DatabaseService` using Node's
  built-in `node:sqlite` (no native addon to compile/package). Notes,
  saved players, and settings all persist here instead of plain JSON
  files, eliminating a concurrent-write data-loss risk.
- **Acceptance criteria**: `notes`, `saved_players`, `settings` tables
  created on boot; all previous JSON-file-based features work
  identically against SQLite. ✅ done.
- **Labels**: `backend`, `reliability`

---

## EPIC 2: External API integrations

### BE-4 — FACEIT API client (5 SP)
- **Description**: `FaceitClient` — `getPlayerByNickname`,
  `getPlayerBySteamId`, `getPlayerStats` methods, with error handling and
  outbound retry/backoff for 429/503 responses.
- **Acceptance criteria**: correct JSON response for known nicknames with
  a real FACEIT API key; `null` (not an exception) for a missing player.
  ✅ done.
- **Labels**: `backend`, `integration`, `faceit`
- **ToS note**: FACEIT Developer ToS reviewed, rate limits respected.

### BE-5 — Steam Web API client (4 SP)
- **Description**: `SteamClient` — `getPlayerSummary`, `resolveVanityUrl`,
  `getPlayerBans` (public VAC/game ban status, "safety indicator" feature).
- **Acceptance criteria**: correct public profile data for both SteamID64
  and vanity URL lookups; empty/limited data for a private profile;
  ban status reflects the official `GetPlayerBans` response. ✅ done.
- **Labels**: `backend`, `integration`, `steam`

### BE-6 — Data normalization layer (`PlayerProfile`) (5 SP)
- **Description**: `PlayersNormalizer.merge()` — maps FACEIT + Steam data
  (+ Leetify/Premier/commendations/history/bans) into one unified model,
  with `sources` tagging.
- **Acceptance criteria**: unit tests cover "all sources present",
  "partial data", and "nothing present" cases. ✅ done
  (`players.normalizer.spec.ts`).
- **Labels**: `backend`, `data-modeling`

### BE-9a — Leetify rating client (feature-flagged) (3 SP)
- **Description**: `LeetifyClient` — best-effort rating lookup, returns
  "N/A" by default until an official, ToS-compliant Leetify API access is
  configured (`LEETIFY_API_KEY`/`LEETIFY_API_BASE_URL`, settable via the
  Setup Wizard).
- **Acceptance criteria**: returns `null` without configuration, throws no
  error; once configured, returns
  `rating/aim/positioning/utility/opening` fields. ✅ done.
- **Labels**: `backend`, `integration`, `leetify`, `compliance`
- **ToS note**: do NOT implement unofficial scraping.

### BE-9b — CS2 Premier "CS Rating" client (2 SP)
- **Description**: `PremierClient` — Valve currently provides no public
  API for other players' Premier rating, so the client returns N/A,
  documenting future GSI/manual-entry options.
- **Acceptance criteria**: every call returns `null`, logs the reason,
  throws no exception. ✅ done.
- **Labels**: `backend`, `integration`, `premier`, `compliance`

### BE-9c — FACEIT commendations best-effort (1 SP)
- **Description**: `FaceitClient.getPlayerCommendations` — no documented
  public endpoint currently exists, returns `null` with room to extend
  later.
- **Acceptance criteria**: the call throws no error, UI shows "N/A". ✅ done.
- **Labels**: `backend`, `faceit`, `compliance`

### BE-14 — Outbound retry/backoff for external APIs (2 SP)
- **Description**: `withRetry()` helper wraps FACEIT/Steam/Leetify HTTP
  calls, retrying on 429/503 with exponential backoff (honoring
  `Retry-After` when present), bounded roster-resolve concurrency (max 3
  in flight) so a 10-player lookup doesn't fan out unbounded requests.
- **Acceptance criteria**: a simulated 429 followed by success resolves
  without surfacing an error to the caller; a non-retryable error (e.g.
  404) fails immediately. ✅ done, validated with a standalone script.
- **Labels**: `backend`, `reliability`

---

## EPIC 3: REST API endpoints

### BE-7 — `GET /players/search` and `/players/:identifier/summary` (3 SP)
- **Acceptance criteria**: both endpoints return a normalized
  `PlayerProfile` JSON, with a 404 `PLAYER_NOT_FOUND` error code when no
  match is found. ✅ done.
- **Labels**: `backend`, `api`

### BE-8 — `POST /match/resolve-players` (max 10) (3 SP)
- **Description**: `ResolvePlayersDto` validation (`class-validator`, max
  10 items), bounded-concurrency processing, order-preserving results.
- **Acceptance criteria**: submitting 10 identifiers returns up to 10
  `PlayerProfile` results (fewer if some aren't found), in the same order
  as submitted. ✅ done.
- **Labels**: `backend`, `api`

### BE-10 — Dedicated `/players/:identifier/faceit|leetify|premier|safety` endpoints (3 SP)
- **Description**: besides the full `summary`, dedicated, focused
  endpoints for "Faceit stats in detail", "Leetify ratings", "CS Rating",
  and the "Safety indicator" (Steam bans), so the client only requests
  what it currently needs.
- **Acceptance criteria**: each endpoint returns the relevant slice of
  `PlayerProfile`, keyed by `steamId`. ✅ done.
- **Labels**: `backend`, `api`

### BE-11 — "Recent results" (W/L) from FACEIT history (3 SP)
- **Description**: `FaceitClient.getPlayerHistory()` calls the official
  `/players/{id}/history` endpoint; the normalizer computes whether the
  player won (W) or lost (L) each of the last 5 matches - this feeds the
  saved-player card's "RECENT RESULTS" row.
- **Acceptance criteria**: `computeRecentResults()` covered by a unit test
  (correct faction/winner comparison), max 5 items, `null` if no data.
  ✅ done.
- **Labels**: `backend`, `faceit`, `feature`

### BE-12 — SavedPlayersModule (saved players + notes) (5 SP)
- **Description**: `/saved-players` CRUD endpoints - save a player
  (snapshot from `PlayersService.getSummary()`), list (with search/sort),
  refresh, note (reusing `NotesService` internally), delete.
- **Acceptance criteria**: saving returns the snapshot + note in the
  list; note updates are only allowed for an existing saved player (404
  otherwise); deleting also deletes the note. ✅ done.
- **Labels**: `backend`, `feature`, `notes`
- **Product decision**: the previous standalone `/players/:id/note`
  endpoint was removed - notes are exclusively part of the saved-player
  flow.

### BE-15 — Setup Wizard settings API (3 SP)
- **Description**: `SettingsModule` — `GET /settings/status` (boolean
  flags only), `PUT /settings/api-keys` (stores FACEIT/Steam/Leetify keys
  in SQLite, overriding `.env`), so the end user never edits a `.env` file
  or opens a terminal.
- **Acceptance criteria**: keys saved through the endpoint are picked up
  by the API clients immediately, without a backend restart; raw keys are
  never returned by `/settings/status`. ✅ done.
- **Labels**: `backend`, `feature`, `security`

### BE-16 — Game State Integration (GSI) module (8 SP)
- **Description**: `GsiModule` — `POST /gsi` (token-authenticated ingest
  from the CS2 client), `GET /gsi/state` (connection/map/round status),
  `GET /gsi/roster` (auto-resolved live roster), `GET /gsi/config-file`
  (downloads a ready-to-use `.cfg` with the token pre-filled).
- **Acceptance criteria**: a valid GSI payload updates the live state;
  an invalid/missing token is rejected with 401; the sanitizer strictly
  allow-lists name/team/kill-death-assist/score fields and drops/logs
  anything resembling position/velocity/other-player-state data, even if
  present in the payload. ✅ done, validated with a standalone sanitizer
  script.
- **Labels**: `backend`, `feature`, `compliance`, `gsi`

### BE-17 — `GET /health` endpoint (1 SP)
- **Description**: a lightweight health check that makes no external API
  calls, replacing the previous `/players/search?query=ping` "ping" hack
  that needlessly triggered real FACEIT/Steam requests.
- **Acceptance criteria**: returns `{status:"ok", timestamp}` instantly,
  regardless of API key configuration. ✅ done.
- **Labels**: `backend`, `reliability`

---

## EPIC 4: Desktop Overlay client (Tauri)

> **Decision**: Tauri chosen over Electron — smaller resource footprint,
> more native always-on-top/transparent window handling, smaller bundle
> size. See `cs2-overlay-frontend/README.md` for details.

### FE-1 — Project scaffold, always-on-top transparent window (5 SP)
- **Acceptance criteria**: the window is visible over CS2, doesn't cover
  the whole screen, click-through optionally available. ✅ done.
- **Labels**: `frontend`, `desktop`

### FE-2 — Global hotkey toggle (3 SP)
- **Description**: `Alt+Shift+S` — overlay show/hide; `Alt+Shift+X` —
  click-through toggle (added so the overlay never blocks aiming/clicking
  once you're done glancing at stats).
- **Acceptance criteria**: hotkeys work while CS2 has focus (OS-level
  global shortcut registration, not injected into the game process).
  ✅ done.
- **Labels**: `frontend`, `desktop`, `ux`

### FE-3 — Player search input + player card UI (5 SP)
- **Acceptance criteria**: correct data renders, missing fields show
  "N/A" (with a tooltip explaining why for Leetify/CS Rating), no crashes.
  ✅ done.
- **Labels**: `frontend`, `ui`

### FE-4 — Compact / pill view (3 SP)
- **Description**: a small floating summary strip per team (name + K/D
  pills, team averages, strongest/weakest-link callout), toggleable from
  the header, expandable back to the full scoreboard with one click.
- **Acceptance criteria**: both views render correctly and don't obscure
  the crosshair/radar area in the default position. ✅ done.
- **Labels**: `frontend`, `ui`, `ux`

### FE-5 — Loading / error states (2 SP)
- **Acceptance criteria**: every error path is visually handled, no blank
  white state. ✅ done.
- **Labels**: `frontend`, `ux`

### FE-6 — Data source badge (2 SP)
- **Acceptance criteria**: every displayed stat shows which source it
  came from; transparency principle upheld. ✅ done (`sources` array).
- **Labels**: `frontend`, `compliance`, `ux`

### FE-7 — Manual 10-player roster (MVP match mode) (5 SP)
- **Acceptance criteria**: 10 lines of input processed, missing players
  clearly flagged, doesn't block the rest of the successful matches.
  ✅ done (`app.js` roster input, Team A/B 5-5 split).
- **Labels**: `frontend`, `feature`

### FE-8 — Reference-scoreboard design implementation (5 SP)
- **Acceptance criteria**: visually comparable to the reference design
  (color palette, table layout, badge style). ✅ done (`styles.css`,
  `index.html`, `app.js`).
- **Labels**: `frontend`, `ui`, `design`

### FE-9 — Expandable row detail panel (5 SP)
- **Acceptance criteria**: opens/closes on click, multiple rows can be
  open at once, clear messaging for N/A data. ✅ done.
- **Labels**: `frontend`, `ui`, `ux`

### FE-10 — Leetify bar chart + N/A state (2 SP)
- **Acceptance criteria**: both branches (data present / absent) render
  correctly, with a tooltip explaining the N/A reason. ✅ done.
- **Labels**: `frontend`, `ui`, `compliance`

### FE-11 — Commendation badges (Friendly/Leader/Skilled) (1 SP)
- **Acceptance criteria**: all 3 badges show a number or "N/A". ✅ done.
- **Labels**: `frontend`, `ui`

### FE-12 — Note textarea autosave (debounce + PUT call) (2 SP)
- **Description**: 600ms debounce autosave logic with a "saved ✓"
  indicator. Lives in the Control Panel, not the overlay.
- **Acceptance criteria**: typing doesn't send a request per keystroke;
  a status indicator confirms the save. ✅ done.
- **Labels**: `frontend`, `feature`, `notes`

### FE-13 — "Click the name to save" (overlay) (3 SP)
- **Acceptance criteria**: clicking a name saves the player into the
  Control Panel's saved list; clicking elsewhere on the row still only
  opens/closes the detail panel. ✅ done.
- **Labels**: `frontend`, `feature`, `ux`

### FE-14 — Saved players section + player card (Control Panel) (5 SP)
- **Acceptance criteria**: card rendering validated against sample data;
  live sync via a Tauri event as soon as a player is saved on the
  overlay. ✅ done.
- **Labels**: `frontend`, `ui`, `feature`, `notes`

### FE-15 — Saved players search/sort controls (3 SP)
- **Description**: search-by-name input plus sort-by (recently
  saved/name/ELO/K-D) and ascending/descending toggle, for when a lot of
  players accumulate in the list.
- **Acceptance criteria**: typing in search filters the list (debounced);
  changing sort/direction re-orders it; both combine correctly. ✅ done.
- **Labels**: `frontend`, `ui`, `ux`

### FE-16 — Delete confirmation dialog (2 SP)
- **Description**: a small reusable modal shown before deleting a saved
  player, to prevent accidental data loss from a stray click.
- **Acceptance criteria**: deletion only proceeds after explicit
  confirmation; cancelling leaves the player untouched. ✅ done.
- **Labels**: `frontend`, `ux`

### FE-17 — Setup Wizard UI (5 SP)
- **Description**: a Control Panel section for entering FACEIT/Steam/
  Leetify API keys, with status dots showing configured/not-configured,
  calling `PUT /settings/api-keys`.
- **Acceptance criteria**: saving updates the status dots immediately;
  no `.env` editing or terminal use is ever required to get started.
  ✅ done.
- **Labels**: `frontend`, `feature`, `ux`

### FE-18 — Live Match Data (GSI) UI (5 SP)
- **Description**: a Control Panel section showing GSI connection
  status (polled from `/gsi/state`) and a one-click config file download;
  an in-overlay banner + "Load Live Roster" button appears automatically
  when a live connection is detected.
- **Acceptance criteria**: status updates within a few seconds of CS2
  connecting/disconnecting; the downloaded config file works with no
  manual editing. ✅ done.
- **Labels**: `frontend`, `feature`, `gsi`

### FE-19 — Safety indicator badge + detail (2 SP)
- **Description**: a small badge next to the player name (✓ / ⚠ / ?)
  reflecting public Steam VAC/game ban status, with full detail in the
  expanded row.
- **Acceptance criteria**: all three states (clean / banned / unknown)
  render with an explanatory tooltip. ✅ done.
- **Labels**: `frontend`, `ui`, `feature`

### FE-20 — Sidecar packaging (single .exe) (8 SP)
- **Description**: the backend is compiled into a single native binary
  (Node.js Single Executable Application + esbuild bundling, see
  `cs2-overlay-backend/scripts/build-sidecar.js`) and embedded into the
  Tauri app as a sidecar, auto-started/stopped by `main.rs`.
- **Acceptance criteria**: a release build launches the backend
  automatically with no user action, and shuts it down cleanly when the
  Control Panel closes. ✅ implemented (requires a local/CI build with
  Node 22.5+ and a Rust toolchain to produce the actual binary - not
  buildable inside this sandbox, see `BUILD.md`).
- **Labels**: `frontend`, `backend`, `packaging`

### FE-21 — Window state persistence + auto-update scaffold (3 SP)
- **Description**: `tauri-plugin-window-state` remembers window
  position/size across restarts; `tauri-plugin-updater` is wired in but
  disabled by default until a signing key and update feed are configured.
- **Acceptance criteria**: windows reopen at their last position/size;
  the updater plugin does not attempt any network call while disabled.
  ✅ done.
- **Labels**: `frontend`, `packaging`

### FE-22 — "FACEIT Mode": overlay-free tracker for anti-cheat safety (8 SP)
- **Description**: some anti-cheat systems (notably FACEIT AC) scan for
  always-on-top, transparent overlay windows, since that exact technique
  is also used by some ESP/wallhack cheats - even though CS Tracker's
  overlay only ever renders public API data and never touches game
  memory. "FACEIT Mode" is a toggle in the Control Panel that, when
  enabled, **never shows the separate overlay window** (not via its
  button, not via the global hotkey) and instead renders the exact same
  tracker UI **inline inside the Control Panel window itself** (shared
  rendering code, see `tracker-render.js`).
- **Implementation**: enforced in TWO layers for defense-in-depth:
  1. JS/UI layer (`launcher.js`): disables the overlay show/hide button,
     hides the overlay window if currently visible, shows the inline
     Tracker section.
  2. **Native Rust layer** (`main.rs`, `FaceitModeState`): the global
     hotkey handler checks an `AtomicBool` synced from the JS settings
     event before ever calling `window.show()` - this is the
     authoritative guarantee, since it means even a stray/leftover hotkey
     press cannot show the overlay while FACEIT Mode is on, independent
     of any JS-side bug.
- **Acceptance criteria**: with FACEIT Mode on, (a) the overlay window
  never becomes visible under any code path (button, hotkey, or a
  leftover previous "visible" state), (b) the inline Tracker section in
  the Control Panel supports the same roster lookup / compact view / save
  / GSI live-roster functionality as the overlay, (c) the setting persists
  across app restarts and is re-synced to the Rust side on every launcher
  startup. ✅ done.
- **Labels**: `frontend`, `feature`, `compliance`, `security`
- **Compliance note**: this does NOT claim or guarantee FACEIT AC (or any
  other anti-cheat) will never flag CS Tracker - it simply removes the
  specific "always-on-top transparent overlay window" technique from the
  equation entirely when the user chooses to enable it, for extra
  caution during ranked FACEIT play. See the root README's compliance
  section.

### FE-23 — First-launch Onboarding Wizard (gated setup) (5 SP)
- **Description**: `onboarding.html`/`onboarding.css`/`onboarding.js` - a
  full-screen setup wizard, visible by default on top of both the
  startup-loading overlay and the rest of the Control Panel, that blocks
  access to the app until both a FACEIT and a Steam Web API key are
  saved and confirmed via the existing `PUT /settings/api-keys` endpoint
  (Welcome -> API Keys (required) -> GSI config download (optional,
  skippable) -> Done). Reuses the existing SettingsController endpoints
  - no new backend behavior.
- **Acceptance criteria**: on a fresh install (no keys configured), the
  wizard is shown and the "Continue" button on the API Keys step stays
  disabled until both `faceitConfigured` and `steamConfigured` come back
  `true`; on a subsequent launch where both are already configured, the
  wizard is skipped immediately with no visible flash. ✅ done.
- **Labels**: `frontend`, `feature`, `ux`, `onboarding`

### FE-24 — New animated background themes: Cyberpunk & Team Spirit (5 SP)
- **Description**: `cyberpunk-bg.js` (`CyberpunkBackground`) and
  `teamspirit-bg.js` (`TeamSpiritBackground`) - two new canvas-based
  animated "App Background" modes in the Appearance tab, following the
  exact same plug-in architecture as `MatrixRain`/`GalaxyBackground`
  (`start()`/`stop()`/`updateOptions()`). Cyberpunk: a synthwave skyline
  (striped pulsing sun, blinking city silhouette, animated perspective
  grid floor, drifting neon particles, scanline overlay). Team Spirit: a
  monochrome tactical radar HUD (rotating sweep + rings, slowly shifting
  black/white duotone split panel, dust particles, occasional glitch
  flash) with the Team Spirit logo centered inside the radar rings.
- **Acceptance criteria**: both selectable from the "Mode" dropdown, each
  with its own "Speed" slider, live in both the small Appearance preview
  panel and the actual Control Panel background; persisted/restored like
  every other background mode. ✅ done.
- **Labels**: `frontend`, `ui`, `feature`

### FE-25 — Fix: "Custom image" background mode not actually applying (3 SP)
- **Description**: root cause - uploading an image only ever persisted
  `customBackgroundImage`, never `backgroundMode: "custom"`, unless the
  user had separately already clicked "Apply" after picking "Custom
  image..." from the dropdown. The small Appearance preview looked
  correct (it always reads the live dropdown value), which made the bug
  easy to miss, but the real Control Panel background - and the setting
  persisted across restarts - silently stayed on whatever mode was
  previously active.
- **Fix**: the upload/remove handlers now save `currentFormValues()`
  (which reflects the live "Mode" dropdown - "custom" whenever this row
  is even visible/interactable) merged with the new
  `customBackgroundImage`, instead of only merging on top of the
  last-saved settings.
- **Acceptance criteria**: picking "Custom image...", uploading a file,
  and restarting the app all show the uploaded image, with no need to
  separately click "Apply" first. ✅ done.
- **Labels**: `frontend`, `bug`, `appearance`

### FE-29 — Fix: "Load Live Roster" button silently doing nothing (2 SP)
- **Description**: the button (Overview tab "Current Match" section)
  previously had no loading state, no error message, and no
  empty-result message - a click that returned zero profiles (very
  common right after GSI first detects a match, since CS2 doesn't
  always send the `allplayers` roster block on every single GSI update,
  especially in the first few seconds) looked visually IDENTICAL to a
  network failure or a genuine "nothing happened" bug, since neither
  case ever rendered anything.
- **Fix**: the click handler now shows a loading state immediately (same
  `TrackerRenderer.renderLoadingState()` used by the manual roster
  lookup), and always renders an explicit result - success (the
  roster), a "GSI connected but no roster data yet, try again in a few
  seconds" message (the common case), a "GSI disconnected" message, or a
  real network-error message - never silent no-op.
- **Acceptance criteria**: clicking "Load Live Roster" always visibly
  changes the tracker area, whether the roster loads, is empty, or the
  request fails. ✅ done.
- **Labels**: `frontend`, `bug`, `gsi`, `ux`

### BE-19 / FE-30 — "FACEIT Match History" + clickable Match Summary popup (13 SP)
- **Description**: a new, GSI-FREE "FACEIT Match History" card (Player
  Summary tab, right after "Recent Form") lists the identifier's recent
  FACEIT matches (opponent, competition, score, W/L, time-ago), sourced
  purely from the official FACEIT Data API (`GET
  /players/:identifier/faceit-match-history` -
  `faceit-match-history.util.ts` `buildMatchHistoryList()`, reusing
  `FaceitClient.getPlayerHistory()`). Clicking a row opens a separate,
  native popup window (`match-summary.html`/`.js`/`.css`, opened via the
  new Rust command `open_match_summary_window` in `main.rs` - reuses
  the existing window label if the same match is clicked twice) showing
  the FULL per-match breakdown in the approved reference design: match
  hero (score, map, duration, MVP), a team-comparison bar (avg skill
  level / total kills / avg ADR), and both teams' full rosters (K/D/A,
  ADR, HS%, MVPs) - via a new `GET
  /players/:identifier/faceit-match-history/:matchId` endpoint
  (`buildMatchSummary()`, combining `FaceitClient.getMatchDetails()` +
  `getMatchStats()`).
- **Compliance/transparency note**: ADR is shown per-player ONLY when
  FACEIT's stats response actually includes it for that match
  (`adrAvailable` flag) - KAST and per-match ELO change are NEVER shown
  as fabricated numbers, since FACEIT's public Data API doesn't expose
  either on any documented endpoint; a single honest footer notice
  explains this instead of a fake or permanently-"N/A" column on every
  row (see `faceit-match-history.model.ts` doc comments for the full
  reasoning - follows the same "never fabricate a stat" principle
  already established by `map-pool.util.ts`'s `LEVEL_AVG_PLACEHOLDER`).
- **Architecture note**: the popup window is opened via a Rust command
  (not the JS `WebviewWindow` constructor) specifically so this feature
  needs ZERO new Tauri capability permissions - see
  `open_match_summary_window`'s doc comment in `main.rs`.
- **Acceptance criteria**: `faceit-match-history.util.spec.ts` covers
  W/L-relative-to-player computation, score/opponent orientation, full
  team/player stat extraction (with key-alias fallback), MVP flagging,
  and the roster-only fallback when match stats aren't available yet.
  ✅ done.
- **Labels**: `backend`, `frontend`, `feature`, `faceit`, `compliance`

### FE-27 — Fix: sidecar `node:sqlite` crash + settings not persisting across restarts (5 SP)
- **Description**: two related packaged-build-only bugs found via a real
  cross-machine install report, both fixed in `src-tauri/src/main.rs`
  `spawn_backend_sidecar()`:
  1. The sidecar (a byte-for-byte copy of whatever `node.exe` built it -
     see `build-sidecar.js`) crashed instantly on startup with
     `Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module:
     node:sqlite` on Node.js builds where `node:sqlite` still requires
     the `--experimental-sqlite` CLI flag (a console window flashing
     open/closed was the only visible symptom in a release build - see
     the "windows_subsystem = windows" no-console setup). Fixed by
     forcing `NODE_OPTIONS=--experimental-sqlite` on the sidecar's
     environment unconditionally, regardless of which Node patch built
     it.
  2. The backend's SQLite database (`notes`/`saved_players`/`settings` -
     including the FACEIT/Steam/Leetify API keys saved via the Setup
     Wizard/onboarding wizard) defaulted to a RELATIVE path
     (`./data/app.db` - see `configuration.ts` `database.path`), which
     resolves against the sidecar process's current working directory -
     not guaranteed identical on every launch. Fixed by resolving Tauri's
     own OS-standard app-data directory (`app.path().app_data_dir()`) up
     front and passing it to the sidecar via a `DATABASE_PATH`
     environment variable, so the exact same database file is reused on
     every single launch no matter how the app was started.
- **Acceptance criteria**: on an affected Node build, the sidecar no
  longer crashes on startup; saved API keys / saved players / settings
  persist correctly across an app restart on a packaged install. ✅ done.
- **Labels**: `frontend`, `backend`, `bug`, `packaging`, `reliability`

### BE-18 — Fix: esbuild-bundled sidecar breaks NestJS dependency injection (8 SP)
- **Description**: root cause of a real cross-machine bug report - the
  packaged sidecar crashed with `Cannot read properties of undefined
  (reading 'get')` inside `FaceitClient`'s constructor (and latently
  affected every other provider injecting `ConfigService` via
  constructor typing - `SteamClient`, `PremierClient`,
  `DatabaseService`, `SettingsService`, `GsiController` - `FaceitClient`
  simply crashed first/loudest because it calls `this.config.get(...)`
  directly in its constructor). Cause: `scripts/build-sidecar.js`
  (`build:sidecar`) previously ran esbuild DIRECTLY on the `.ts` source
  (`esbuild src/main.ts --bundle ...`) - esbuild's TypeScript support
  strips types/decorators syntactically but does NOT implement
  `emitDecoratorMetadata` (unlike real `tsc`), so the
  `Reflect.metadata('design:paramtypes', [...])` calls NestJS's
  constructor-based DI relies on were silently missing from the bundle.
  This never reproduced in dev mode (`npm run start:dev` via `ts-node`,
  which uses the real TypeScript compiler), only in a packaged/sidecar
  build - making it easy to miss until testing an actual installed
  build on a second machine.
- **Fix**: `build-sidecar.js` (and the `build:bundle` npm script, for
  consistency) now runs `tsc -p tsconfig.json --outDir dist-tsc` FIRST
  (preserving `emitDecoratorMetadata` output, per the existing
  `tsconfig.json`), and only then bundles the ALREADY-COMPILED plain
  JavaScript from `dist-tsc/` with esbuild - never bundling raw `.ts`
  source directly anymore.
- **Acceptance criteria**: a fresh `npm run build:sidecar` + `npm run
  tauri build` produces a sidecar that starts `FaceitClient` (and every
  other `ConfigService`-injecting provider) without a DI-related crash,
  verified via `cstracker-log.txt` on a real packaged install. ✅ done.
- **Labels**: `backend`, `bug`, `packaging`, `reliability`, `critical`

### FE-28 — Wire up the auto-updater end-to-end (8 SP)
- **Description**: completes the previously-scaffolded `tauri-plugin-updater`
  integration (FE-21) into a working feature:
  - Registers `tauri-plugin-process` (Rust `Cargo.toml`/`main.rs`) so the
    app can relaunch itself after installing an update, and adds the
    `process:default` capability permission.
  - Adds `bundle.createUpdaterArtifacts: true` and populated
    `plugins.updater.endpoints`/`pubkey`/`windows.installMode` placeholders
    to `tauri.conf.json` (still `active: false` until the one-time
    signing-key setup is completed - see BUILD.md).
  - New `updater.js` + a "Software Update" section in the Overview tab -
    shows the current version, checks the update feed silently on
    startup (only surfaces something if an update is found) or on
    demand via "Check for Updates", and a "Download & Install Update"
    button with live download-progress percentage, using the
    `window.__TAURI__.updater`/`window.__TAURI__.process` global APIs
    (`withGlobalTauri: true`, consistent with every other frontend file
    in this project - no bundler/npm-import step).
  - New `.github/workflows/release.yml` - builds the backend sidecar +
    signs + publishes a draft GitHub Release (installer + `latest.json`)
    via `tauri-apps/tauri-action` whenever a `vX.Y.Z` tag is pushed.
  - `BUILD.md` "Auto-update setup" - full one-time walkthrough (generate
    signing key pair, configure `tauri.conf.json`, add GitHub Actions
    secrets, tag a release).
- **Acceptance criteria**: with `plugins.updater.active` still `false`
  (shipped default), the Software Update section degrades gracefully
  (shows the current version, a clear "not configured yet" message on
  "Check for Updates", no crash); once the one-time setup is completed
  and a tagged release is published, an older installed build detects,
  downloads, verifies the signature of, installs, and relaunches into
  the newer version. ✅ done (end-to-end code complete; actually
  generating a real signing key pair / publishing a real GitHub release
  requires the Tauri CLI and a real GitHub repo, neither available in
  this sandbox - see BUILD.md for that one-time setup to run locally/in
  your own CI).
- **Labels**: `frontend`, `backend`, `packaging`, `feature`, `ci`

### FE-26 — Remove the static "Galaxy (built-in image)" option (2 SP)
- **Description**: the static built-in Galaxy JPEG background mode was
  removed from the "Mode" dropdown, superseded by the animated
  "Galaxy (animated - Milky Way)" `GalaxyBackground` canvas effect
  (already implemented, same visual theme, more polished). A migration
  in `settings-store.js` `loadSettings()` transparently remaps any
  previously-persisted `backgroundMode: "galaxy"` setting to
  `"galaxy-live"`, so existing users never see a broken/blank background
  after the update.
- **Acceptance criteria**: "Galaxy (built-in image)" no longer appears in
  the dropdown; a settings blob with the old `"galaxy"` value loads as
  the animated Milky Way effect instead. ✅ done.
- **Labels**: `frontend`, `appearance`, `cleanup`

### BE-20 / FE-31 — "Bejelentkezés FACEIT-tel / Steammel" (Account tab) (21 SP)
- **Description**: new `AuthModule` (backend) + Account tab + header
  avatar button (frontend) - lets the user link their own FACEIT and/or
  Steam account ONCE, independent of the existing `saved_players`
  feature (this is "who am I", not "who have I saved"):
  - **FACEIT**: OAuth2 Authorization Code + PKCE (`FaceitOAuthService`) -
    CSRF `state` + PKCE `code_verifier`/`code_challenge` persisted
    server-side per login attempt (`OAuthStateService`), token exchange
    via HTTP Basic client auth, own profile fetched from FACEIT's
    userinfo/resource endpoint, best-effort level/ELO enrichment via the
    existing `FaceitClient` (Data API).
  - **Steam**: OpenID 2.0 "Sign in through Steam" (`SteamAuthService`) -
    no app registration needed (unlike FACEIT); the callback assertion is
    independently re-verified directly with Steam
    (`openid.mode=check_authentication`) before ever trusting the
    claimed SteamID64, so a forged/replayed callback can't spoof a login.
  - **Storage**: new `linked_accounts` SQLite table - access/refresh
    tokens ALWAYS encrypted at rest (AES-256-GCM,
    `token-crypto.util.ts`, a per-machine auto-generated key stored next
    to the database) - never plain text, never returned by any
    controller response. "Unlink" fully deletes the row (tokens
    included), not just a UI-side hide.
  - **Desktop UX**: login always opens in the user's SYSTEM DEFAULT
    BROWSER (`tauri-plugin-opener`), never inside the app's own webview -
    the standard, secure pattern for OAuth in desktop apps. The Account
    tab polls `GET /auth/status` after a login click to detect
    completion (no Tauri deep-link/custom-protocol handling needed).
  - **Auto-recognition**: Player Summary now auto-loads the linked
    FACEIT/Steam account's own profile on first visit (if the user has
    never manually searched anyone before) instead of requiring manual
    nickname entry.
- **Acceptance criteria**: linking either provider persists across app
  restarts; tokens are unreadable by opening the SQLite file directly in
  a text editor; unlinking removes the row entirely; a forged Steam
  callback (skipping the `check_authentication` re-verification) is
  rejected. ✅ done (FACEIT OAuth endpoint URLs are best-effort, sourced
  from FACEIT's public docs + well-known open-source provider
  implementations - not live-tested from this sandbox, see BUILD.md
  "FACEIT OAuth setup").
- **Labels**: `backend`, `frontend`, `feature`, `security`, `auth`

### BE-21 / FE-32 — Real `LeetifyClient` (official Public API) + "My Leetify Stats" (13 SP)
- **Description**: replaces the previous feature-flagged stub with a
  real integration against Leetify's official Public CS API
  (api-public-docs.cs-prod.leetify.com, `_leetify_key` header) - see
  `leetify-profile.model.ts` for the full Developer Guidelines
  compliance notes this follows:
  - Metrics shown EXACTLY as returned (never rescaled/renamed) - only
    `aim`/`positioning`/`utility` are bar-charted (genuinely 0-100 per
    Leetify's own docs), `clutch`/`opening`/`ctRating`/`tRating` are
    shown as plain signed numbers (a different, delta-style scale -
    bar-charting them the same way as the 0-100 dimensions would
    misrepresent the data).
  - NO per-weapon (e.g. AK-47/M4A4/AWP spray) breakdown - the official
    API doesn't expose one, and none is fabricated.
  - The official, unmodified "Data Provided by Leetify" badge image is
    shown wherever Leetify data appears (tracker rows, Player Summary,
    Account tab), linking to leetify.com - never resized/recolored.
  - Nothing from Leetify's response is ever persisted to this app's own
    database (`getFullProfile()` always fetches fresh).
  - Defensive alias-based field extraction throughout
    (`extractNumber()`/`extractString()`) - an unexpected/renamed field
    in Leetify's actual JSON degrades to "N/A" for that one field, never
    a crash.
- **Acceptance criteria**: `getPlayerRating()` keeps its pre-existing
  return shape (zero changes needed at the tracker-row/Player-Summary
  call sites beyond the bar-chart-scale fix); `getFullProfile()` powers
  the new Account tab "My Leetify Stats" card once a Steam account is
  linked. ✅ done (exact Leetify JSON field names are best-effort per
  the public OpenAPI schema + community TS wrapper docs - not
  live-tested with a real API key from this sandbox).
- **Labels**: `backend`, `frontend`, `feature`, `compliance`, `leetify`

---

## EPIC 5: Quality, compliance, documentation

### QA-1 — Unit tests (normalizer, service) (3 SP)
- **Acceptance criteria**: `players.normalizer.spec.ts` passes, critical
  branches (missing data, partial data, steamBans) covered. ✅ done.
- **Labels**: `testing`

### QA-2 — API key security review (2 SP)
- **Description**: verify no API key appears anywhere in client-side
  code, `.gitignore` covers `.env`, backend binds to `127.0.0.1` only,
  CORS restricted to an explicit allow-list.
- **Acceptance criteria**: `git grep -i "api_key"` finds no key in the
  client repo; CORS/host binding reviewed. ✅ done.
- **Labels**: `security`, `compliance`

### QA-3 — ToS checklist closeout (FACEIT, Steam, GSI) (1 SP)
- **Description**: documented checklist - rate limits respected, public
  data only, GSI restricted to an explicit allow-list with no position
  data, attribution needs assessed.
- **Acceptance criteria**: checklist signed off, recorded in the README.
  ✅ done.
- **Labels**: `compliance`, `docs`

### DOC-1 — README + setup guide (2 SP)
- **Acceptance criteria**: a new developer can start the backend and
  client within 15 minutes from the README alone; a non-technical user
  can build/install a distributable executable from `BUILD.md`. ✅ done.
- **Labels**: `docs`

### DOC-2 — CI pipeline (2 SP)
- **Description**: GitHub Actions workflow running `npm run build` and
  `npm test` on every push/PR for the backend, to catch build-breaking
  errors (like the historical broken `authHeaders` syntax error) before
  they reach a release.
- **Acceptance criteria**: workflow runs on push/PR and fails the build on
  a compile or test error. ✅ done (`.github/workflows/ci.yml`).
- **Labels**: `ci`, `testing`

---

## Explicitly excluded tickets (never added to any sprint)

These are **intentionally** never taken into any sprint:
- CS2 memory reading / offset-based data extraction.
- DLL injection or hooking into the game's renderer.
- Automatic lobby/scoreboard screen scraping (OCR) - legally/ToS-wise
  unclear without prior validation.
- Any form of anti-cheat (VAC) circumvention.
- Collecting/storing players' private data without consent.
- Requesting/processing other players' position, velocity, or visibility
  data through GSI (wallhack/radar-equivalent functionality) - explicitly
  and permanently out of scope regardless of demand.

If any of these come up as a request, the recommended alternative is
already implemented where applicable (Game State Integration, see
EPIC 3 BE-16 and EPIC 4 FE-18) or should go through a dedicated
legal/ToS-approved feature-spike ticket.
