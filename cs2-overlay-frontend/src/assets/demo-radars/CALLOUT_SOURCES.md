# Hover callouts

Official volumes in `*-places.json` were extracted on 2026-10-29 from the user's locally installed CS2 map VPKs. Valve owns the map data. Tool: [xobust/CS2CalloutExtractor](https://github.com/xobust/CS2CalloutExtractor), MIT. Extracted bounds are axis-aligned bounding boxes, not navigation meshes; overlapping boxes use the smallest matching area, respecting the selected radar floor. There are 13 extracted maps plus manually authored Office regions, with night radars sharing their base map's definitions.

The upstream extractor required a local compatibility repair: entity `origin` is now a ValveResourceFormat KVObject with keys 0, 1, 2. Read those three float values rather than casting the object to a string (which silently produces a zero origin). The CLI's English place-localization.csv supplies readable names. The temporary tool and source live in ignored src-tauri/target/callout-source; they are not shipped with the app.

Ancient's Elbow is a manually outlined community region on the bundled 1024px radar, based on [CSbePRO's Ancient guide](https://csbepro.com/counter-strike-2/ancient/) (CC BY 4.0) and [Betrefs' Ancient callouts](https://betrefs.gg/cs2-callouts/ancient). It overrides the broader Valve area only within its local polygon.

Office has no env_cs_place volumes in the installed VPK. Its approximate community polygons were authored against the bundled radar using [CS2Pulse's Office guide](https://cs2pulse.com/callouts/office/) and the map's visible rooms/spawns. These are broad learning aids, not official volume boundaries. Community terminology and room edges can vary by version/team.

Killfeed equipment SVGs and headshot.svg: [Juknum/counter-strike-icons](https://github.com/Juknum/counter-strike-icons), Valve game assets. Headshot path: cs2/panorama/images/hud/deathnotice/icon_headshot.svg.
