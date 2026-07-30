// CS Tracker - Tauri main entry point.
//
// The app opens a SINGLE window on startup (see tauri.conf.json):
//   - "launcher": the normal, decorated Control Panel window - shows the
//     current/live match (via GSI) and a manual roster lookup mode
//     directly inline, plus the Setup Wizard (API keys, GSI config
//     download), Saved Players, and Player Summary.
//
// IMPORTANT (compliance): the client ONLY ever shows a normal, decorated
// application window that renders public data received from the backend
// REST API (see cs2-overlay-backend) in HTML/CSS/JS. There is no process
// injection, memory reading, always-on-top overlay, or interference with
// the CS2 process here.
//
// SIDECAR (release build): in a production build, the bundled backend
// binary ("cs2-overlay-backend-<target-triple>[.exe]", see
// `cs2-overlay-backend/scripts/build-sidecar.js`) starts automatically as
// a background process, so the end user only ever has to run a SINGLE
// .exe (no separate "npm run start:dev" step). In development mode
// (`tauri dev` / debug build) we do NOT start the sidecar - the developer
// runs the backend from source (`npm run start:dev`) to get hot-reload.
//
// The "windows_subsystem = windows" attribute ensures that in a release
// build NO console/terminal window appears - the end user simply
// double-clicks the compiled .exe to start it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Listener, Manager};
use tauri_plugin_dialog::DialogExt;

#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

/// Extremely simple, dependency-free file logger.
///
/// IMPORTANT: in a release build there is NO console window
/// (`windows_subsystem = "windows"`), so `println!`/`eprintln!` output is
/// completely invisible to the user - if something goes wrong during
/// startup (e.g. the sidecar binary fails to launch), the ONLY way to
/// find out why is a log file like this one. Writes to
/// `%TEMP%\cstracker-log.txt` on Windows (or the OS equivalent) so it's
/// always writable without extra permissions/capabilities.
fn log_to_file(message: &str) {
    let path = std::env::temp_dir().join("cstracker-log.txt");
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "[{}] {}", chrono_like_timestamp(), message);
    }
}

/// Minimal timestamp without pulling in a chrono dependency just for logging.
fn chrono_like_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("unix:{now}")
}

/// Shared, thread-safe flag mirroring the "Fully quit on close" setting
/// (see settings-store.js DEFAULT_SETTINGS.quitOnClose), kept in sync via
/// the `cs2-overlay-settings-updated` Tauri event (see `main()` below).
///
/// Controls what clicking the Control Panel window's OS close ("X")
/// button does:
///   - `false` (default) - MINIMIZE TO TRAY: the window is hidden, not
///     destroyed, and the backend sidecar keeps running in the
///     background. The app stays reachable via the system tray icon
///     (left-click, or the "Show Control Panel" tray menu item). This
///     matches common desktop app behavior (Discord, Steam, etc.) and
///     avoids accidentally killing GSI/live-match tracking just because
///     the Control Panel window itself was closed.
///   - `true` - FULLY QUIT: closing the window terminates the backend
///     sidecar process and exits the entire application, same as the
///     tray menu's "Quit CS Tracker Completely" item or the Control
///     Panel's own "Quit Completely" button.
struct QuitOnCloseState(AtomicBool);

/// Fully shuts down CS Tracker: kills the backend sidecar process (if
/// running - release builds only, see `SidecarHandle`) and exits the
/// whole application process. Shared by three trigger points: the
/// Control Panel window's close button (when "Fully quit on close" is
/// enabled), the tray icon's "Quit CS Tracker Completely" menu item, and
/// the Control Panel's own "Quit Completely" button
/// (`quit_completely` Tauri command).
fn quit_completely_impl(app: &AppHandle) {
    log_to_file("Quitting completely (all processes) - sidecar will be terminated.");
    #[cfg(not(debug_assertions))]
    {
        if let Some(state) = app.try_state::<SidecarHandle>() {
            if let Some(child) = state.0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    }
    app.exit(0);
}

/// Tauri command backing the Control Panel's "Quit Completely" button
/// (see launcher.js) - lets the user fully exit the app from the UI
/// itself, without needing to find the tray icon.
#[tauri::command]
fn quit_completely(app: AppHandle) {
    quit_completely_impl(&app);
}

/// Tauri command backing the Control Panel's "Download GSI Config File"
/// button (see launcher.js `saveGsiConfigFile`).
///
/// WHY THIS EXISTS: a plain `window.open(url)` / browser-style download
/// (relying on the backend's `Content-Disposition: attachment` header)
/// does NOT reliably trigger the OS's native "Save As" flow inside a
/// Tauri webview the way it would in a real browser tab - at best it may
/// silently do nothing, at worst it opens a blank webview window. The
/// correct, native fix is: the frontend fetches the config file's TEXT
/// content over HTTP (a normal, same-origin `fetch()` call, which DOES
/// work fine inside the webview), then hands that text to THIS command,
/// which shows a native "Save As" dialog (defaulting to the correct
/// filename) and writes the file with `std::fs::write` once the user
/// picks a location.
///
/// Returns `Ok(Some(path))` if the file was saved, `Ok(None)` if the user
/// cancelled the dialog, or `Err(String)` if writing the file failed.
///
/// Tauri runs non-async commands on their own worker thread (never the
/// main UI thread), and the dialog plugin's `blocking_*` variants are
/// specifically designed to be called from such a thread (internally
/// forwarding to the main thread on platforms that require it, e.g.
/// macOS) - so a plain blocking call here is the correct, simplest
/// approach; no manual channel/async bridging needed.
#[tauri::command]
fn save_gsi_config_file(app: AppHandle, contents: String) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Save GSI Config File")
        .set_file_name("gamestate_integration_cstracker.cfg")
        .add_filter("CS2 GSI Config", &["cfg"])
        .blocking_save_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path_buf = file_path.into_path().map_err(|e| e.to_string())?;

    std::fs::write(&path_buf, contents).map_err(|e| {
        format!(
            "Failed to write the config file to {}: {e}",
            path_buf.display()
        )
    })?;

    Ok(Some(path_buf.display().to_string()))
}

/// Percent-encodes a string for safe use as a single URL query
/// component (RFC 3986 "unreserved" characters pass through unescaped,
/// everything else becomes `%XX`) - a tiny, dependency-free helper so
/// `open_match_summary_window` below doesn't need to pull in a whole
/// `url`/`urlencoding` crate just to build one query string.
fn percent_encode_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char);
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

/// Tauri command backing the "FACEIT Match History" list's clickable
/// rows (see faceit-match-history.js `openMatchSummary()`) - opens (or,
/// if already open, simply re-focuses) a small popup window showing the
/// full match summary for a single FACEIT match ID, rendered by
/// match-summary.html/match-summary.js.
///
/// Deliberately implemented as a Rust command rather than the frontend
/// calling the JS `WebviewWindow` constructor directly - besides
/// avoiding the documented Windows deadlock risk of building windows
/// synchronously (this command is `async`, per Tauri's own recommended
/// pattern), it also means this feature needs ZERO extra capability
/// permissions: a plain custom `#[tauri::command]` is always invokable
/// (same as `quit_completely`/`save_gsi_config_file` above), whereas the
/// JS-side `new WebviewWindow(...)` API requires explicitly granting
/// `core:webview:allow-create-webview-window` in capabilities/*.json.
/// The opened window's own page (match-summary.html/.js) only ever uses
/// a plain `fetch()` to the local backend - no Tauri JS APIs at all - so
/// it needs no capability entries of its own either.
///
/// Uses a stable, sanitized window label derived from the match ID, so
/// clicking the SAME match twice re-focuses the existing window instead
/// of erroring on `WebviewWindowBuilder::build()`'s duplicate-label
/// check.
#[tauri::command]
async fn open_match_summary_window(app: AppHandle, match_id: String, identifier: String) -> Result<(), String> {
    let safe_id: String = match_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let label = format!("match-summary-{safe_id}");

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let url = format!(
        "match-summary.html?matchId={}&identifier={}",
        percent_encode_component(&match_id),
        percent_encode_component(&identifier),
    );

    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::App(url.into()))
        .title("Match Summary - CS Tracker")
        .inner_size(1080.0, 860.0)
        .min_inner_size(720.0, 600.0)
        .resizable(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Handle to the running backend sidecar process, so we can shut it down
/// cleanly when the app closes (and avoid leaving an orphaned background
/// process running).
#[cfg(not(debug_assertions))]
struct SidecarHandle(Mutex<Option<CommandChild>>);

/// Starts the bundled backend binary as a background process.
///
/// IMPORTANT: this function is deliberately NON-FATAL. If the sidecar
/// binary can't be found or fails to launch, we log the problem (to
/// `%TEMP%\cstracker-log.txt`, see `log_to_file`) and return, instead of
/// panicking/propagating an error - a panic here would silently kill the
/// ENTIRE application in a release build (no console = no visible error,
/// just the window flashing and vanishing). With this approach, the
/// Control Panel window stays open and usable even if the backend fails
/// to start, and the UI's own "backend unreachable" indicators (see
/// launcher.js `checkBackend`/`loadSettingsStatus`) surface the problem
/// to the user instead.
#[cfg(not(debug_assertions))]
fn spawn_backend_sidecar(app: &tauri::App) {
    // Resolve a fixed, absolute, always-writable directory for the
    // backend's SQLite database file up front (see the long comment on
    // the `DATABASE_PATH` env var below for why this matters) - falls
    // back to the OS temp dir in the extremely unlikely case the app-data
    // directory can't be resolved at all, so the backend still has
    // SOMEWHERE writable rather than crashing outright.
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|err| {
            log_to_file(&format!(
                "Could not resolve the app-data directory ({err}) - falling back to the OS temp \
                 directory for the backend's SQLite database. Saved settings/players may not \
                 persist as reliably in this fallback location."
            ));
            std::env::temp_dir().join("cstracker-fallback-data")
        });
    if let Err(err) = std::fs::create_dir_all(&app_data_dir) {
        log_to_file(&format!(
            "Failed to create the app-data directory at {}: {err}",
            app_data_dir.display()
        ));
    }
    let app_db_path = app_data_dir.join("app.db").to_string_lossy().to_string();
    log_to_file(&format!("Backend SQLite database path: {app_db_path}"));

    let mut sidecar_command = match app.shell().sidecar("cs2-overlay-backend") {
        Ok(cmd) => cmd,
        Err(err) => {
            log_to_file(&format!(
                "Failed to resolve the backend sidecar binary: {err}. \
                 Did you run 'npm run build:sidecar' in cs2-overlay-backend \
                 before building the frontend? See cs2-overlay-backend/README.md \
                 'Sidecar packaging' section. The app will continue running \
                 without a backend connection."
            ));
            return;
        }
    }
    // Explicitly marks the sidecar as a PRODUCTION run, regardless of
    // whatever the host OS's own environment variables happen to be -
    // this is what keeps the backend's development-only CORS relaxation
    // (see cs2-overlay-backend/src/main.ts - accepts any 127.0.0.1/
    // localhost origin, needed because `tauri dev` serves the frontend
    // from an unpredictable local port) from ever applying to a real,
    // packaged release build of this app.
    .env("NODE_ENV", "production")
    // IMPORTANT: on some Node 22.x releases (roughly 22.5 - 22.12, before
    // it was unflagged in later patches), the backend's built-in
    // `node:sqlite` module (see cs2-overlay-backend/src/database/database.service.ts)
    // throws unless the `--experimental-sqlite` CLI flag was passed to
    // `node` itself. The sidecar binary is a byte-for-byte copy of
    // whichever `node.exe` happened to be active on the machine that ran
    // `npm run build:sidecar` (see build-sidecar.js) - so whether this
    // flag is actually required depends on THAT machine's exact Node
    // patch version, not the end user's machine. Rather than depending on
    // every future build being done with a sufficiently new Node patch,
    // we force the flag on unconditionally via NODE_OPTIONS (which Node
    // reads before parsing its own argv, so this works identically
    // whether or not the flag is even still needed) - on Node versions
    // where `node:sqlite` no longer needs it, this is simply a harmless
    // no-op. Without this, an affected build's sidecar crashes instantly
    // on startup (a console window flashes open and closes) with no
    // visible error unless it's launched from an existing terminal.
    .env("NODE_OPTIONS", "--experimental-sqlite")
    // Pins the SQLite database (notes/saved-players/settings - including
    // the FACEIT/Steam/Leetify API keys saved through the Setup Wizard /
    // onboarding wizard) to a FIXED, absolute, per-user-writable location
    // (the OS's standard app-data directory, e.g.
    // `%LOCALAPPDATA%\com.cstracker.app\app.db` on Windows), instead of
    // letting the backend fall back to its default `./data/app.db`
    // RELATIVE path (see cs2-overlay-backend/src/config/configuration.ts
    // `database.path`). A relative path resolves against the sidecar
    // process's current working directory, which is NOT guaranteed to be
    // identical on every single launch (it depends on how Windows/the
    // shortcut/tray "start on login" entry happens to invoke the .exe) -
    // if it ever differs, the backend transparently creates a brand-new,
    // EMPTY database in that different location, which looks exactly
    // like "my saved API keys/players disappeared after restarting the
    // app" even though nothing was actually deleted. Resolving this once,
    // up front, via Tauri's own app-data-dir API guarantees the exact
    // same database file is reused on every launch, no matter how the
    // app was started.
    .env("DATABASE_PATH", app_db_path);

    // "Bejelentkezés FACEIT-tel" (AuthModule) - the OAuth2 CLIENT
    // credentials baked into THIS compiled binary at build time (see
    // build.rs `bake_faceit_oauth_env_from_backend_dotenv()`, which reads
    // them from `cs2-overlay-backend/.env` when `cargo build`/`tauri
    // build` runs) are explicitly forwarded here as real environment
    // variables for the sidecar CHILD PROCESS to read. This is
    // necessary because the packaged sidecar binary has no `.env` file
    // shipped alongside it (only the compiled executable itself is
    // bundled - see tauri.conf.json `bundle.externalBin`), so without
    // this step a packaged release build would always show "FACEIT
    // login is not configured on this build", even if the `.env` used
    // during the backend's own `npm run build:sidecar` step had real
    // values in it.
    if let Some(client_id) = option_env!("FACEIT_OAUTH_CLIENT_ID") {
        sidecar_command = sidecar_command.env("FACEIT_OAUTH_CLIENT_ID", client_id);
    }
    if let Some(client_secret) = option_env!("FACEIT_OAUTH_CLIENT_SECRET") {
        sidecar_command = sidecar_command.env("FACEIT_OAUTH_CLIENT_SECRET", client_secret);
    }
    if let Some(redirect_uri) = option_env!("FACEIT_OAUTH_REDIRECT_URI") {
        sidecar_command = sidecar_command.env("FACEIT_OAUTH_REDIRECT_URI", redirect_uri);
    }

    let (mut receiver, child) = match sidecar_command.spawn() {
        Ok(pair) => pair,
        Err(err) => {
            log_to_file(&format!(
                "Failed to start the backend sidecar process: {err}. \
                 The app will continue running without a backend connection."
            ));
            return;
        }
    };

    app.manage(SidecarHandle(Mutex::new(Some(child))));
    log_to_file("Backend sidecar process started successfully.");

    // Log the sidecar's stdout/stderr lines to the log file - helps with
    // debugging if the backend starts but then fails/exits (e.g. a
    // node:sqlite runtime error - see DatabaseService's error message).
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    log_to_file(&format!("[backend stdout] {}", String::from_utf8_lossy(&line)));
                }
                CommandEvent::Stderr(line) => {
                    log_to_file(&format!("[backend stderr] {}", String::from_utf8_lossy(&line)));
                }
                CommandEvent::Terminated(payload) => {
                    log_to_file(&format!("[backend] stopped, exit code: {:?}", payload.code));
                }
                _ => {}
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        // Remembers window position/size across launches.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Auto-updater - disabled by default (see tauri.conf.json
        // "plugins.updater.active": false) until you configure your own
        // GitHub Releases feed + signing key pair - see BUILD.md
        // "Auto-update setup" for the full one-time walkthrough.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Lets the frontend relaunch the app after installing an update
        // (see updater.js "Software Update" section - `relaunch()`) -
        // the updater plugin only downloads+installs the new version, it
        // does not restart the process itself.
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        // Native "Save As..." dialog - see `save_gsi_config_file` doc
        // comment for why this replaces the previous window.open()-based
        // download approach.
        .plugin(tauri_plugin_dialog::init())
        // Opens URLs in the system default browser (see account.js
        // "Login with FACEIT/Steam" buttons) - never inside this app's
        // own webview, for the OAuth/OpenID login flows.
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            log_to_file("Tauri setup() starting...");

            // "Fully quit on close" flag, defaults to OFF (i.e. closing
            // the Control Panel window minimizes to the system tray by
            // default) - see `QuitOnCloseState` doc comment.
            app.manage(QuitOnCloseState(AtomicBool::new(false)));

            // -----------------------------------------------------------
            // System tray icon - lets the user reach the Control Panel
            // (and fully quit the app) even after closing the window to
            // the tray (see the CloseRequested handler further down and
            // `QuitOnCloseState`). Non-fatal if it fails to build (e.g.
            // no default window icon resolved on some platforms/dev
            // setups) - logged and skipped, same "never abort setup()"
            // philosophy as elsewhere in this file.
            // -----------------------------------------------------------
            // Builds the tray menu (Show Control Panel / Quit Completely)
            // without `?` - wrapped in an immediately-invoked closure so
            // any failure stays fully CONTAINED to this `Result`, and can
            // never propagate out of (or early-return from) the outer
            // `setup()` closure, which would abort the entire app at
            // startup in a release build with no visible error.
            let tray_menu: Option<Menu<tauri::Wry>> = match (|| -> tauri::Result<Menu<tauri::Wry>> {
                let show_item =
                    MenuItem::with_id(app, "show", "Show Control Panel", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(
                    app,
                    "quit",
                    "Quit CS Tracker Completely",
                    true,
                    None::<&str>,
                )?;
                let separator = PredefinedMenuItem::separator(app)?;
                Menu::with_items(app, &[&show_item, &separator, &quit_item])
            })() {
                Ok(menu) => Some(menu),
                Err(err) => {
                    log_to_file(&format!("Failed to build the tray menu: {err} - skipping system tray icon."));
                    None
                }
            };

            if let (Some(icon), Some(tray_menu)) = (app.default_window_icon().cloned(), tray_menu) {
                let tray_build_result = TrayIconBuilder::new()
                    .icon(icon)
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .tooltip("CS Tracker")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(win) = app.get_webview_window("launcher") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "quit" => quit_completely_impl(app),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        // Left-click the tray icon itself (not the
                        // right-click context menu) restores the Control
                        // Panel window - the most common tray interaction
                        // pattern (Discord, Steam, etc.).
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(win) = app.get_webview_window("launcher") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    })
                    .build(app);

                match tray_build_result {
                    Ok(_) => log_to_file("System tray icon created successfully."),
                    Err(err) => log_to_file(&format!("Failed to build the system tray icon: {err}")),
                }
            } else {
                log_to_file(
                    "No default window icon resolved (or tray menu build failed) - skipping system tray icon.",
                );
            }

            // Listen for the same global settings-updated event the
            // launcher window uses (see settings-store.js saveSettings())
            // to stay in sync with the "Fully quit on close" toggle - the
            // launcher re-emits its loaded settings once on init
            // specifically so this listener learns the persisted value,
            // since Rust has no direct access to the webview's
            // localStorage.
            let settings_listener_handle = app.handle().clone();
            app.listen("cs2-overlay-settings-updated", move |event| {
                let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload())
                else {
                    return;
                };

                if let Some(enabled) = payload.get("quitOnClose").and_then(|v| v.as_bool()) {
                    if let Some(state) = settings_listener_handle.try_state::<QuitOnCloseState>() {
                        state.0.store(enabled, std::sync::atomic::Ordering::SeqCst);
                    }
                }
            });

            #[cfg(not(debug_assertions))]
            spawn_backend_sidecar(app);

            log_to_file("Tauri setup() completed successfully.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            quit_completely,
            save_gsi_config_file,
            open_match_summary_window
        ])
        .on_window_event(|window, event| {
            // See `QuitOnCloseState` doc comment for the full rationale
            // behind the "minimize to tray" vs "fully quit" distinction
            // implemented here.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "launcher" {
                    let quit_on_close = window
                        .app_handle()
                        .try_state::<QuitOnCloseState>()
                        .map(|s| s.0.load(std::sync::atomic::Ordering::SeqCst))
                        .unwrap_or(false);

                    if quit_on_close {
                        // Fully quit: terminate the sidecar and exit the
                        // whole app - explicit and deterministic, rather
                        // than relying on Tauri's default per-window
                        // close semantics.
                        let handle = window.app_handle().clone();
                        quit_completely_impl(&handle);
                    } else {
                        // Minimize to tray (default): keep the sidecar
                        // (and any live GSI connection) running in the
                        // background, just hide the window - the system
                        // tray icon (see setup()) lets the user bring it
                        // back, or fully quit from there instead.
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the Tauri application");
}
