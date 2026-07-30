# CS Tracker Backend Gateway

The NestJS-based backend API gateway for the CS Tracker desktop stats
overlay project. Its job: fetch, normalize, cache, and rate-limit public
FACEIT and Steam data for the desktop overlay client (Tauri), plus accept
optional live match data from CS2's official Game State Integration (GSI).

## Important, intentional limitations

- **No CS2 memory reading, process injection, or overlay hooking.**
- **No automatic lobby/scoreboard screen-scraping** - player identifiers
  (Steam ID / FACEIT nickname) are either entered manually via
  `/match/resolve-players`, or supplied automatically and safely through
  the official GSI mechanism (see below) - never through OCR or reading
  the game's memory/screen.
- Only **public** data is used (FACEIT Data API, Steam Web API).
- API keys are stored **only** in the backend's local SQLite database
  (`data/app.db`) on the user's own machine, and are never sent anywhere
  except the official FACEIT/Steam/Leetify APIs.
- The server binds to **127.0.0.1 only** - it is not reachable from the
  LAN or other machines.

## Setup

You no longer need to manually create a `.env` file - the Control Panel's
**Setup Wizard** lets you enter your FACEIT/Steam API keys from the UI,
and they're saved to the local SQLite database. `.env` is still supported
for advanced/dev/CI use (see `.env.example`).

```bash
npm install
npm run start:dev
```

Node.js **22.5+** is required (the `node:sqlite` built-in module is used
for persistence - no native addon compilation needed).

> **Troubleshooting**: on some Node 22.x releases (roughly 22.5 - 22.12),
> `node:sqlite` requires the `--experimental-sqlite` CLI flag. If startup
> fails with an error mentioning `node:sqlite`, run
> `node --experimental-sqlite -r ts-node/register src/main.ts` instead of
> `npm run start:dev`, or upgrade to a newer Node 22.x/24.x patch where
> this is no longer flag-gated.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Lightweight health check, makes no external API calls |
| GET | `/players/search?query=` | Search by name / Steam ID / FACEIT nickname |
| GET | `/players/:identifier/summary` | Full normalized player card (every feature in one call) |
| GET | `/players/:identifier/faceit` | FACEIT rank + detailed stats (lifetime + per-map + commendations) |
| GET | `/players/:identifier/leetify` | Leetify rating (N/A until a ToS-compliant data source is configured) |
| GET | `/players/:identifier/premier` | CS Rating (CS2 Premier - N/A for other players, no official API exists) |
| GET | `/players/:identifier/safety` | Public Steam VAC/game ban status |
| POST | `/match/resolve-players` | Resolve a manually entered list of up to 10 players (`{ "identifiers": [...] }`) |
| GET | `/saved-players?search=&sortBy=&sortDir=` | List of saved players (snapshot + note), with search/sort |
| POST | `/saved-players/:identifier` | Save a player (called by the overlay when clicking a name) |
| POST | `/saved-players/:identifier/refresh` | Refresh a saved player's snapshot |
| PUT | `/saved-players/:identifier/note` | Save a note for a saved player (`{ "text": "..." }`) |
| DELETE | `/saved-players/:identifier` | Remove a player from the saved list |
| GET | `/settings/status` | Whether API keys are configured (boolean only, never the raw key) |
| PUT | `/settings/api-keys` | Setup Wizard: save API keys |
| POST | `/gsi` | Receives live match state from the CS2 client (GSI) |
| GET | `/gsi/state` | Current GSI connection status + map/round info |
| GET | `/gsi/roster` | Current GSI roster, auto-resolved into normalized profiles |
| GET | `/gsi/config-file` | Downloads a ready-to-use GSI `.cfg` file with your token pre-filled |

> Notes are only ever available through the `/saved-players/*` endpoints -
> there is no standalone `/players/:id/note` endpoint, since notes are a
> Control Panel (main app) feature only, not part of general player
> lookups.

### Feature coverage

| Feature | Where it's implemented | Status |
|---|---|---|
| FACEIT rank | `PlayerProfile.faceit.level/elo` | ✅ Live data (FACEIT Data API) |
| Faceit stats in detail | `PlayerProfile.faceitMapStats` (`/players/:id/faceit`) | ✅ Live data, per-map breakdown |
| CS Rating | `PlayerProfile.premier` (`/players/:id/premier`) | ⚠️ N/A until Valve provides a public API - see `PremierClient` |
| Leetify ratings | `PlayerProfile.leetify` (`/players/:id/leetify`) | ⚠️ N/A until official Leetify API access exists - see `LeetifyClient` |
| Commendations | `PlayerProfile.commendations` | ⚠️ N/A until the FACEIT Data API documents this endpoint |
| Recent results (W/L) | `PlayerProfile.recentResults` | ✅ Live data, from FACEIT's official `/players/{id}/history` |
| Safety indicator (VAC/game bans) | `PlayerProfile.steamBans` (`/players/:id/safety`) | ✅ Live data, from Steam's official `GetPlayerBans` |
| Saved players + notes | `SavedPlayersModule` (`/saved-players/*`) | ✅ Fully working, SQLite-backed; Control Panel only, not the overlay |
| Setup Wizard (API keys) | `SettingsModule` (`/settings/*`) | ✅ No `.env` editing required |
| Live match data (GSI) | `GsiModule` (`/gsi/*`) | ✅ Official Valve GSI mechanism, strict allow-list, no position/wallhack data |

## Structure

```
src/
  config/            # env-based configuration
  database/          # SQLite (node:sqlite) connection + migrations
  settings/          # Setup Wizard API key storage + GSI auth token
  gsi/                # Game State Integration ingest/state/config-file
  players/
    clients/         # FACEIT, Steam, Leetify, Premier (CS Rating) HTTP clients
    dto/             # incoming request validation (class-validator)
    models/          # normalized PlayerProfile model
    players.normalizer.ts  # source-agnostic data merge + recentResults computation
    players.service.ts     # business logic + cache + bounded-concurrency resolve
    players.controller.ts  # REST endpoints + rate limit guard
    players.module.ts
  notes/
    notes.service.ts    # low-level, reusable key-value note store (SQLite)
  saved-players/
    saved-players.service.ts    # SQLite store + PlayersService/NotesService composition
    saved-players.controller.ts # /saved-players/* endpoints
  health/             # /health endpoint
  app.module.ts
  main.ts
scripts/
  build-sidecar.js    # bundles the backend into a single native binary (Tauri sidecar)
```

## Sidecar packaging (single .exe)

To let the Tauri desktop app run the backend as an embedded background
process (so end users only ever run ONE .exe, no separate
`npm run start:dev` step), build a self-contained binary:

```bash
npm run build:sidecar
```

This uses `esbuild` to bundle the backend into a single CommonJS file,
then Node.js's built-in **Single Executable Application (SEA)** feature
(no third-party packager like `pkg`/`nexe` - those are largely
unmaintained) to produce a native binary, and copies it into
`../cs2-overlay-frontend/src-tauri/binaries/`, from where Tauri's
`externalBin` bundling picks it up automatically. See
`scripts/build-sidecar.js` for the full explanation and requirements
(Node 22.5+; macOS also needs Xcode Command Line Tools for code signing).

## ToS / compliance reminder

Before a production rollout, review the FACEIT Developer ToS, the Steam
Web API terms of use, and any other third-party API's (e.g. csstats.gg)
own policies. Respect rate limits, and never display data a player hasn't
made public.

**Leetify, CS Rating (Premier), and Commendations**: at the time of
writing there is no confirmed, official, third-party-accessible public
API for these. `LeetifyClient`, `PremierClient`, and
`FaceitClient.getPlayerCommendations` therefore intentionally return
"N/A" until an approved data source is wired in - do **not** implement
unofficial page scraping or reverse-engineered private API calls here, as
that could violate the relevant provider's ToS.

**Game State Integration (GSI)**: this project only ever requests
name/team/kill-death-assist/score data through GSI. It NEVER requests or
processes other players' position, velocity, or visibility (health/armor)
data - doing so would effectively enable a wallhack/radar feature, which
is explicitly and permanently excluded. See `GsiService`'s header comment
and `gsi-config-file.util.ts` for the enforced compliance rules.

## Related project

The desktop overlay client (Tauri, always-on-top, transparent window) is
in the `../cs2-overlay-frontend` folder. See that README for setup and
build instructions, including how to produce a distributable `.exe`.
