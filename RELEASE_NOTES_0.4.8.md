# CS Tracker 0.4.8

Changes since public release 0.4.7.

## Deathmatch Finder
- New dedicated finder window with WarmupServer, CYBERSHOKE and PRACC deathmatch servers, live population, map/region search, favorites, free-slot and latency preferences.
- Quick join checks candidate latency and current reported capacity before sending a Steam connection request. Reserved slots may still affect entry.
- Glass-inspired styling follows the main application's Appearance settings, including HUD/Glass, opacity, custom images and animated backgrounds.
- Server-type filters for Guns / All weapons, Multi-CFG, Pistol, Headshot, AWP and Aim.
- Automatic ping checks prioritize visible servers and continuously work through the filtered list. Results update individually; queued, checking and no-response states are distinct. No manual ping button. Hidden windows pause background checks.
- CYBERSHOKE player session statistics and supplied FACEIT icons/averages. PRACC public player names are displayed where supplied; its current public response provides no Steam IDs or FACEIT levels. Missing data is explicitly unavailable.

## Demo Studio
- Larger map, sticky playback controls, five-second seeking and a collapsible Events / Economy / AI Coach inspector.
- Consistent seeking across timeline, event feed and linked review moments. Background windows pause playback; stale round-loading requests cannot overwrite newer selections.
- Map/round/team-score header and timestamped kill, utility and bomb timeline lanes, including stable event tooltips.
- A–B playback loops and local timestamp bookmarks with editable notes.
- Full-demo stat board with kills/deaths/assists, ADR, KAST, headshots, openings, traded deaths, utility damage and enemy flash duration where available.
- Clearly labeled Estimated 2.0 (unofficial) and local MVP selection from complete demo statistics. This is an approximation, not an official HLTV or FACEIT rating.
- Existing player equipment silhouettes, cash styling, killfeed and hover callouts retained. Older demos remain readable; detailed statistics may require re-importing the original recording.

## Player HQ and match details
- HQ follows Player Summary's dark visual style; both open one shared match-details view with bounded offline caching.
- Larger rating MVP card, leader cards, team rosters, FACEIT level icons and detailed statistic tabs.
- Official FACEIT ratings appear only if supplied. A fully matched linked demo can provide Estimated 2.0; otherwise sufficient online match statistics can provide the separately labeled CSTracker Rating / 100. No demo is required for the local score. Missing required inputs remain unavailable.
- Exact Steam IDs and matching map are required for demo player association; names alone never merge identities. Different rating sources are not ranked together.
- Map performance accurately labels K/D rather than presenting it as an official rating. Missing values and small samples are distinguished.
- ELO History shows recorded observations and their dates instead of speculative projections. Existing saved observations are preserved.
- Fixed malformed text separators and improved missing-data presentation.

## Updates and installation
- A main-window **Update available** banner appears after the startup check only when a newer version exists. View update opens the download/install controls; Later dismisses the banner for this session.
- No startup notification when already current or offline. Manual update checks still report their result.
- Signed Windows installer and latest.json retain the 0.4.7 update feed and public signing key.
- Installer/uninstaller cleanup targets only CS Tracker executables in the installation directory, reducing locked-file failures. Backend shutdown is confirmed before an in-app installation proceeds.
- Optional FACEIT OAuth credentials are runtime configuration and are no longer embedded by the build script.

## Compatibility and limitations
- Public 0.4.7 supports this signed in-app upgrade through Overview → Check for Updates. Older builds with updating disabled need a manual installer once. The new global startup banner is included in 0.4.8 and will announce subsequent releases.
- Server integrations use public website endpoints that providers may change. UDP query failures are reported honestly; displayed slots do not reserve a place or guarantee game entry.
- No personal API keys, recordings or databases are included in this release. Saved data formats remain backward-readable.
- Frontend, backend, native parser and live-provider tests were run during release preparation. An actual update/install/restart on every supported Windows environment is not guaranteed by those checks.
