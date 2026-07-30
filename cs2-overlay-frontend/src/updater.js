// Software Update (auto-updater) UI - Control Panel "Overview" tab.
//
// Wraps the `tauri-plugin-updater` + `tauri-plugin-process` JS APIs,
// exposed on `window.__TAURI__` because this project uses Tauri's
// `withGlobalTauri: true` mode (no bundler/npm-import build step for the
// frontend - see every other *.js file in this folder for the same
// plain-<script>-tag convention), instead of `import { check } from
// '@tauri-apps/plugin-updater'`.
//
// IMPORTANT: this UI works completely regardless of whether auto-update
// is actually configured yet. If `tauri.conf.json` -> `plugins.updater`
// is still `active: false` (the shipped default - see BUILD.md
// "Auto-update setup"), `window.__TAURI__.updater` is simply undefined,
// and this file degrades gracefully: the version number still displays,
// but "Check for Updates" shows a clear one-line explanation instead of
// silently failing or throwing.
(function () {
  const els = {
    currentVersion: document.getElementById("update-current-version"),
    statusDot: document.getElementById("update-status-dot"),
    statusLabel: document.getElementById("update-status-label"),
    checkBtn: document.getElementById("check-update-btn"),
    installBtn: document.getElementById("install-update-btn"),
    progressStatus: document.getElementById("update-progress-status"),
    notesHint: document.getElementById("update-notes-hint"),
  };

  // Holds the `Update` object returned by `check()` between "Check for
  // Updates" and "Download & Install Update" being clicked, so the second
  // step doesn't need to re-check.
  let pendingUpdate = null;

  function setStatus(label, variant) {
    // variant: 'idle' | 'ok' | 'available' | 'err'
    els.statusLabel.textContent = label;
    els.statusDot.classList.remove("dot-ok", "dot-missing");
    if (variant === "ok") {
      els.statusDot.classList.add("dot-ok");
    } else if (variant === "err" || variant === "available") {
      els.statusDot.classList.add("dot-missing");
    }
  }

  async function loadCurrentVersion() {
    try {
      const getVersion = window.__TAURI__?.app?.getVersion;
      if (getVersion) {
        els.currentVersion.textContent = await getVersion();
        return;
      }
    } catch (err) {
      console.warn("Failed to read the app version:", err);
    }
    els.currentVersion.textContent = "unknown";
  }

  /**
   * Runs the actual update check. `silent` (used for the automatic
   * startup check) suppresses the "you're already up to date" status so
   * it doesn't visually flash on every single launch - the user only
   * sees something when an update IS available, or when they explicitly
   * clicked "Check for Updates" themselves.
   */
  async function checkForUpdate(silent) {
    const updater = window.__TAURI__?.updater;
    if (!updater?.check) {
      if (!silent) {
        setStatus(
          "Auto-update isn't configured on this build yet (see BUILD.md \u2018Auto-update setup\u2019).",
          "err",
        );
      }
      return;
    }

    if (!silent) {
      els.checkBtn.disabled = true;
      setStatus("Checking for updates...", "idle");
    }
    try {
      const update = await updater.check();
      if (update) {
        pendingUpdate = update;
        setStatus(`Update available: v${update.version}`, "available");
        els.installBtn.style.display = "inline-block";
        if (update.body) {
          els.notesHint.textContent = `Release notes: ${update.body}`;
          els.notesHint.style.display = "block";
        } else {
          els.notesHint.style.display = "none";
        }
      } else {
        pendingUpdate = null;
        els.installBtn.style.display = "none";
        els.notesHint.style.display = "none";
        if (!silent) {
          setStatus("You're on the latest version.", "ok");
        }
      }
    } catch (err) {
      console.warn("Update check failed:", err);
      if (!silent) {
        setStatus("Couldn't check for updates - see the console for details.", "err");
      }
    } finally {
      if (!silent) {
        els.checkBtn.disabled = false;
      }
    }
  }

  els.checkBtn?.addEventListener("click", () => checkForUpdate(false));

  els.installBtn?.addEventListener("click", async () => {
    if (!pendingUpdate) return;

    els.installBtn.disabled = true;
    els.checkBtn.disabled = true;
    let downloaded = 0;
    let total = 0;
    els.progressStatus.textContent = "Downloading update...";
    try {
      // `downloadAndInstall` reports progress via three event types -
      // Started (gives the total content length, if the server sent
      // one), Progress (repeated, gives each chunk's size), and
      // Finished. We use these purely to show a percentage - the actual
      // install happens automatically once the download completes.
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength || 0;
          els.progressStatus.textContent = total
            ? `Downloading update... 0%`
            : "Downloading update...";
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength || 0;
          if (total > 0) {
            const pct = Math.min(100, Math.round((downloaded / total) * 100));
            els.progressStatus.textContent = `Downloading update... ${pct}%`;
          }
        } else if (event.event === "Finished") {
          els.progressStatus.textContent = "Installing update...";
        }
      });

      els.progressStatus.textContent = "Update installed - restarting CS Tracker...";
      const relaunch = window.__TAURI__?.process?.relaunch;
      if (relaunch) {
        // Brief pause so the "installed, restarting" message is actually
        // readable before the window disappears.
        setTimeout(() => relaunch(), 800);
      } else {
        els.progressStatus.textContent =
          "Update installed - please restart CS Tracker manually to finish.";
      }
    } catch (err) {
      console.warn("Update download/install failed:", err);
      els.progressStatus.textContent = `Update failed: ${err?.message || err}`;
      els.installBtn.disabled = false;
      els.checkBtn.disabled = false;
    }
  });

  (async function init() {
    await loadCurrentVersion();
    // Silent check shortly after startup - never interrupts/blocks
    // anything, and stays invisible unless an update is actually found
    // (or the user later clicks "Check for Updates" themselves, which
    // always shows the full status, including "up to date"/errors).
    setTimeout(() => checkForUpdate(true), 3000);
  })();
})();
