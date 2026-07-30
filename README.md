# CS Tracker

A desktop stats overlay for Counter-Strike 2: look up FACEIT/Steam stats
for up to 10 players (manually entered, or automatically via CS2's
official Game State Integration), displayed in a transparent,
always-on-top overlay window, with a companion Control Panel for
settings, saved players, and notes.

## Project layout

```
cs2-overlay-backend/    NestJS API gateway (FACEIT/Steam/Leetify clients,
                        caching, rate limiting, SQLite persistence, GSI,
                        Setup Wizard settings API)
cs2-overlay-frontend/   Tauri desktop client (overlay + Control Panel
                        windows, hotkeys, background customization)
BUILD.md                Step-by-step guide to producing a distributable
                        .exe / .app / .AppImage
```

## Quick start (development)

```bash
# Terminal 1 - backend
cd cs2-overlay-backend
npm install
npm run start:dev

# Terminal 2 - desktop client
cd cs2-overlay-frontend
npm install
npm run tauri dev
```

No `.env` editing is required to get started - open the Control Panel
that appears and use the **Setup Wizard** section to enter your FACEIT
and Steam API keys.

## Producing a single, distributable executable

See [`BUILD.md`](./BUILD.md) for the full walkthrough. In short: the
backend is compiled into a single native binary and embedded into the
Tauri app as a "sidecar", so the shipped result is one `.exe` (or
`.app`/`.AppImage`) that end users can install/run with no terminal, no
Node.js installation, and no separate backend process to manage.

**Important distinction**: Node.js, Rust, and Visual Studio Build Tools
are only needed by whoever *builds* the installer (see `BUILD.md`). The
people who just *use* CS Tracker afterward need none of that - they only
ever download and double-click the resulting `.exe`/installer.

## Key features

- FACEIT rank/ELO, lifetime stats, per-map breakdown, recent match
  results (W/L), commendations.
- Public Steam profile + VAC/game ban safety indicator.
- Leetify ratings and CS2 Premier "CS Rating" - both shown as N/A with an
  explanatory tooltip until an official, ToS-compliant public API exists
  for them (see the backend README for details) - manual scraping is
  explicitly and permanently excluded.
- Manually entered roster (up to 10 players) **or** automatic live roster
  detection through CS2's official Game State Integration (GSI) - no
  memory reading, no screen-scraping.
- Saved players with notes, search, and sorting, persisted locally in
  SQLite.
- Customizable overlay background (solid color / gradient / Matrix rain /
  animated Galaxy (Milky Way) / animated Cyberpunk neon skyline /
  animated Team Spirit mono-tactical radar / a custom image you upload
  yourself), compact "pill" view, click-through toggle, and window
  position/size memory.
- **First-launch Onboarding Wizard** - on first start, a guided setup
  flow requires both a FACEIT and a Steam Web API key (with a live
  "Save & Test" against the backend) before the rest of the Control
  Panel becomes reachable, plus an optional GSI config download step -
  no more discovering the Setup Wizard tab on your own after the fact.
- Official-style FACEIT level badge icons (levels 1-10 + unranked) shown
  next to rank/ELO everywhere a player appears (tracker rows, saved player
  cards) - matched to the official FACEIT Elo brackets (Level 1: 100-500
  up to Level 10: 2001+).
- The Control Panel is a full-size, resizable, maximizable window with a
  responsive 2-column layout on wide screens - not a small fixed utility
  panel.
- **System tray icon** - CS Tracker stays visible in your system tray
  while running. Left-click it (or use "Show Control Panel" in its
  right-click menu) to bring the Control Panel back after closing it.
  Closing the Control Panel window **minimizes it to the tray by
  default** (the backend and any live GSI connection keep running) -
  toggle "Fully quit when I close this window" in the Overview tab (or
  use the tray's/Control Panel's "Quit CS Tracker Completely" action) if
  you'd rather closing the window fully exit the app every time.
- Setup Wizard for API keys - no `.env` editing or terminal required.
- **FACEIT Mode** - an optional toggle that disables the separate overlay
  window entirely (enforced natively in Rust, not just in JS) and shows
  the tracker inline in the Control Panel instead, as a precaution
  against anti-cheat systems flagging always-on-top overlay windows. See
  "Anti-cheat considerations" below.
- **Real hotkey-capture UI** - click a hotkey button in the Control
  Panel's Overview tab and press the key combination you want; it's
  registered as a global shortcut instantly (Rust side, dynamic
  re-registration) - no more editing `main.rs` and rebuilding.
- **My Match History** - a K/D trend sparkline + recent match list for
  your OWN matches, recorded automatically whenever GSI detects a match
  finishing (never other players' data).
- **FACEIT Match History** - GSI-FREE list of any FACEIT nickname's
  recent matches (Player Summary tab); clicking a match opens a separate
  popup window with the full breakdown - both team rosters, K/D/A,
  ADR/HS%, MVP, and a team-comparison bar. ADR is shown only when FACEIT
  actually provides it for that match; KAST and per-match ELO change are
  never fabricated - FACEIT's public API doesn't expose either.
- **"Team Strength" estimate** - a rough, transparent heuristic (average
  ELO/K-D/win rate, clamped 5-95%) showing each team's estimated win
  chance, always paired with a "not a guarantee" disclaimer. Can be
  toggled off in the Appearance tab.
- Configurable stat columns, a Team A vs Team B comparison bar, and a
  tabbed Control Panel (Overview / Appearance / Setup & GSI / Saved
  Players) - see the Appearance tab for display customization.
- **Discord Alerts** - optional webhook notifications (you create the
  webhook yourself in your own Discord server) for events: a
  VAC/game-banned player detected in your roster, one of your own
  matches finishing, or a **tracked player** finishing a match (see
  "Player Tracking" below). Filterable by match type (Any /
  Premier-Competitive / FACEIT / Casual-Other) - see the Setup & GSI
  tab's "Discord Alerts" section. FACEIT detection is a best-effort
  heuristic based on this app's own FACEIT Mode toggle, since CS2's GSI
  has no official signal for "this is a FACEIT match".
- **Player Tracking** - track any FACEIT player by nickname (not
  necessarily someone you're playing with) and get a Discord alert with
  their personal K/D/stats whenever their next match finishes - see the
  Setup & GSI tab's "Player Tracking" section. FACEIT-only: Valve doesn't
  publish a public match-history API for arbitrary CS2 Premier/Casual
  players, so this only works for FACEIT nicknames (polled periodically
  via FACEIT's official history + match-stats endpoints).
- **One-at-a-time roster queue** - type a single Steam ID/FACEIT nickname
  and click "Add" (or press Enter) to queue it as a removable chip,
  repeat for up to 10 players, then "Look Up" resolves the whole queue -
  no more needing to type/paste all names comma-separated in one line.
- **Loading indicators** - a spinner while a roster lookup is in
  progress, and a brief startup loading screen on both the Control Panel
  and overlay windows.
- **Auto-update** - an Overview tab "Software Update" section checks a
  signed GitHub Releases feed (silently on startup, or on demand), and
  can download/install/relaunch with one click - disabled until you
  complete the one-time signing-key setup, see `BUILD.md` "Auto-update
  setup".
- **Bejelentkezés FACEIT-tel / Steammel** (Account tab) - link your own
  FACEIT (OAuth2 + PKCE) and/or Steam (OpenID 2.0 "Sign in through
  Steam") account once, from a button next to your avatar in the
  Control Panel's header. Once linked, the app auto-recognizes you
  everywhere (Player Summary auto-loads your own profile on startup) -
  no more typing your own nickname every time. Login always opens in
  your system's default browser, never inside the app's own window (the
  standard, secure pattern for OAuth in desktop apps). Tokens are
  encrypted at rest (AES-256-GCM) and "Unlink" fully deletes them from
  the local database, not just the UI. See `BUILD.md` "FACEIT OAuth
  setup" for the one-time app registration this needs.
- **My Leetify Stats** (Account tab) - once your Steam account is
  linked, your overall Leetify rating dimensions (Aim/Positioning/
  Utility/Clutching/Opening/CT/T Rating), aggregated accuracy/reaction-
  time/preaim, and recent matches load automatically, via Leetify's
  official Public API (leetify.com/app/developer) - not scraping. Every
  metric is shown exactly as Leetify's API returns it (never rescaled/
  renamed), there is intentionally NO per-weapon (e.g. AK-47/AWP spray)
  breakdown since the official API doesn't expose one, and the required
  "Data Provided by Leetify" attribution is shown wherever this data
  appears.
- **Live roster auto-load** - once a live CS2 match is detected via GSI,
  the Overview tab's tracker now loads the full roster completely
  automatically (silently retrying every few seconds until CS2 sends the
  complete roster data) - no more needing to click "Load Live Roster"
  yourself; a "Reload Roster" button remains for a manual refresh (e.g.
  right after a late player joins).

## Compliance

This project intentionally excludes:
- CS2 memory reading / offset-based data extraction.
- DLL injection or hooking into the game's renderer.
- Automatic lobby/scoreboard screen scraping (OCR).
- Any form of anti-cheat (VAC) circumvention.
- Collecting/storing players' private data without consent.

See the backend and frontend READMEs for detailed compliance notes,
especially around Game State Integration (GSI) data restrictions.

## Anti-cheat considerations (read before ranked FACEIT play)

CS Tracker's overlay does not inject into CS2, does not read its memory,
and does not hook its rendering pipeline - it is a separate, native OS
window that happens to be transparent and always-on-top. Architecturally
this is fundamentally different from a memory-reading cheat.

However, we cannot guarantee that FACEIT AC (or any other anti-cheat)
will never flag or restrict the presence of *any* always-on-top overlay
window, since that general window technique is also used by some
ESP/wallhack cheats, and anti-cheat heuristics are not public. As a
precaution:

- Use **FACEIT Mode** (Control Panel toggle) to disable the overlay
  window entirely and use the inline Control Panel tracker instead while
  playing ranked FACEIT matches.
- Review FACEIT's current official rules on third-party
  software/overlays before using this tool in ranked play.
- When in doubt, close the Control Panel and any tracker window
  entirely before joining a FACEIT match, and only reopen it between
  matches.
