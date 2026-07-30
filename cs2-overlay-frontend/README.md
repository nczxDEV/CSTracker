# CS Tracker Desktop Client

A Tauri-based desktop client for CS Tracker: a transparent, always-on-top
stats overlay for CS2, plus a Control Panel (launcher) for configuration,
saved players, and the Setup Wizard.

## Why Tauri (not Electron)?

Tauri was chosen over Electron for this project because:
- **Smaller resource footprint** - Tauri uses the OS's native WebView
  instead of bundling a full Chromium instance, so RAM/CPU usage and
  bundle size are dramatically smaller - important for an overlay meant
  to run alongside a demanding game like CS2.
- **More native always-on-top/transparent window handling** - fewer
  workarounds needed for click-through, transparency, and window layering
  compared to Electron.
- **Smaller final bundle size** - a Tauri `.exe`/installer is typically a
  fraction of the size of the equivalent Electron package.

## Windows

The app opens two windows on launch:
- **`launcher`** ("Control Panel" / main app) - a normal, decorated
  window. Toggle the overlay, customize its background, configure API
  keys (Setup Wizard), download the GSI config file, and manage saved
  players here.
- **`overlay`** ("Stats Overlay") - a borderless, transparent,
  always-on-top window that renders the actual player stats over CS2.

## Hotkeys

| Hotkey | Action |
|---|---|
| `Alt+Shift+S` | Show/hide the overlay window |
| `Alt+Shift+X` | Toggle click-through mode on the overlay (lets mouse clicks pass through to CS2 underneath) |

Both are configurable from the Control Panel's **Overview** tab: click a
hotkey button, then press the combination you want (at least one
modifier - Ctrl/Alt/Shift - plus a key). This calls the `set_overlay_hotkey`
/ `set_click_through_hotkey` Tauri commands (see `src-tauri/src/main.rs`),
which unregister the old global shortcut and register the new one
immediately - no rebuild needed. The chosen combination is persisted
(`settings-store.js`) and re-applied automatically on the next launch.

## FACEIT Mode (anti-cheat safety)

Some anti-cheat systems (notably FACEIT AC) scan for always-on-top,
transparent overlay windows, since that technique is also used by some
ESP/wallhack cheats - even though CS Tracker's overlay only ever renders
public API data and never reads game memory. As a precaution, the
Control Panel has a **"FACEIT Mode"** toggle: when enabled, the separate
overlay window is **never shown** (not via its button, not via the
`Alt+Shift+S` hotkey), and the exact same tracker UI is instead rendered
**inline inside the Control Panel window**.

This is enforced in two layers:
1. The JS/UI layer disables the overlay button and hides the inline
   Tracker section's counterpart.
2. **The native Rust layer** (`src-tauri/src/main.rs`) independently
   tracks the setting and refuses to show the overlay window from the
   global hotkey handler - this is the authoritative guarantee, not just
   a UI nicety, so even a stray hotkey press cannot show the overlay
   while FACEIT Mode is on.

This does **not** guarantee FACEIT AC (or any anti-cheat) will never flag
CS Tracker - it simply removes the specific "transparent always-on-top
overlay window" technique from the equation when you choose to enable
it, for extra caution during ranked play. See the root README's
compliance section for the full discussion.

## One-click startup (backend sidecar)

In a release build, the bundled backend binary starts automatically as a
background process when you launch CS Tracker - there is no separate
"start the backend" step for end users. See
`../cs2-overlay-backend/README.md` ("Sidecar packaging") for how this
binary is produced, and the **Building a distributable `.exe`** section
below for the full release workflow.

In development (`npm run tauri dev`), the sidecar is **not** started -
run the backend yourself with `npm run start:dev` in
`cs2-overlay-backend/` so you get hot-reload.

## System tray & closing behavior

CS Tracker shows an icon in the system tray while running (see
`src-tauri/src/main.rs` - `TrayIconBuilder`). By default, closing the
Control Panel window's "X" button **minimizes it to the tray** instead of
exiting the app - the backend sidecar (and any live GSI connection) keeps
running in the background, and left-clicking the tray icon (or its
"Show Control Panel" menu item) brings the window back.

If you'd rather closing the window always fully exit the app (terminate
the sidecar, close everything), toggle **"Fully quit when I close this
window"** in the Control Panel's Overview tab
(`QuitOnCloseState` in `main.rs`, persisted via `settings-store.js`
`quitOnClose`). The tray menu's and Control Panel's **"Quit CS Tracker
Completely"** action always fully exits regardless of that toggle.

## Branding / icons

The app icon and in-app logo (`src/assets/logo.png`,
`src/assets/logo-mark.png`, `src-tauri/icons/*`) were generated from the
provided C-Track logo artwork, with the white background removed via
alpha matting (not a naive color-key cutout, to avoid a white halo around
the curved logo edges) and re-exported as multi-resolution PNG/ICO files.

## Development

```bash
npm install
npm run tauri dev
```

Requires the Tauri prerequisites for your OS (Rust toolchain, WebView2 on
Windows, etc.) - see https://v2.tauri.app/start/prerequisites/. On
Windows, this includes the **Visual Studio C++ Build Tools** (provides
`link.exe`) - if the build fails with `error: linker 'link.exe' not
found`, see the "Windows: linker not found" section in `../BUILD.md`.

## Building a distributable `.exe`

Producing an actual Windows `.exe`/installer requires a Windows machine
(or a properly configured cross-compilation toolchain) with Rust and the
Tauri CLI installed - it cannot be cross-compiled from an arbitrary Linux
sandbox without that toolchain. Steps:

1. **Build the backend sidecar** (from `cs2-overlay-backend/`):
   ```bash
   npm install
   npm run build:sidecar
   ```
   This produces a self-contained backend binary and copies it into
   `cs2-overlay-frontend/src-tauri/binaries/`.

2. **Build the Tauri app** (from `cs2-overlay-frontend/`):
   ```bash
   npm install
   npm run tauri build
   ```
   This produces, depending on your platform:
   - Windows: an `.exe` (NSIS or MSI installer) under
     `src-tauri/target/release/bundle/`.
   - macOS: a `.app`/`.dmg`.
   - Linux: a `.deb`/`.AppImage`.

3. The generated installer/executable is fully self-contained - the user
   downloads and runs **one file**, and both the Control Panel and the
   backend start automatically.

See `BUILD.md` in the repository root for a condensed, copy-pasteable
version of these steps.

## Auto-update

`tauri-plugin-updater` + `tauri-plugin-process` are fully wired in - a
"Software Update" section in the Control Panel's Overview tab shows the
current version, checks a GitHub Releases feed on startup (silently -
only surfaces something if an update is actually found or the user
clicks "Check for Updates" themselves), and lets the user
download/install/relaunch with one click. `.github/workflows/release.yml`
builds, signs, and publishes a draft GitHub Release (with the `latest.json`
manifest the updater reads) whenever a `vX.Y.Z` tag is pushed.

This is still **disabled by default** (`tauri.conf.json` →
`plugins.updater.active: false`) until you complete a one-time setup -
generate your own signing key pair, put the public key + your own
GitHub repo's release feed URL into `tauri.conf.json`, and store the
private key + password as GitHub Actions secrets. See
[`../BUILD.md`](../BUILD.md) "Auto-update setup" for the full
step-by-step walkthrough. Do not flip `active` to `true` before
completing that setup, or a malicious party could serve fake updates.

## Window state persistence

`tauri-plugin-window-state` is enabled, so the launcher and overlay
windows remember their position/size across restarts.

## Compliance

The overlay ONLY renders public data received from the backend REST API
in HTML/CSS/JS inside a native, transparent, always-on-top window. There
is no process injection, memory reading, or any interference with the
CS2 process. See `src-tauri/src/main.rs` and
`../cs2-overlay-backend/README.md` for the full compliance notes,
including the GSI (Game State Integration) data restrictions.
