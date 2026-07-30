use std::fs;
use std::path::Path;

/// Reads the sibling `cs2-overlay-backend/.env` file (simple `KEY=VALUE`
/// lines, `#`-comments and blank lines skipped - no quoting/escaping
/// support needed for the handful of values we read here) and re-exposes
/// a short allow-list of keys as CARGO BUILD-TIME environment variables
/// (`cargo:rustc-env=...`), so `main.rs` can bake them into the compiled
/// binary via the `env!()`/`option_env!()` macros.
///
/// WHY THIS EXISTS: the backend sidecar binary (see
/// `cs2-overlay-backend/scripts/build-sidecar.js`) is a single packaged
/// executable with NO accompanying `.env` file shipped alongside it -
/// only `binaries/cs2-overlay-backend[.exe]` itself is bundled (see
/// `tauri.conf.json` -> `bundle.externalBin`). Most settings (FACEIT/
/// Steam/Leetify API keys) are fine with this because they're entered by
/// the END USER through the Setup Wizard and stored in SQLite at
/// runtime - but "Bejelentkezés FACEIT-tel"'s OAuth2 CLIENT credentials
/// (`FACEIT_OAUTH_CLIENT_ID`/`_CLIENT_SECRET`/`_REDIRECT_URI`) belong to
/// the APP ITSELF (created once in the FACEIT Developer Portal by
/// whoever builds this app - see BUILD.md "FACEIT OAuth setup"), not to
/// each end user, so there's no Setup Wizard field for them. Without
/// this build-time step, a packaged/release build would ALWAYS show
/// "FACEIT login is not configured on this build" - even if the
/// `.env` file used during `npm run build:sidecar` had real values in
/// it - because that `.env` file itself never travels with the compiled
/// sidecar binary, only whatever main.rs explicitly passes as
/// environment variables when it spawns that binary (see
/// `spawn_backend_sidecar()`).
///
/// This only ever reads three specific OAuth CLIENT keys (never the
/// user's own FACEIT/Steam/Leetify API keys, which stay purely a
/// runtime/SQLite concern) - see the matching `option_env!()` reads in
/// `main.rs`.
fn bake_faceit_oauth_env_from_backend_dotenv() {
    let dotenv_path = Path::new("../../cs2-overlay-backend/.env");
    // Re-run this build script if the .env file changes, so editing it
    // and rebuilding actually picks up new values (Cargo otherwise only
    // reruns build.rs when ITS OWN inputs change, which wouldn't include
    // an unrelated file outside the crate by default).
    println!("cargo:rerun-if-changed={}", dotenv_path.display());

    let Ok(contents) = fs::read_to_string(dotenv_path) else {
        // No .env file (e.g. a contributor building without ever setting
        // up FACEIT OAuth) - just skip silently, `main.rs`'s
        // `option_env!()` reads will resolve to `None`, and
        // `AuthController`/`FaceitOAuthService` already handle a missing
        // client ID/secret/redirect URI gracefully (a clear "not
        // configured" error instead of a crash).
        return;
    };

    let allowed_keys = [
        "FACEIT_OAUTH_CLIENT_ID",
        "FACEIT_OAUTH_CLIENT_SECRET",
        "FACEIT_OAUTH_REDIRECT_URI",
    ];

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if !allowed_keys.contains(&key) {
            continue;
        }
        // Strip a single layer of matching surrounding quotes, if present
        // (some .env conventions quote values - keeps this forgiving of
        // either style without needing a full .env parser dependency).
        let value = value.trim();
        let value = value
            .strip_prefix('"')
            .and_then(|v| v.strip_suffix('"'))
            .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
            .unwrap_or(value);
        println!("cargo:rustc-env={key}={value}");
    }
}

fn main() {
    bake_faceit_oauth_env_from_backend_dotenv();
    tauri_build::build()
}
