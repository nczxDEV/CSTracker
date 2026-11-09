# Deathmatch Finder — local milestone 1

Available from the main Menu → Deathmatch Finder, in a separate desktop window.

Implemented: public WarmupServer catalog, region/map/mode search, persistent favorites, reported population, local A2S query latency, player list dialog, and Steam connection requests. Quick selection measures at most 60 filtered servers with four concurrent workers, excludes empty servers and unknown/stale measurements, then selects lowest query latency within the chosen ping/free-slot limits. Join rechecks capacity. It does not reserve slots or confirm successful game entry.

Provider endpoint discovered in the provider's public page JavaScript:
https://warmupserver.net/api/servercards/query.php
This is a website endpoint, not a contracted stable API. Catalog responses are cached for 30 seconds. Provider snapshots and direct measurements are distinguished; query measurements expire after 30 seconds. VIP/F2P access is not guaranteed by reported capacity.

CYBERSHOKE and PRACC returned HTTP 403 to direct inspection. No workaround was attempted. Their integrations remain explicitly unavailable. No FACEIT average, avatars, K/D, HS%, TTK or provider ranks are invented. Standard A2S player responses provide name, score and duration only. Split UDP replies are currently reported as unsupported.

Native commands only query public IPv4 endpoints in the provider catalog and construct the Steam URL from a parsed socket address. No arbitrary shell commands or user-supplied URLs are executed.

Validation: 47 existing frontend tests passed; finder JS syntax checked; native address/malformed-string tests and actual catalog integration passed (79 valid endpoints). Three European endpoints returned A2S_INFO replies in 31–47 ms. Actual game joining and native visual acceptance have not been tested. No installer or GitHub publication.

Next: validate the native UI with the user, extend parser fixtures for UDP challenge/split responses, and investigate supported provider access for CYBERSHOKE/PRACC before promising multi-provider or FACEIT-based matching.

## 2026-11-08 — Glass appearance, PRACC and automatic ping

Implemented locally in the app, retaining favorites, quick join, server details, CYBERSHOKE statistics and FACEIT icons.

- Finder consumes the shared Appearance settings and live Tauri settings event, with a storage-event fallback. All existing animated/custom backgrounds, opacity and HUD/Glass styling are supported. Glass surfaces follow the supplied Glass HTML's subdued colors, blur, rounded edges and white primary action.
- Added public PRACC CS2 deathmatch catalog adapter: https://pracc.com/api/csgo/deathmatch/servers. Only public IPv4 CS2 DM endpoints are admitted. Other modes (retake) are excluded. Cached for 30 seconds alongside the other providers; individual provider failures are surfaced without dropping successful providers.
- PRACC supplies public nicknames, sometimes blank. The inspected response has no Steam IDs or FACEIT levels. Missing names and FACEIT data are explicitly unavailable; no nickname-based identity matching or fabricated stats.
- Added Guns / All weapons, Multi-CFG, Pistol, Headshot, AWP and Aim filters. Unknown modes remain in All types. Rotating CFG servers stay classified as CFG regardless of the current weapon phase.
- Removed the manual ping button. Automatic batches query up to 24 matching endpoints with four workers, rotating oldest measurements every 30 seconds. Measurements expire after 90 seconds. Filter changes trigger another check; hidden windows pause background work. Server catalogs refresh every 60 seconds when idle. Quick join waits for an existing measurement batch and rechecks candidates and capacity.

Verification: 50 frontend tests passed (including startup, Appearance event handling, automatic ping, hidden-window pause, PRACC rows and mode classification); three native parser/address tests and live provider test passed. Live test observed 506 valid endpoints, 34 PRACC DM servers with 139 named roster entries, and CYBERSHOKE session stats. Native Finder accessibility confirmed live server rows, FACEIT levels and automatically measured 35–85 ms pings. Native screenshot capture timed out, so pixel-level visual acceptance remains unverified. Actual Steam/game entry was not triggered.

Built target/release/cs2-overlay-frontend.exe with bundled-backend; no installer, commit, push or publication in this milestone.

