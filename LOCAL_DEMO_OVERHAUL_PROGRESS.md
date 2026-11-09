# Demo Studio overhaul — local milestone 1

Implemented in the desktop app sources, not a separate preview:
- Expanded map area with narrower team columns; compact layouts put the map above both teams.
- Sticky transport, explicit five-second seek buttons, existing keyboard controls retained.
- Closed-by-default analysis inspector with full-round event navigation, economy and existing AI Coach.
- Existing top-right recent-event feed, callouts, floor switch, equipment cards and utility overlays retained.
- Shared seek operation clears clip endpoints and resets the playback clock; frame lookup is pure and direction independent.
- Hidden windows pause playback instead of advancing through unseen action.
- Round-loading requests ignore stale failures and disable play/timeline until completion.

Validation: 36 frontend tests passed, including sparse frame samples, reverse seeks, death boundaries and angle wraparound. HTML nesting/unique IDs and JavaScript syntax checked. Native visual acceptance has not been performed; do not treat automated checks as proof of visual quality or full demo playback performance.

Next milestones: event markers and A–B loops, richer utility inspection, integrated round notes, bounded round prefetch, and measured performance on a full demo. No GitHub publication or installer packaging in this milestone.


## Match header and event timeline
- Top-left map name, current round and CT/T score. Score is reconstructed from recorded wins using stable player identity overlap across side switches; knife rounds excluded. Partial history or ambiguous identity shows unavailable. It updates at the recorded round-end tick and reverses when seeking back.
- Three timestamped event lanes: kills, utility, bomb. Hover/focus gives event time and label; activation seeks and pauses using the shared playback path.
- Existing cached replays derive the extra roster metadata in memory when opened. New serde fields are optional; no saved data format is destructively migrated.
- Player card equipment icons, cash typography and other existing HUD styles retained.
- Validation: 38 frontend tests passed, HTML structure checked and cargo check --tests passed. Native visual testing still pending.

## Local review tools and match stat board
- Added A–B repeat playback with overshoot handling. Ordinary seeks disable the loop; changing rounds resets its bounds.
- Added local timestamp bookmarks with editable notes and jump-to-moment actions. They persist per demo library entry, with a 500-moment limit. Existing round bookmarks are untouched.
- Added a modal full-recording stat board with kills, deaths, assists, ADR, KAST, headshots, openings, traded deaths, utility damage and enemy flash duration.
- Added user-approved **Estimated 2.0 · unofficial** using the documented 2021 regression and approximate Impact. It is not official HLTV or FACEIT data and is not calibrated to CS2. Highest displayed estimate selects the local MVP; ties remain ties.
- Detailed demo statistics are supplied by awpy 3.1.1, excluding knife rounds. Its roster/round-count assumptions are disclosed in the calculation details.
- Old saved demos still open. Explicitly re-importing their original recording creates a cache with detailed statistics; old entries and their notes remain intact.
- Validation: 41 frontend tests pass; Rust test compilation passes. Native visual acceptance remains pending. No installer or GitHub publication.
- Real-file integration passed against the user's test.dem: Ancient, 16 rounds, 10,200 sampled frames, detailed-stat ranges and string Steam IDs verified. Final local desktop build succeeded.
