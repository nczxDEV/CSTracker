# CS Tracker 0.4.7

All changes since the previous public release, **0.3.0**. This release includes the locally developed 0.4.0–0.4.6 features and repairs in-app updating.

## Player HQ
- New personal dashboard with the Steam-linked FACEIT identity, avatar, FACEIT level badge and ELO.
- Recent match library with local snapshots, win rate, aggregate K/D, map strengths and supplied FACEIT ratings. Missing values remain unavailable.
- Date, map and teammate filters; recent 7/30/90-day performance compared with the previous equal period.
- Expandable sections that can remain open together, normal vertical scrolling and incremental match-list paging.
- Cached match details, explicit user-confirmed links to local demos, and direct replay/round opening.
- Local improvement journal and editable weekly practice objectives with completion status and example-round links.
- Demo-derived opening, trade, survival and utility-throw summaries, separate from official online statistics.

## Demo Studio
- Dedicated desktop replay window and import home with a searchable past-demo library.
- Local CS2 .dem parsing with background work, animated loading feedback and the CS Tracker logo.
- 2D radar playback, round selection, seeking, playback speed, zoom, pan, player focus and map layers.
- Player cards with names, health, equipped weapon/inventory silhouettes, armor, kits and cash.
- Grenade trajectories, schematic smoke/fire areas, bomb and kill events, and round/team economy.
- Compact CS-style event feed at the upper-right of the map with size controls, weapon icons and subdued utility events.
- Hover-only map callouts for bundled radar maps, including floor-aware regions where available.
- Fixed direction interpolation across the compass boundary, missing dead-player names and grenade actor attribution.

## AI Coach
- OpenAI and Google Gemini provider selection using the user's own API key.
- Provider model discovery/selection, coach configuration on the import home and a collapsible review panel.
- Compact searchable player selection for one to five players; duo coordination appears for exactly two selected players.
- Round reviews and selected-interval questions with timestamped links back to replay evidence.
- English interface prompts and improved provider/quota error messages.
- AI requests send selected summarized context to the chosen provider; full demo files and Steam IDs stay local. Provider usage limits and charges apply.

## Accounts and player lookup
- Steam sign-in resolves the associated public FACEIT profile through the FACEIT Data API, without requiring FACEIT OAuth registration or a hosted callback.
- Resolved identity is remembered locally, with bounded refreshes and cached presentation during API failures. Logout/account-switch handling prevents late results from restoring an old profile.
- Improved login cancellation, callback validation and connection diagnostics. Direct FACEIT OAuth remains optional and requires developer configuration.
- Fixed case-sensitive nickname searches and Player HQ history lookups that incorrectly treated FACEIT player IDs as nicknames.
- Saved API-key inputs remain visibly masked after Save and restart; saved-key masks are never submitted as real credentials.

## Design and navigation
- Centered Menu navigation, retaining the original logo and account access.
- Redesigned dark account identity and match-summary screens, refreshed map icons and missing-icon fallbacks.
- Full-width HQ profile header with level icon and ELO.
- Cosmetic Developer/Tester identity labels and selected-profile neon effects; McMacsu/Tester names use the CSS Sonar effect.
- Full-window Glacial first-launch setup with continuous logo motion, a prominent left-side Set up button and a small Skip setup action.
- Returning-player welcome with avatar, animated RGB halo and fade through black into the app. Welcome can be disabled in Appearance.
- Removed Manual Mode input controls. FACEIT matchroom/live roster results remain available.
- GSI-only statistics stay hidden until the corresponding Steam account has supplied a verified GSI packet. GSI setup controls remain available.

## Updating and installation
- Fixed the updater bridge for the application's plain-script Tauri frontend.
- Enabled signed updater artifacts and the GitHub latest.json feed. Future published releases built with the included workflow can be checked, downloaded and installed from the app.
- Downloads are signature-verified by Tauri. The backend is stopped before updater installation to release its executable lock.
- GitHub release builds use the configured signing secrets and matching application versions.
- **First install/upgrade to this release:** use **Quit CS Tracker Completely** before running the installer. Closing the window may only minimize to tray. Older local builds with updating disabled require this manual installation once.
- Future releases must retain the signing key, increase the version and publish their signed installer and latest.json assets. Uploading an arbitrary unsigned EXE alone does not enable an in-app update.

## Validation and limitations
- The previous audit passed 27 frontend and 71 backend checks; updater regression coverage is added in this release.
- Online history refresh fetches the current API page, retaining previously collected records; it is not a complete historical backfill.
- Demo utility areas/callouts and trade/survival metrics reflect available parser/map data and are not visibility simulation or official FACEIT statistics.
- Official ratings/highlights appear only where supported source data exists. Existing map-rating aliases and snapshot-based ELO forecasts remain audit follow-ups, not newly validated official metrics.
- No hosted FACEIT OAuth service is included. Steam linkage plus a configured FACEIT Data API key is the supported personal-profile route.
- Counter-Strike radar and equipment assets retain their upstream/Valve attribution in the bundled asset documentation.

**Next development:** installation lifecycle hardening, accurate metric labels, removal of legacy code, shared profile/match components and consistent design tokens, following the project audit.
