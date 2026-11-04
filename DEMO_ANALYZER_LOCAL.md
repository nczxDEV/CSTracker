# Local Demo Studio preview 0.3.7

No analyzer changes have been pushed to GitHub.

## Try it

1. Quit the previous preview completely using its tray menu (closing the launcher may only minimize it).
2. Run `cs2-overlay-frontend/src-tauri/target/debug/bundle/nsis/CS Tracker Demo Analyzer Preview_0.3.7_x64-setup.exe`. This updates the separate preview app.
3. Choose **Skip setup** to enter the main window, then **Demo Analyzer** in the launcher. **Demo Studio** opens in a separate window. No API keys are needed for replay. The previous demo-mode preference is migrated to Skip setup; it no longer opens a replay window on startup.
4. Click **Import .dem**, then choose the recording. The app remains responsive and reports parsing stages. Large recordings can take a minute or more in this debug preview.
5. Select rounds along the bottom, use Play / Space, seek, or click events. Scroll to zoom; drag the map to pan. Left / right arrows seek five seconds when an input or button is not focused.

## Included

- Separate dark replay window with grayscale radar, blue CT and orange T cards.
- Player movement, view direction, health, weapons, armor, helmet, defuse kit and inventory.
- Recorded grenade flight paths, smoke and fire lifetimes. Smoke / fire circles are schematic, not exact coverage or line-of-sight simulation.
- Cash and equipment at the selected time; team equipment and buy classification at freeze end.
- Kill, bomb and grenade events, round selection, speed, seek, zoom and map layers.
- Background import with progress stages, and automatic backend startup in packaged previews.

## Validation and limits

The supplied Ancient recording passes parser checks: 16 rounds, 117 in-round kills, 10,200 frames, 257 grenade tracks, 123 smoke/fire areas and 32 team economy records. Earlier totals included pre-round activity; the round start fallback now excludes that activity.

Frontend logic was exercised with the real parsed recording in a mocked DOM/canvas: all 16 rounds, 80 seeks, economy, cards, playback, zoom and import passed. This is not visual verification of the installed WebView.

The recording is processed locally and kept in memory. Importing another replaces it. Closing only the replay window preserves it until the app fully exits. Unsupported maps show an unavailable-radar message. Missing frames/economy are reported; no persistent replay library is included yet.

Review the bundled radar assets' attribution/licensing in `cs2-overlay-frontend/src/assets/demo-radars/README.md` before public distribution.

## AI round review in 0.3.2

Open **AI ROUND SUMMARY** below the replay. Search names and select one to five players (yourself, duo or teammates), enter your own OpenAI API key, select Hungarian or English, and click **Generate round review**. The default model is `gpt-4.1-mini`; the model field is editable. Reviews cover strengths, moments to rewatch, a next-round focus and supported team coordination. Timestamp links seek to the supplied evidence.

The key is kept only in the current window, and is passed to the Rust HTTP client for the request. **Clear key** removes it from the UI. No key is written to application storage. Requests go directly to OpenAI over HTTPS with response storage disabled. They use your OpenAI API balance. The selected round's player names, aliased actors, events, economy and sparse state/proximity context are sent; the .dem file, its local filename and Steam IDs are excluded. AI judgments can be mistaken. Audio, exact visibility, aim accuracy and grenade effectiveness are not measured; the instructions explicitly require acknowledging those limits.

The integration follows the official [Responses Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Missing keys, quota/rate limits, inaccessible models, timeouts, refusals, incomplete responses, incorrect players and invalid evidence references produce visible errors.

The 0.3.2 parser test passed with the real demo and checks that evidence is built for all 16 rounds without leaking selected Steam IDs or filenames. The yaw boundary regression tests, AI response validation tests and mocked frontend flow tests pass. A live OpenAI request was not tested because no user API key was supplied; the installed WebView has not been visually verified here.

The rotation fix uses the shortest arc across 359/0 and +180/-180 degree boundaries, preventing artificial full turns between samples.

## Library and interval coaching in 0.3.3

Demo Studio starts on the import home with **Past demos** and a small **AI Coach Setup** card using the attached PNG. The card opens a modal before any demo is imported; the key remains session-only. Setup is also reachable inside a replay.

New imports are stored as processed replays in the preview app's local app-data `demo-library` folder. Past demos displays filename, map, import time, rounds and player names, with search. A cache can reopen without the original .dem. Reimporting the same unchanged source reuses the cache. Earlier versions kept data only in memory: their imports must be imported once in 0.3.3 to populate this library. Cache files take disk space and contain local player/replay data; they are not automatically uploaded.

Import and cache-open operations display a smooth indeterminate loading animation plus the actual processing stage. No estimated completion percentage is invented. Return with **Past demos**.

For interval coaching, select players, enable **Analyze a selected interval**, enter start/end seconds or mark the current playback time, and write a question or use a suggested prompt. **Preview interval** plays that segment and stops at its end. Generate sends filtered events and sampled context for the interval; freeze-end economy and a preceding state are explicitly labeled context. This is a separate question per request, rather than a persistent chat conversation.

Cache round-trip tests use the real parsed recording and verify reopening after the source is removed, metadata listing and fingerprint invalidation. Clip filtering/bounds tests and mocked UI tests cover home/setup/loading, coaching, stale replies, 16 rounds and 80 seeks. Live OpenAI calls and installed WebView visual QA remain unverified here. The first demotár increment is library + cache; multi-match personal development charts are a later increment.

## Layout update in 0.3.4

AI Coach Setup is now a compact full-width row beneath Past demos, with a 44px image and a 76px minimum row height. The library occupies at least the first screen, so the coach entry is reached by scrolling.

## Model picker in 0.3.5

In AI Coach Setup, enter an OpenAI API key and click **Load models**. A dropdown is populated from that key's `GET /v1/models` response. Known non-text model names are filtered out; catalog membership does not guarantee Responses + Structured Outputs compatibility, which is checked when generating a review. Changing/clearing the key resets the dropdown. Errors are shown without exposing the key or raw API response. Keys stay session-only. Model listing and clearing were tested with a mocked response; a live key-based list has not been tested here.

API source: [OpenAI List models](https://developers.openai.com/api/reference/resources/models/methods/list).

## Player picker and loader in 0.3.7

The player selector is a compact native collapsible menu with search and checkboxes. Its closed state shows selected count and a brief name summary. **Duo coordination** is only displayed at exactly two selected players; it disappears at zero, one, or three to five. The selection-count behavior was tested in the mocked DOM flow.

The loading overlay uses the provided four-dash pink CSS animation, plus `assets/cstracker-loading.png`, extracted from the supplied JPG using built-in Imagegen. Actual alpha transparency was verified. The explicit animation stays active (at a slower rate) under reduced-motion preferences. Visual verification in the installed WebView remains pending.
# Local preview 0.3.8 — player cards

Compact team-colored cards display locally bundled equipment SVG silhouettes, current inventory, active weapon highlighting, armor/helmet, defuse kit and a health bar. Current cash sits beside each card. Cash uses Windows Bahnschrift with condensed fallbacks to approximate the game's numeric typography; the original CS2 font is not bundled.

Equipment sources and ownership are recorded in `cs2-overlay-frontend/src/assets/equipment/README.md`. Every nonempty inventory entry in the real demo fixture resolves to a local icon. Mocked DOM/canvas smoke verification passed across 16 rounds and 80 seeks; live WebView appearance has not been visually verified.

# Local preview 0.3.9 — Gemini coach

AI Coach Setup now offers OpenAI and Google Gemini. Switching provider clears the in-memory key and model selection. Gemini lists generateContent-capable models from Google's API (including pagination), sends the same evidence and coaching instructions using structured JSON output, and validates returned reviews with the existing player/citation checks. Truncated or blocked Gemini results are rejected. Keys use request headers; redirects are disabled. No keys are persisted.

Gemini API references: https://ai.google.dev/api/generate-content and https://ai.google.dev/api/models . Live Gemini generation requires a user-provided key and was not exercised during this local build. Six Rust tests and the mocked UI regression passed.

# Local preview 0.3.10 — match detail and replay events

Final grenade source verification: the recording contains 258 grenade weapon-fire records, all with resolved names (0 unnamed). Weapon strings include a `weapon_` prefix, now removed before filtering. Trajectory owner metadata alone was absent in this recording. Raw grenade_thrown events are used when present; otherwise the resolved weapon-fire records supply the event rows.

Fixed premature CSS comment terminator that swallowed the match-summary theme variables, causing the white background and unreadable text. Added a self-contained dark match detail redesign and FACEIT rating column. Recent match list joins a single recent-player-stats response by Match Id and shows supplied ratings plus an average in Player Summary; missing ratings stay unavailable. The statistical MVP pick remains explicitly distinguished from an official FACEIT designation. The documented public Data API has no highlight-video endpoint.

New local SVG emblems cover Ancient, Anubis, Brewery, Overpass, Train, Vertigo and Ravine. Grenade event rows use weapon-fire throw records with resolved player identities instead of ownerless trajectory records. The replay cache schema is now v2: reimport older demos to rebuild the event list.

# Local preview 0.3.11 — dead-player identity

The parser can replace destroyed player pawns with duplicate `bot:unknown` / Unknown dead rows. Replay normalization removes these anonymous placeholders and restores missing confirmed victims using their last identified state and the kill event's target Steam ID. Names on stable IDs are retained. Restored players have zero health and empty inventory; missing live players are not guessed by list order or proximity. Runs both after parsing and on cached replay load/round retrieval.

Real-fixture regression passed across 16 rounds, correcting 21,786 anonymous dead samples; validates unique IDs, known names and zero health after confirmed deaths. Existing cached demos use the repair when opened, without reparsing the original file.

# Local preview 0.3.12 — collapsible coach

The full AI Round Summary panel starts collapsed. Its compact summary control opens and closes player selection, interval controls and generated reviews together. Native details/summary supports keyboard activation; collapsing preserves current selections and results. The separate home-page AI Coach Setup entry remains available. Mocked UI regression passed.

# Local preview 0.3.13 — radar killfeed and hover callouts

Round events now appear at the radar's top-right as a CS-style recent-event feed: last six events in the preceding ten replay seconds, never future events. Kills use team-colored names, bundled weapon silhouettes and the headshot icon; utility throws are muted text ("flashed" means a flashbang was thrown, not proof of enemy blindness). Click a row to seek. The S/M/L button cycles feed width and text size.

Hover callouts cover every bundled radar: Ancient (including night), Anubis, Cache, Dust II, Inferno, Mirage, Nuke, Overpass, Train, Vertigo, Italy, Office, Baggage and Shoots (including night). Official bounding boxes were extracted from the locally installed map VPKs; Office uses manually authored community polygons because the local map contains no env_cs_place entities. Ancient Elbow has a community override. Names disappear on pointer leave/drag/zoom; pointer coordinates invert pan, zoom and CSS scaling. For source/geometry limitations see assets/demo-radars/CALLOUT_SOURCES.md.

Six Node math/coverage tests passed, including all radar assets, upper/lower floors and transformed pointer coordinates. Mocked replay/coach regression and killfeed size/seek checks passed. Live WebView appearance has not been visually verified.

