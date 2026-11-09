# Local foundation milestone — 2026-11-04

Local only. No commit, push, tag, GitHub workflow or release requested or executed for this milestone.

## Implemented

- Map Pool: removes the duplicate Rating control (previously K/D under another name) and synthetic level-average comparison. Table values are explicitly K/D. Zero win rate renders a zero-width bar; unavailable data is not drawn as zero performance. Source/sample limitations are explained.
- ELO History: preserves the existing SQLite table and observations. Shows current ELO, distance to the next level, observed net change, timestamp range and a time-scaled history chart, including at level 10. No predicted match count, extrapolation or confidence claim. Legacy API estimate fields return null for older callers.
- Backend lifecycle: app-owned sidecar shutdown waits for its termination event, bounded to five seconds. Update installation fails visibly if shutdown is not confirmed. Normal application exit also invokes cleanup.
- NSIS install/uninstall hooks: stop only the named CSTracker executables whose full path matches the selected installation directory; wait for their exit before continuing. Other installation folders and ordinary Node processes are untouched.
- Build hygiene: no longer reads backend `.env` and embeds FACEIT OAuth credentials into the desktop binary. Optional OAuth settings are runtime-only. Steam-to-FACEIT identity lookup is unchanged.

## Verification

- Frontend: 29 tests passed initially; two additional focused regression tests passed (map missing-data rendering and refused update after failed backend stop). Total 31 covered tests.
- Backend: 74 tests passed, including existing-row preservation, missing observations, unchanged ELO, level 10, irregular observation dates, small map samples and missing statistics.
- Rust release compilation and NSIS packaging succeeded.
- Real isolated Windows process test: installer helper stopped a dummy backend executable in the target directory while preserving an identically named dummy in a different directory. Test-owned processes were cleaned up.
- No personal database migration or deletion. SQLite schema unchanged.

## Local build

`cs2-overlay-frontend/src-tauri/target/release/bundle/nsis/CS Tracker_0.4.8-local.1_x64-setup.exe`

Built with the rebuilt local backend and these frontend flags:

```
npx tauri build --bundles nsis --config src-tauri/tauri.local-app.conf.json --config ../.release-tools/local-audit-config.json
```

The ignored local configuration sets version `0.4.8-local.1` and disables generating signed updater artifacts. The published version configuration remains 0.4.7. This installer was built but not automatically installed over the user's app.

## Remaining verification / next work

- User visual review and an actual installed-app upgrade/restart trial remain. No claim of complete end-to-end installer verification.
- Forced process termination / crashes can still leave a backend behind until the installer cleanup runs; an OS-owned child-process lifetime mechanism is a separate follow-up.
- Shared Player HQ / Player Summary components and caches, manual-mode dead-code cleanup, identity badges keyed by immutable IDs, and unified styling remain the next audit milestones.
- A future public release must use the existing signing workflow and new release notes; this local installer must not be uploaded as a signed update.
