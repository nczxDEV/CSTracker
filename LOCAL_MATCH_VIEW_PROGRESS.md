# Local HQ / match-view milestone — 2026-11-04

No GitHub changes or publication. Local build: **0.4.8-local.2**.

## Delivered

- Player Summary styling preserved. Player HQ now uses its dark gradients, gold/blue profile treatment, coloured metric tiles and compact match cards.
- HQ is the signed-in player's progress/journal/demo workspace; Player Summary remains the public player lookup. Filtered map trends and lifetime map statistics retain their distinct sample definitions.
- Removed the duplicate inline HQ match-detail renderer. Both entry points open `match-summary.html`, with one shared renderer and a bounded 20-match offline cache. Existing HQ cached details are readable without destructive migration.
- Match presentation: large rating MVP card, four leader cards, team scoreboards, official bundled FACEIT level icons beside players, readable separate statistics columns, horizontal overflow on narrower windows.
- Summary, Advanced, Utility, First kill, Trades, 1vX and Multikills tabs. Provider-supplied values only; absent values are shown as unavailable. No fabricated side splits or highlights.
- MVP follows the highest supplied FACEIT Rating, including ties. Partial rating coverage is marked “Rating leader”; missing ratings cannot silently fall back to K/D, kills or round MVP counts.
- Existing user-confirmed demo associations can open from the match window.

## Rating investigation / limitation

- HLTV states that Rating 2.0's exact formula is not public: https://www.hltv.org/news/20695/introducing-rating-20
- CSStats describes its tracked matches as Valve Competitive/Premier matchmaking. No documented public API mapping a FACEIT match ID to a CSStats/HLTV rating was found: https://csstats.gg/
- FACEIT Rating is a different metric: https://support.faceit.com/hc/en-us/articles/26530513602716-FACEIT-Rating-FAQ
- A real recent match for the requested FACEIT account was checked against both the official match-stats and recent-player-stats endpoints. Neither returned a rating field. Match stats did supply ADR, damage, utility damage/counts, flashed enemies, entry values, 1v1/1v2 wins and multi-kills.
- Therefore **no guaranteed rating retrieval is claimed**. The adapter consumes supplied FACEIT Rating fields; otherwise the MVP area explicitly reports the missing rating. No estimated HLTV rating was added, following the user's choice.

## Validation

- Backend: 76 passing tests.
- Frontend: existing suite plus highest-rating/tie/source, missing rating, HTML escaping, HQ common-window navigation and offline legacy-cache coverage.
- JS syntax checks and local Rust/NSIS build.
- Visual browser inspection was attempted but blocked because the browser tool disallows local-file URLs; no workaround attempted. Native installed-app visual acceptance remains for the user.
- Local installer is built, not automatically installed and not uploaded. Development fixtures and API responses remain ignored in `.release-tools`.

## Existing limitations retained

The FACEIT adapter currently reads the first stats map for multi-map series. It does not synthesize whole-series ratings. Missing KAST, trade metrics, spotted accuracy, rating, ELO snapshots or highlights cannot be recovered from unrelated player lifetime statistics.
# Linked-demo rating fallback

## Demo-free MVP (2026-11-06)
- Added product-defined CSTracker Rating / 100 from kills/round (40 points), ADR (35), assists/round (15), and survival proxy 1 − deaths/round (10). Caps and normalizers are disclosed in the match UI. This is not HLTV/FACEIT rating or a calibrated skill estimate.
- Source priority: official ratings; otherwise full-roster linked-demo Estimated 2.0; otherwise one consistent CSTracker scoring method across both teams. No mixing of rating scales. Missing required inputs remain unavailable and partial coverage is labelled rating leader.
- Player HQ source converted to UTF-8; repaired malformed date separators and missing-rating dashes. Encoding regression coverage added.
- Frontend regression run: 46/47 initially passed; corrected the new test's hand-calculated rounding expectation (84.985... rounds to 84.99), then all seven affected rating/encoding/cache tests passed.

The shared FACEIT match window can now read detailed statistics from its explicitly linked local demo without replacing the viewer's active replay. FACEIT roster Steam IDs are preserved as strings, and player association requires an exact unique Steam ID plus matching map. Nicknames are never used to merge players.

When no official ratings are supplied, the window displays Estimated 2.0 · unofficial from demo statistics. Official and estimated ratings are never ranked together. Missing KAST, absent IDs, duplicate identities and old caches do not fabricate values. The empty state explains linking/re-importing requirements. Table metrics remain FACEIT-sourced; the separate rating provenance is stated in the UI.

Validation: 44 frontend tests and 16 match-data backend tests pass; an additional UTF-8 label regression check passes. Backend and desktop build completed after the running app closed. Match-window separators and ellipses are now correctly UTF-8 encoded. Native visual verification remains pending.

