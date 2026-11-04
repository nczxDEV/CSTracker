# Player HQ local preview — 0.4.0

Local development only. No GitHub publication or installer is part of this milestone.

Layout refinement: HQ now explicitly opts out of the launcher's two-column masonry. It is a single full-width page that grows vertically and uses the launcher's normal mouse-wheel scrolling. The five content panels start open and can be individually collapsed; opening one never closes another. Filters/data freshness and metric explanations remain optional disclosures. Show more reveals six additional matches at a time. Existing journal entries, links and cached records are preserved. Account access uses the existing top-right header avatar, whose broken CSS comment was repaired; the duplicate HQ Account button was removed. The interaction check covers paging, simultaneous open panels and objective persistence; actual WebView visual review remains outstanding.

The scrolling layout executable is `cs2-overlay-frontend/src-tauri/target/debug/Player-HQ-Scroll.exe`. It is built with `bundled-backend,tauri/custom-protocol` and `TAURI_CONFIG` set to the Player HQ config, using an alternate output name because the running original executable was locked. Quit the older preview before starting this one so its backend port is released.

Navigation update: `Player-HQ-Minimal.exe` is the newest preview. It retains the original logo/header and account avatar, replacing the nine-tab strip with Menu, a current-page breadcrumb and Player HQ / Demo Studio shortcuts. All existing pages remain available in Menu. Page changes update the breadcrumb and dismiss Menu; Escape restores focus and outside clicks dismiss it. Narrow windows wrap shortcuts onto a second row. Navigation route coverage, dismissal/focus behavior and the existing HQ interaction check pass; actual WebView visual review is still needed.

## Audit and model

- Player Summary performs a public profile lookup; it is independent of the linked local user's identity. Saved players remain in the existing backend SQLite table, including their existing notes. HQ offers them as lookup suggestions.
- FACEIT history previously fetched 20 matches without durable client history. HQ now retains collected records by exact FACEIT match ID, up to 1,000 per looked-up player. Refresh retrieves the current API page, not a complete historical backfill.
- Match details already have a separate dark window. HQ adds an inline dark roster with the same API data and cached offline access.
- Demos live in Tauri app-data/demo-library. HQ reads library metadata and computes compact player-round evidence in a blocking worker without changing the active viewer. Existing caches are not rewritten.
- HQ uses a new versioned localStorage key, `cstracker-player-hq-v1`. Existing saved players, settings, notes, linked accounts and demo caches are untouched. Unsupported/damaged HQ data is preserved and saving is blocked with an explanation.
- Online record: namespaced ID, external ID, lookup identifier, source, playedAt, fetchedAt, nullable map/result/kills/deaths/rating, teammates and display score. Import time is never presented as played time.
- Links retain separate records and require an explicit confirmation that a chosen demo is the same match. The relationship stores method and confirmation timestamp. A demo cannot silently attach to multiple online matches. No fuzzy or name-based auto-matching is implemented.

## Implemented milestones

1. Account diagnostics and cancellation: `/auth/status` exposes provider readiness without secrets. Missing FACEIT OAuth configuration is explained before opening a browser. Browser-opening errors propagate; there is no embedded Tauri login fallback. Polling has an explicit cancel button, server-side state invalidation and a visible timeout. Focus refreshes connection status. Leetify is not repeatedly requested on every auth poll. Steam callbacks validate expected endpoint, mode, identity and return URL before verification with Steam.
2. HQ dashboard: cached matches, date/map/teammate filters, match counts, completed-result win rate, mean supplied FACEIT rating, aggregate K/D and map breakdown. Comparison uses equal 7/30/90-day recent and previous periods. Comparison ignores the explicit library date range, retaining map/teammate filters; its selector specifies both periods. Unknown and future dates do not enter period comparisons.
3. Unified workspace: FACEIT match list, explicit demo links, local demo queue, inline match details and direct replay opening. Journal example links open an exact round in an existing or newly created Demo Studio window.
4. Demo evidence: explicit player ID selection, CT/T and teammate filters; first-event opening kills/deaths, parser trade flags, survival at the final sampled frame, and attributed utility throws. These are local demo metrics, not official FACEIT scores.
5. Journal: per-profile notes and weekly objectives can be created, edited, completed and reopened. Two or more opening deaths produce an optional review objective with a demo-round link. Recommendations require acceptance.
6. Offline support: history, loaded match details, computed metrics, links and journal persist locally. Manual history refresh is bounded to once per minute; details have a ten-minute cache. API failures preserve previous snapshots. A failed history response is not treated as a successful empty history.

## Demonstration steps

After the local build completes, run `cs2-overlay-frontend/src-tauri/target/debug/cs2-overlay-frontend.exe` with its generated backend sidecar beside it. Fully quit an earlier preview first to avoid sharing port 3000 with an older backend.

1. Open Player HQ (the default dashboard). Choose a saved player or enter a FACEIT nickname, then Load player. Account login is not required for a public lookup; the FACEIT Data API key still needs configuring through Setup.
2. Set map/date/teammate filters and choose comparison periods. Missing ratings remain N/A; the sample count identifies how many ratings were supplied.
3. Open a match for dark details, then Link demo and explicitly confirm the same match. Open its replay.
4. Analyze a local demo, explicitly choose a player, and switch side filters. Accept a suggested objective or create your own.
5. Save a journal note, complete/reopen an objective, restart and check persistence. Revisit a loaded match offline to inspect its cached details.

## Validation and practical limits

### Regular app installer

The user requested integration into the regular installed app rather than another standalone preview. Build with `node node_modules/@tauri-apps/cli/tauri.js build --bundles nsis --config src-tauri/tauri.local-app.conf.json` from the frontend directory. This uses the regular `CS Tracker` product and `com.cstracker.app` identity, version 0.4.0, with the bundled backend. It does not publish a GitHub release or generate updater artifacts. The earlier separate preview identity's local settings are not automatically merged into the regular app's storage.

### Glacial introduction

Latest local preview: `cs2-overlay-frontend/src-tauri/target/debug/Player-HQ-Glacial.exe`.
The selected Glacial intro replaces onboarding's welcome step, using the restored HD logo, a three-second rotation and 600–650 weight supporting text/buttons. Setup and Skip retain their existing actions; later setup steps are unchanged. Appearance → Preview introduction reopens the intro without clearing saved accounts or configuration. The separate two-second returning-player welcome remains available.
Motion is driven by requestAnimationFrame, stops on leaving the intro, and only autoplays when reduced motion is off. Explicit Play works regardless of that preference. Syntax checks, ten existing regression checks, and intro playback/cancellation checks passed. Desktop visual review is still pending. No installer or GitHub publication was made.

### November 2 navigation and identity preview

- `cs2-overlay-frontend/src-tauri/target/debug/Player-HQ-Centered.exe` is the current local executable. Quit the previous preview completely before opening it. No installer or GitHub update was made.
- Navigation contains only a centered Menu. All ten destinations remain in its dropdown; the logo and header account control remain. The header no longer shrinks when HQ content exceeds the window height.
- HQ now follows the linked FACEIT provider ID and display name. Log in opens Account; linking automatically opens the matching cached snapshot or fetches history when no snapshot exists. Explicit refresh remains bounded. Steam alone does not identify the FACEIT player.
- Supplied HTTPS FACEIT avatar URLs appear on HQ; account/header avatars use provider metadata. No photo is fabricated when metadata is unavailable. The signed-out placeholder remains.
- A separate, non-secret last-identity cache supports offline viewing, marked connection unverified. A confirmed unlink clears it, without deleting historical match/journal data. Existing nickname-based snapshots remain stored; they are not silently merged with a provider ID.
- Ten frontend checks pass, including offline data, navigation, identity switching, logout and bounded automatic history loading. The preview executable builds successfully; live provider authentication and visual WebView review remain unverified.
- The user selected Player identity. The Account page now implements that layout, retaining both provider connections and cancellation/disconnect, with optional Leetify stats collapsed below.

### Player identity and returning-player welcome

- Latest executable: `cs2-overlay-frontend/src-tauri/target/debug/Player-HQ-Welcome.exe`. Fully quit the previous preview before starting this one. No installer or remote changes.
- Existing backend linked-account persistence remains authoritative. A new presentation-only local cache stores provider ID, display name and HTTPS avatar URL; it contains no credentials or tokens and is cleared when account status confirms logout.
- Returning users see a two-second greeting with their supplied profile name, circular photo and a soft rotating RGB glow. FACEIT is preferred, with Steam as fallback. Missing images use initials. Offline greetings explicitly say saved profile; offline photo availability depends on the image cache.
- A process-lifetime native claim prevents repeats on tray restores and WebView reloads. Appearance offers a persisted Welcome animation toggle and Preview welcome. Skip/Escape dismiss immediately; OS reduced-motion disables motion. The original setup wizard still handles first launch.
- Account status retries at most four times during startup (1.5-second request timeout, 300ms between attempts) while the sidecar starts. Provider OAuth configuration is still required for live FACEIT sign-in.
- Seventeen frontend checks pass, including welcome duration, preference persistence, repeat suppression, offline cache, logout, Escape, avatar fallback, navigation and existing HQ calculations. JavaScript syntax and local native build pass. Actual provider sign-in and desktop visual review remain unverified.
- Three animated first-launch concepts were presented separately, based on the supplied MP4. They are not installed as the setup screen pending a design choice. The AK concept uses the existing CS2 silhouette, not a full 3D weapon model.

- Backend TypeScript and Tauri builds checked. New model tests cover retained history, migration round trip, explicit linking, incomplete results, missing ratings, zero deaths, dates, comparison boundaries, side filters and unknown survival.
- Mock DOM interaction test covers cached offline rendering, filtering, objective persistence across reload and invoking a linked replay. This is not visual WebView validation.
- Mocked authentication tests cover Steam assertion verification/replay rejection/cancellation/wrong return URL, FACEIT PKCE, missing OAuth configuration, and persisted state consumption/expiry.
- Real isolated sidecar + SQLite test covers readiness, missing FACEIT OAuth response, loopback Steam redirect, cancellation, identity persistence across process restart and persistent unlink. No user database is used.
- Existing 16-round/80-seek replay and coach smoke test passes. Real cached demo metrics verify 160 named player-rounds and 117 deaths.
- Live Steam/FACEIT provider completion has not been exercised. This checkout has no configured FACEIT OAuth client ID/secret; a FACEIT Data API key cannot replace those. App-owner OAuth registration and a matching callback are required before live FACEIT login can be verified. See https://docs.faceit.com/getting-started/authentication/oauth2/ . No new relay or hosted authentication service has been deployed.
- Identity linking is persistent local identification; the dashboard uses the separately configured Data API. No new background OAuth refresh workflow is claimed.
- Current replay caches do not provide reliable utility damage, flash-blind effectiveness, full-match wall visibility, communications or intent. These are not fabricated. Survival is an end-frame observation, not a guaranteed official round-end statistic. Trade metrics retain parser definitions.
- Side filtering applies to demo rounds; online side-specific statistics are unavailable. Demo teammate filtering uses names in the cached roster; player identity selection uses the actual replay IDs.
- Cold-start UI layout and live account login still need user review in the desktop build before installer packaging.

## Reproduce checks

Frontend: `node --test tests/player-hq*.test.cjs tests/demo-math.test.cjs`

Backend: `node --experimental-sqlite node_modules/jest/bin/jest.js --runInBand auth-flow faceit-match-history`

Backend isolated process test: `node --experimental-sqlite scripts/player-hq-integration.cjs` (after build:sidecar).

Local executable without installer: `node node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --config src-tauri/tauri.player-hq.conf.json`

## Local 0.4.1 follow-up

### Local 0.4.4: welcome fade and optional GSI panels

The two-second welcome now fades its content to black, holds black briefly, then fades the black curtain to the launcher. GSI-only Current Match and My Match History panels are hidden until actual GSI packets confirm the local Steam identity, with confirmation remembered separately per Steam ID. Configuration controls remain available. Confirmation means previously observed GSI availability, not a claim that the config file still exists or that a game is currently connected. Account switches do not inherit another player's confirmation. Welcome lifecycle tests and the GSI visibility regression check pass; desktop transition appearance needs visual review.

### Local 0.4.3: HQ identity and profile header

FACEIT-only history/detail resolution now treats GUID identifiers as player IDs rather than nicknames. Regression checks cover the ID path and Steam-derived identities. Live verification with the saved account returned DRUNK-NOINFO and 20 history records from FACEIT. The Player HQ profile header spans the content width with avatar, level and ELO. Exact case-insensitive linked profile names DRUNK-NOINFO, McMacsu and xadez receive cosmetic name effects; only the first two receive Developer and Tester labels respectively. These labels confer no authorization or application privileges. Motion respects reduced-motion preferences. The installed WebView layout still needs user review.

### Local 0.4.2: Steam identity to FACEIT

Account status resolves the authenticated Steam ID through the official FACEIT Data API. The public FACEIT ID, nickname, avatar (Steam avatar fallback), level/ELO and fetch timestamp are persisted with `identitySource: steam-data-api`. This is public profile discovery, not FACEIT OAuth authorization. Existing FACEIT OAuth identities are preserved. Matching cached identity survives unavailable API responses; derived identity is removed after Steam logout/account switch. Late lookup responses cannot restore a logged-out identity. Refreshes are coalesced and bounded to once per Steam ID per ten minutes. A FACEIT Data API key and a FACEIT profile linked to that Steam ID are required. Live browser sign-in and desktop presentation still require local user review.

- Player Summary resolves a unique exact nickname regardless of capitalization via the official FACEIT search endpoint. Fuzzy or ambiguous results are never substituted. Verified live: `mcmacsu` resolves to `McMacsu` with the existing saved key.
- API settings retain entered password values after Save. Reloads display a synthetic saved-key mask; masks are never submitted as credentials and saved secrets are not returned to the frontend.
- Glacial setup fills the window and shares its automatically moving logo/podium scene across steps. Legacy completion flags do not skip this new introduction; Finish or Skip remembers completion thereafter. Removed Play animation and the Appearance introduction-preview control.
- Returning welcome runs for two seconds with a frame-driven RGB halo, cancellation and the existing Appearance toggle.
- Focused checks passed: 13 frontend checks and 4 backend lookup checks, plus JavaScript syntax checks and the backend sidecar build. Actual WebView appearance remains subject to desktop review.
- FACEIT OAuth remains unavailable until CSTracker is registered in App Studio and a controlled callback is configured. No OAuth credentials were invented and no live login completion is claimed.
