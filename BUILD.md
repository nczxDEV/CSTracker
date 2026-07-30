# Building CS Tracker into a single, installable/runnable executable

CS Tracker ships as **two parts** in this repository (`cs2-overlay-backend`
and `cs2-overlay-frontend`), but the **end result for users is a single
`.exe`** (or `.app`/`.AppImage` on other platforms) - the Tauri desktop
app embeds and auto-starts the backend as a background process ("sidecar"),
so nobody ever has to open a terminal or run two separate programs.

## Why this can't be done inside this sandbox

Producing a real Windows `.exe` requires the Rust toolchain, the Tauri
CLI, and (for a Windows build) either a Windows machine or a properly
configured `cargo-xwin`/`cross` cross-compilation setup with the Windows
MSVC target and linker - none of which are available in this sandboxed
environment (no `cargo`/`rustc`, no Windows SDK). This is why the
project is delivered as **source code you build once, locally or in
CI**, rather than a pre-compiled binary in the zip.

## Prerequisites (one-time setup)

1. **Node.js 22.5+** (required for the backend's `node:sqlite` module).
2. **Rust toolchain** - install via https://rustup.rs/.
3. **Tauri prerequisites for your OS** -
   https://v2.tauri.app/start/prerequisites/
   (on Windows: Microsoft C++ Build Tools + WebView2; on Linux: various
   `webkit2gtk`/`libsoup` packages; on macOS: Xcode Command Line Tools).

### Windows: "error: linker `link.exe` not found"

If `npm run tauri build` (or `tauri dev`) fails with
`error: linker 'link.exe' not found` / `note: the msvc targets depend on
the msvc linker`, it means step 3 above is missing - Rust on Windows
needs the **MSVC linker**, which comes from Visual Studio's C++ build
tools, NOT from Rust or Node.js. Fix:

1. Download **Visual Studio Build Tools** (the small, IDE-less installer):
   https://visualstudio.microsoft.com/visual-cpp-build-tools/
2. Run the installer and check the **"Desktop development with C++"**
   workload (this pulls in `link.exe`, the Windows SDK, and MSVC).
3. Finish the install, then **close and reopen your terminal**
   (PowerShell/cmd) so it picks up the new environment - this step is
   easy to miss and is the most common reason the error persists after
   installing.
4. Re-run `npm run tauri build` from `cs2-overlay-frontend/`.

This is a one-time system setup step, not something the project's source
code can work around - Rust always needs a linker to produce a native
Windows binary.

## Step-by-step build

```bash
# 1. Install and build the backend
cd cs2-overlay-backend
npm install
npm run build            # sanity-check: TypeScript compiles cleanly
npm test                 # sanity-check: unit tests pass
npm run build:sidecar    # produces a self-contained backend binary and
                          # copies it into ../cs2-overlay-frontend/src-tauri/binaries/

# 2. Install and build the desktop app
cd ../cs2-overlay-frontend
npm install
npm run tauri build
```

## Where to find the result

After `npm run tauri build` completes, look under:

```
cs2-overlay-frontend/src-tauri/target/release/bundle/
```

- **Windows**: `nsis/CS Tracker_<version>_x64-setup.exe` (installer) and/or
  `msi/CS Tracker_<version>_x64_en-US.msi`.
- **macOS**: `dmg/CS Tracker_<version>_x64.dmg` and `macos/CS Tracker.app`.
- **Linux**: `deb/cs-tracker_<version>_amd64.deb` and/or
  `appimage/cs-tracker_<version>_amd64.AppImage`.

Double-clicking the installer/executable installs (or directly runs) CS
Tracker as a single application - the backend starts automatically in the
background, and the Control Panel (launcher) window opens.

## What end users need to install (short answer: nothing)

Everything above (Node.js, Rust, Visual Studio Build Tools, `npm install`,
`cargo`, etc.) is a **one-time build-time requirement for whoever
produces the installer** (you, right now). It is NOT required by people
who just want to run CS Tracker.

Once you've built the installer/`.exe` and shared it, an end user simply
downloads it and double-clicks it. They do NOT need to install:
- Node.js or npm
- Rust or Cargo
- Visual Studio / C++ Build Tools
- Any terminal/command line usage at all

The only exception is the **WebView2 Runtime** on Windows (the rendering
engine CS Tracker's UI uses, made by Microsoft) - this is already
pre-installed on virtually all Windows 10/11 machines (it ships with
Microsoft Edge, which has been bundled with Windows since 2020). On the
rare machine that's missing it, the installer is configured
(`webviewInstallMode: downloadBootstrapper` in `tauri.conf.json`) to
automatically download and install it silently as part of setup - the
end user doesn't need to do anything manual for this either.

## First launch

1. Open the **Setup Wizard** section in the Control Panel and enter your
   FACEIT and Steam Web API keys (get a FACEIT key at
   developers.faceit.com, a Steam key at steamcommunity.com/dev/apikey).
   No `.env` file editing or terminal use is required.
2. (Optional) Download the GSI config file from the **Live Match Data**
   section and drop it into your CS2 `game/csgo/cfg/` folder, then
   restart CS2, to get automatic live-roster detection instead of typing
   in player names manually.
3. Press `Alt+Shift+S` in-game to show/hide the overlay.

## Troubleshooting: the app window opens then immediately closes

A release build has no console window (so error output is normally
invisible), but CS Tracker writes a small diagnostic log file to help
debug exactly this kind of issue. If the Control Panel window flashes
open and then vanishes, check:

```
%TEMP%\cstracker-log.txt
```

(Typically `C:\Users\<you>\AppData\Local\Temp\cstracker-log.txt` - you
can paste `%TEMP%` directly into Windows Explorer's address bar.) This
file records exactly what happened during startup - e.g. whether the
bundled backend failed to launch (often because `npm run build:sidecar`
wasn't run in `cs2-overlay-backend` before building the frontend, so the
`binaries/` folder was empty at bundle time), or whether a global hotkey
(`Alt+Shift+S` / `Alt+Shift+X`) is already in use by another application
on your system. Neither of those failures should crash the app anymore -
if the window still disappears after checking this file, share its
contents for further debugging.

## Troubleshooting: backend starts but the app still shows "backend unreachable" / crashes with `Cannot read properties of undefined`

If `cstracker-log.txt` shows `[backend] stopped, exit code: Some(1)` right
after a line like `Cannot read properties of undefined (reading 'get')`
inside a client/service constructor (e.g. `FaceitClient`, `SteamClient`),
this means `npm run build:sidecar` was run WITHOUT the `tsc` compile step
it depends on (see `scripts/build-sidecar.js` step 1/6) - esbuild's own
TypeScript support does not implement `emitDecoratorMetadata`, so
bundling directly from `.ts` source silently breaks NestJS's
constructor-based dependency injection (a provider ends up receiving
`undefined` instead of `ConfigService`/`SettingsService`/etc.), while
`npm run start:dev` (real `ts-node`) never hits this. This should no
longer happen with an up-to-date `build-sidecar.js` (it always runs `tsc`
first internally) - if you still see this, make sure you're running the
CURRENT `npm run build:sidecar` script (re-check `git diff`/re-download
if you copied an older version of this file), then rebuild both the
sidecar and the frontend from scratch.

## FACEIT OAuth setup (one-time, required for "Login with FACEIT")

"Bejelentkezés FACEIT-tel / Steammel" (Account tab) lets a user link
their own FACEIT and/or Steam account once, so the app auto-recognizes
them everywhere (Player Summary, My Match History) instead of manual
nickname entry. **Steam login needs zero setup** (Steam's OpenID 2.0
"Sign in through Steam" requires no app registration at all). **FACEIT
login requires a one-time OAuth2 app registration**, completed once by
whoever builds/maintains this app (not by each end user) - the
credentials then ship baked into the app's own `.env`.

### 1. Create a FACEIT OAuth2 App + Client

1. Go to the [FACEIT Developer Portal](https://developers.faceit.com/apps)
   and create (or open) an App.
2. Open the **OAuth2 Clients** tab -> **Edit consent screen** (the
   screen your users see when they click "Login with FACEIT"):
   - **Application name shown to users\*** - e.g. `CS Tracker`
   - **E-mail\*** - your own contact email
   - Homepage/Privacy/Terms URLs, logo - all optional, safe to leave
     blank
3. Still on the **OAuth2 Clients** tab, click **Create OAuth2 Client Id**:
   - **Redirect URI\*** - see step 2 below (FACEIT requires an
     `https://` redirect URI, even for local development - a plain
     `http://localhost:3000/...` is rejected with "Please specify a
     valid secure URI").
   - **Scopes\*** - check **Nickname (openid)** (mandatory) and
     **Personal Details (profile)** (adds the avatar shown in the
     Account tab). Leave Email/Membership/Chat.\* unchecked - CS Tracker
     doesn't use them, and requesting unnecessary scopes just makes the
     consent screen look more invasive than it needs to.
4. After saving, the client is listed with a **Grant type** of
   **"Authorization Code with PKCE"** - click the pencil/edit icon on
   that row to reveal the **Client ID** and **Client Secret** (the
   Secret is only shown in full here - copy both now).

### 2. The `https://` redirect URI problem (and how to solve it)

FACEIT (like several other OAuth providers - Slack, TikTok, Microsoft
OneDrive) requires an `https://` redirect URI unconditionally, with no
`http://localhost` exception for local development. Two options,
easiest first:

**A. Quick, zero-setup (fine for testing/personal use):**
```
FACEIT_OAUTH_REDIRECT_URI=https://redirectmeto.com/http://localhost:3000/auth/faceit/callback
```
[redirectmeto.com](https://redirectmeto.com) is a free public passthrough
- FACEIT redirects the user's own browser to that HTTPS URL, which
immediately 302-redirects it again to your local
`http://localhost:3000/auth/faceit/callback` (with all query parameters
forwarded), all within the user's own browser - no data is ever sent
anywhere except back to their own machine. The one caveat: it's a
third-party service, so a (very short-lived, useless-without-your-
client-secret) authorization code passes through it - acceptable for
personal/testing use, but replace it before distributing the app widely
(see option B).

**B. Self-hosted (recommended before shipping to real end users):**
Host a tiny static redirect page yourself (e.g. via free GitHub Pages -
see the "GitHub Release & Auto-Update Walkthrough" section below for
setting up a GitHub repo/Pages in the first place) with this content:
```html
<!DOCTYPE html>
<script>
  // Forwards FACEIT's callback (code/state query params) from this
  // public HTTPS page straight back to the local backend - runs
  // entirely in the USER'S OWN browser, nothing is sent to any server
  // other than GitHub Pages (a static file host, no backend logic) and
  // then the user's own localhost.
  location.replace('http://localhost:3000/auth/faceit/callback' + location.search);
</script>
```
Register this page's URL (e.g.
`https://<your-username>.github.io/cstracker-oauth-redirect/`) as the
Redirect URI on the FACEIT OAuth2 Client instead, and set
`FACEIT_OAUTH_REDIRECT_URI` to that same URL.

### 3. Configure the backend

Add to `cs2-overlay-backend/.env` (never commit this file - see
`.gitignore`):
```
FACEIT_OAUTH_CLIENT_ID=<your Client ID>
FACEIT_OAUTH_CLIENT_SECRET=<your Client Secret>
FACEIT_OAUTH_REDIRECT_URI=<the https:// redirect URI you registered - option A or B above>
```

**Development mode** (`npm run start:dev` in `cs2-overlay-backend`)
picks these up directly from `.env` - no extra step needed, just make
sure the file has real values before starting the backend.

**Packaged/release build**: the compiled sidecar binary does NOT ship
with a `.env` file next to it (only the executable itself is bundled -
see `tauri.conf.json` -> `bundle.externalBin`), so these three values
are instead baked into the **Tauri (Rust) side** at compile time -
`cs2-overlay-frontend/src-tauri/build.rs` automatically reads
`cs2-overlay-backend/.env` while compiling and embeds these three keys
into the built `.exe`, which then passes them to the sidecar process as
real environment variables on every launch (see `main.rs`
`spawn_backend_sidecar()`). Practically, this means:

1. Fill in the three `FACEIT_OAUTH_*` values in
   `cs2-overlay-backend/.env` (as above) BEFORE running the frontend
   build - not after.
2. Rebuild the sidecar (`npm run build:sidecar` in
   `cs2-overlay-backend`) so the backend logic itself is up to date.
3. Rebuild the frontend (`npm run tauri build` in
   `cs2-overlay-frontend`) - this is the step that actually re-reads
   `.env` and bakes the fresh values in. **If you only change `.env` and
   re-run step 2 without also rebuilding the frontend, the OLD values
   (or none, if this is the first time) stay baked into the existing
   `.exe`** - the Account tab's "Login with FACEIT" button showing "not
   configured on this build" after a rebuild almost always means this
   step was skipped or `.env` didn't have real values in it yet when the
   frontend was last built.

The Account tab's "Login with FACEIT" button (and the `/auth/faceit/login`
endpoint directly) shows a clear "not configured" error if any of the
three values are missing at runtime, instead of failing silently.

## GitHub Release & Auto-Update Walkthrough (step by step, from zero)

This is a beginner-friendly, click-by-click guide covering the WHOLE
path: getting the project onto GitHub, setting up auto-update signing,
and - the part people most often get stuck on - **where to actually
click to download the finished installer `.exe`** once everything runs.
If you've never used GitHub before, follow every step in order; if
you're already comfortable with git/GitHub, skip to "Auto-update setup"
below.

### Step 0: Get the project onto GitHub (skip if you already have a repo)

1. Go to [github.com](https://github.com) and sign up / log in.
2. Click the **+** icon (top-right) -> **New repository**. Give it a
   name (e.g. `cstracker`), choose **Private** (recommended - keeps your
   source and Actions logs to yourself) or **Public**, then **Create
   repository**. Leave "Add a README" unchecked (you already have one).
3. On your own computer, open a terminal **inside the project's root
   folder** (the one containing this `BUILD.md`) and run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/cstracker.git
   git push -u origin main
   ```
   (GitHub will prompt you to sign in the first time you push - follow
   its on-screen instructions, e.g. a browser-based login or a Personal
   Access Token.)
4. Refresh the repository page on github.com - you should now see all
   your project files there.

### Step 1-4: Auto-update signing setup

Follow the **"Auto-update setup"** section right below this one (generate
a signing key pair, put the public key + endpoint into `tauri.conf.json`,
add the private key as a GitHub Actions secret, then tag a release) -
come back here afterward for the final "where's my .exe" step.

### Step 5: Download the finished installer `.exe`

After you `git push origin vX.Y.Z` (the version tag), GitHub builds it
for you automatically - you do NOT need Rust/Node.js installed on your
own machine for this part, GitHub's own servers do the building:

1. On your repository's GitHub page, click the **Actions** tab (top
   menu). You should see a workflow run named "Release" appear within a
   few seconds, with a spinning yellow/orange icon while it's running.
2. Wait for it to finish (typically 5-15 minutes for a Windows build) -
   the icon turns into a green checkmark \u2713 on success, or a red X
   if something failed (click into the run to see the error log if so).
3. Once it succeeds, click the **Releases** link (right-hand sidebar of
   the repository's main page, or `github.com/<you>/cstracker/releases`
   directly). You'll see a new release listed as **"Draft"**.
4. Click on that draft release to open it. Scroll down to **Assets** -
   this is where your installer lives:
   - `CS Tracker_x.y.z_x64-setup.exe` (or `.msi`) - **this is the file
     you (or anyone you share it with) actually double-click to
     install CS Tracker** - the same kind of file as any other Windows
     program's installer.
   - `latest.json` - NOT for end users - this is the manifest the
     auto-updater itself reads to discover new versions; leave it
     attached to the release, don't rename/move it.
   - `.sig` files - the cryptographic signatures matching each
     installer; also not for end users, leave them attached.
5. Click the installer `.exe` asset's name (or the download icon next
   to it) to download it directly from this page.
6. Review the draft release's title/notes if you'd like to edit them,
   then click **Publish release** (turns it from "Draft" into a public/
   real release) - this is also the moment existing installs of CS
   Tracker start being able to discover this new version through the
   auto-updater (they read the published release's `latest.json`, not
   drafts).

That's the whole loop: bump the version -> `git tag` + `git push` -> wait
for the green checkmark in the **Actions** tab -> download from
**Releases** -> Publish. Every future update follows these same steps.

## Auto-update setup (one-time, optional)

CS Tracker ships with `tauri-plugin-updater` already wired in (Rust side,
JS "Software Update" section in the Control Panel's Overview tab), but
**disabled by default** (`tauri.conf.json` -> `plugins.updater.active:
false`) until you complete this one-time setup - without a real signing
key, this MUST stay disabled (see the security note at the end).

### 1. Generate a signing key pair

From `cs2-overlay-frontend/`:

```bash
npm run tauri signer generate -- -w ~/.tauri/cstracker.key
```

(On Windows, `~` resolves to your user profile folder, e.g.
`C:\Users\<you>\.tauri\cstracker.key`.) You'll be prompted to set a
password for the key - remember it, you'll need it below. This prints:

```
Your keypair was generated successfully
Private: /path/.tauri/cstracker.key (Keep it secret!)
Public: /path/.tauri/cstracker.key.pub
```

**Never share or commit the private key file.** If you lose it, you will
NOT be able to publish further updates to users who already have the app
installed - back it up somewhere safe (e.g. a password manager).

### 2. Add the public key + your update feed URL to `tauri.conf.json`

Open `cs2-overlay-frontend/src-tauri/tauri.conf.json` and:

1. Paste the **contents** of `cstracker.key.pub` into `plugins.updater.pubkey`.
2. Replace the placeholder `endpoints` URL with your own GitHub repo's
   release feed:
   ```
   https://github.com/<your-username>/<your-repo>/releases/latest/download/latest.json
   ```
3. Only once both of the above are real values, flip `plugins.updater.active`
   to `true`.

### 3. Add the private key as GitHub Actions secrets

In your GitHub repository: **Settings -> Secrets and variables -> Actions
-> New repository secret**, add:

- `TAURI_SIGNING_PRIVATE_KEY` - paste the entire contents of the
  `cstracker.key` file.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - the password you set in step 1.

These are read by `.github/workflows/release.yml` (already included in
this repo) to sign each release build - the private key itself never
needs to leave GitHub's encrypted secrets storage.

### 4. Publish a release

Bump the version number consistently in **three** places (they must
match) - `cs2-overlay-frontend/src-tauri/tauri.conf.json` (`"version"`),
`cs2-overlay-frontend/src-tauri/Cargo.toml` (`[package] version`), and
`cs2-overlay-frontend/package.json` (`"version"`) - then tag and push:

```bash
git tag v0.3.0
git push origin v0.3.0
```

Pushing a `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which
builds, signs, and creates a **draft** GitHub Release with the installer
and a `latest.json` manifest attached. Review the draft, then publish it
- existing installs will pick up the new version automatically the next
time they check (on startup, or via the Overview tab's "Check for
Updates" button), download it, verify its signature against your
`pubkey`, install it, and relaunch.

**See "Step 5: Download the finished installer `.exe`" above** for the
exact click-by-click path (Actions tab -> wait for the green checkmark
-> Releases tab -> Assets -> download).

### Security note

Do **not** enable `plugins.updater.active` without completing all of the
above - an update endpoint with no real signature verification (or an
endpoint you don't control) could let a malicious party serve a fake
"update" to every installed copy of CS Tracker. The signature check
itself cannot be disabled (by design), so a mismatched/missing key
simply makes every update attempt fail closed rather than silently
succeed insecurely - but the endpoint URL itself should still only ever
point at a release feed YOU control.

## Development mode (no build needed)

For day-to-day development, you don't need to go through the full build:

```bash
# terminal 1
cd cs2-overlay-backend && npm install && npm run start:dev

# terminal 2
cd cs2-overlay-frontend && npm install && npm run tauri dev
```

In dev mode the sidecar is not used; the frontend simply talks to the
backend you're running from source with hot-reload.
