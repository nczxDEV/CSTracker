// CS Tracker - Control Panel (launcher) logic.
// This is the ONLY window of the app: it shows your current/live CS2
// match (via GSI) and a manual roster lookup mode directly inline, lets
// you customize its own background (solid color / gradient / Matrix
// rain), configure API keys (Setup Wizard), download the GSI config file,
// and manage saved players.

const BACKEND_URL = "http://localhost:3000";

const els = {
  launcherRoot: document.getElementById("launcher"),
  matrixCanvas: document.getElementById("matrix-canvas"),
  bgMode: document.getElementById("bg-mode"),
  solidColorRow: document.getElementById("solid-color-row"),
  gradientColorRow: document.getElementById("gradient-color-row"),
  matrixColorRow: document.getElementById("matrix-color-row"),
  matrixSpeedRow: document.getElementById("matrix-speed-row"),
  matrixDensityRow: document.getElementById("matrix-density-row"),
  galaxySpeedRow: document.getElementById("galaxy-speed-row"),
  galaxyLiveHint: document.getElementById("galaxy-live-hint"),
  cyberpunkSpeedRow: document.getElementById("cyberpunk-speed-row"),
  cyberpunkHint: document.getElementById("cyberpunk-hint"),
  teamspiritSpeedRow: document.getElementById("teamspirit-speed-row"),
  teamspiritHint: document.getElementById("teamspirit-hint"),
  customImageRow: document.getElementById("custom-image-row"),
  customImageStatusRow: document.getElementById("custom-image-status-row"),
  customImageInput: document.getElementById("custom-image-input"),
  customImageStatus: document.getElementById("custom-image-status"),
  customImageClearBtn: document.getElementById("custom-image-clear-btn"),
  customImageHint: document.getElementById("custom-image-hint"),
  solidColor: document.getElementById("solid-color"),
  gradientFrom: document.getElementById("gradient-from"),
  gradientTo: document.getElementById("gradient-to"),
  matrixColor: document.getElementById("matrix-color"),
  matrixSpeed: document.getElementById("matrix-speed"),
  matrixSpeedValue: document.getElementById("matrix-speed-value"),
  matrixDensity: document.getElementById("matrix-density"),
  matrixDensityValue: document.getElementById("matrix-density-value"),
  galaxySpeed: document.getElementById("galaxy-speed"),
  galaxySpeedValue: document.getElementById("galaxy-speed-value"),
  cyberpunkSpeed: document.getElementById("cyberpunk-speed"),
  cyberpunkSpeedValue: document.getElementById("cyberpunk-speed-value"),
  teamspiritSpeed: document.getElementById("teamspirit-speed"),
  teamspiritSpeedValue: document.getElementById("teamspirit-speed-value"),
  uiThemeToggle: document.getElementById("ui-theme-toggle"),
  panelOpacity: document.getElementById("panel-opacity"),
  panelOpacityValue: document.getElementById("panel-opacity-value"),
  applyBtn: document.getElementById("apply-btn"),
  resetBtn: document.getElementById("reset-btn"),
  saveStatus: document.getElementById("save-status"),
  previewCanvas: document.getElementById("preview-canvas"),
  previewPanel: document.getElementById("preview-panel"),
  savedPlayersList: document.getElementById("saved-players-list"),
  savedPlayersSearch: document.getElementById("saved-players-search"),
  savedPlayersSortBy: document.getElementById("saved-players-sort-by"),
  savedPlayersSortDirBtn: document.getElementById("saved-players-sort-dir-btn"),
  faceitApiKey: document.getElementById("faceit-api-key"),
  steamApiKey: document.getElementById("steam-api-key"),
  leetifyApiKey: document.getElementById("leetify-api-key"),
  saveApiKeysBtn: document.getElementById("save-api-keys-btn"),
  apiKeysSaveStatus: document.getElementById("api-keys-save-status"),
  faceitStatusDot: document.getElementById("faceit-status-dot"),
  steamStatusDot: document.getElementById("steam-status-dot"),
  leetifyStatusDot: document.getElementById("leetify-status-dot"),
  gsiStatusDot: document.getElementById("gsi-status-dot"),
  gsiStatusLabel: document.getElementById("gsi-status-label"),
  downloadGsiConfigBtn: document.getElementById("download-gsi-config-btn"),
  confirmDialogOverlay: document.getElementById("confirm-dialog-overlay"),
  confirmDialogMessage: document.getElementById("confirm-dialog-message"),
  confirmDialogCancel: document.getElementById("confirm-dialog-cancel"),
  confirmDialogConfirm: document.getElementById("confirm-dialog-confirm"),
  quitOnCloseToggle: document.getElementById("quit-on-close-toggle"),
  quitCompletelyBtn: document.getElementById("quit-completely-btn"),
  discordWebhookUrl: document.getElementById("discord-webhook-url"),
  discordStatusDot: document.getElementById("discord-status-dot"),
  discordEnabledToggle: document.getElementById("discord-enabled-toggle"),
  discordVacToggle: document.getElementById("discord-vac-toggle"),
  discordMatchEndToggle: document.getElementById("discord-match-end-toggle"),
  discordMatchTypePicker: document.getElementById("discord-match-type-picker"),
  discordCurrentMatchType: document.getElementById("discord-current-match-type"),
  saveDiscordSettingsBtn: document.getElementById("save-discord-settings-btn"),
  sendDiscordTestBtn: document.getElementById("send-discord-test-btn"),
  discordSaveStatus: document.getElementById("discord-save-status"),
  trackedPlayerInput: document.getElementById("tracked-player-input"),
  addTrackedPlayerBtn: document.getElementById("add-tracked-player-btn"),
  trackedPlayerAddStatus: document.getElementById("tracked-player-add-status"),
  trackedPlayerLossToggle: document.getElementById("tracked-player-loss-toggle"),
  trackedPlayerWinToggle: document.getElementById("tracked-player-win-toggle"),
  trackedPlayersList: document.getElementById("tracked-players-list"),
  inlineRosterInput: document.getElementById("inline-roster-input"),
  inlineAddRosterEntryBtn: document.getElementById("inline-add-roster-entry-btn"),
  inlineRosterChips: document.getElementById("inline-roster-chips"),
  inlineResolveBtn: document.getElementById("inline-resolve-btn"),
  inlineClearBtn: document.getElementById("inline-clear-btn"),
  inlineCompactToggleBtn: document.getElementById("inline-compact-toggle-btn"),
  inlineGsiBanner: document.getElementById("inline-gsi-banner"),
  inlineGsiLoadRosterBtn: document.getElementById("inline-gsi-load-roster-btn"),
  liveMatchStatusDot: document.getElementById("live-match-status-dot"),
  liveMatchStatusLabel: document.getElementById("live-match-status-label"),
  matchroomInput: document.getElementById("matchroom-input"),
  matchroomLoadBtn: document.getElementById("matchroom-load-btn"),
  matchroomStatus: document.getElementById("matchroom-status"),
  dodgeOrPlayLink: document.getElementById("dodge-or-play-link"),
  mhAvgKd: document.getElementById("mh-avg-kd"),
  mhMatchCount: document.getElementById("mh-match-count"),
  mhWinTrend: document.getElementById("mh-win-trend"),
  matchHistorySparkline: document.getElementById("match-history-sparkline"),
  matchHistoryEmpty: document.getElementById("match-history-empty"),
  matchHistoryList: document.getElementById("match-history-list"),
  refreshMatchHistoryBtn: document.getElementById("refresh-match-history-btn"),
  clearMatchHistoryBtn: document.getElementById("clear-match-history-btn"),
  matchHistoryViewToggle: document.getElementById("match-history-view-toggle"),
  matchHistoryRecentView: document.getElementById("match-history-recent-view"),
  matchHistorySessionsView: document.getElementById("match-history-sessions-view"),
  sessionReportRoot: document.getElementById("session-report-root"),
  navTabs: document.querySelectorAll(".nav-tab"),
  tabPanels: document.querySelectorAll(".launcher-tab-panel"),
  columnPicker: document.getElementById("column-picker"),
  defaultViewSelect: document.getElementById("default-view-select"),
  teamComparisonToggle: document.getElementById("team-comparison-toggle"),
  winProbabilityToggle: document.getElementById("win-probability-toggle"),
  displaySaveStatus: document.getElementById("display-save-status"),
};

let previewMatrix = null;
let previewGalaxy = null;
let previewCyberpunk = null;
let previewTeamSpirit = null;
let savedPlayersSortDir = "desc";

// ---------------------------------------------------------------------------
// Saved players - demo data used when the backend is unreachable (same
// sample shape as the reference "HDZJ" card: ELO/K-D/Win rate/Recent results).
// ---------------------------------------------------------------------------
// The FACEIT "level" fields below are intentionally NOT hand-maintained -
// they're derived from "elo" via tracker-render.js's shared
// levelFromElo()-equivalent bracket table (window.TrackerRenderer
// exposes levelIconPath(), which resolves the same way real profiles
// do), so this demo data can never drift out of sync with the official
// FACEIT Elo brackets the way it previously did (e.g. showing "Level 5"
// for 1310 Elo, when that's actually Level 6).
const MOCK_SAVED_PLAYERS = [
  {
    identifier: "hdzj-demo",
    savedAt: new Date().toISOString(),
    note: "Strong AWPer, play carefully against them in early rounds.",
    profile: {
      nickname: "HDZJ",
      faceit: { level: null, elo: 2181 },
      stats: { kd: 1.37, winRate: 58 },
      recentResults: ["W", "W", "L", "W"],
    },
  },
  {
    identifier: "shibe-demo",
    savedAt: new Date(Date.now() - 86400000).toISOString(),
    note: "",
    profile: {
      nickname: "shibe",
      faceit: { level: null, elo: 1310 },
      stats: { kd: 0.9, winRate: 35 },
      recentResults: ["L", "L", "W"],
    },
  },
];

function currentFormValues() {
  // Spread the currently-persisted settings first, so this "background
  // settings" form save never wipes out unrelated settings that live
  // outside this form (display/column preferences, Discord Alerts,
  // etc.) - only the fields the Appearance tab's background controls
  // actually own are overridden below.
  const { loadSettings } = window.OverlaySettingsStore;
  return {
    ...loadSettings(),
    backgroundMode: els.bgMode.value,
    solidColor: els.solidColor.value,
    gradientFrom: els.gradientFrom.value,
    gradientTo: els.gradientTo.value,
    matrixColor: els.matrixColor.value,
    matrixSpeed: parseFloat(els.matrixSpeed.value),
    matrixDensity: parseFloat(els.matrixDensity.value),
    galaxySpeed: parseFloat(els.galaxySpeed.value),
    cyberpunkSpeed: parseFloat(els.cyberpunkSpeed.value),
    teamSpiritSpeed: parseFloat(els.teamspiritSpeed.value),
    panelOpacity: parseFloat(els.panelOpacity.value),
  };
}

function populateForm(settings) {
  els.bgMode.value = settings.backgroundMode;
  els.solidColor.value = settings.solidColor;
  els.gradientFrom.value = settings.gradientFrom;
  els.gradientTo.value = settings.gradientTo;
  els.matrixColor.value = settings.matrixColor;
  els.matrixSpeed.value = settings.matrixSpeed;
  els.matrixDensity.value = settings.matrixDensity;
  els.galaxySpeed.value = settings.galaxySpeed;
  els.cyberpunkSpeed.value = settings.cyberpunkSpeed;
  els.teamspiritSpeed.value = settings.teamSpiritSpeed;
  els.panelOpacity.value = settings.panelOpacity;
  updateRowVisibility();
  updateRangeLabels();
  updateCustomImageStatus(settings);
}

function updateRowVisibility() {
  const mode = els.bgMode.value;
  els.solidColorRow.style.display = mode === "solid" ? "flex" : "none";
  els.gradientColorRow.style.display = mode === "gradient" ? "flex" : "none";
  els.matrixColorRow.style.display = mode === "matrix" ? "flex" : "none";
  els.matrixSpeedRow.style.display = mode === "matrix" ? "flex" : "none";
  els.matrixDensityRow.style.display = mode === "matrix" ? "flex" : "none";
  els.galaxySpeedRow.style.display = mode === "galaxy-live" ? "flex" : "none";
  els.galaxyLiveHint.style.display = mode === "galaxy-live" ? "block" : "none";
  els.cyberpunkSpeedRow.style.display = mode === "cyberpunk" ? "flex" : "none";
  els.cyberpunkHint.style.display = mode === "cyberpunk" ? "block" : "none";
  els.teamspiritSpeedRow.style.display = mode === "teamspirit" ? "flex" : "none";
  els.teamspiritHint.style.display = mode === "teamspirit" ? "block" : "none";
  els.customImageRow.style.display = mode === "custom" ? "flex" : "none";
  els.customImageStatusRow.style.display = mode === "custom" ? "flex" : "none";
  els.customImageHint.style.display = mode === "custom" ? "block" : "none";
}

/** Reflects whether a custom background image is currently stored, in the Appearance tab's "Custom Image" row. */
function updateCustomImageStatus(settings) {
  els.customImageStatus.textContent = settings.customBackgroundImage
    ? "Image uploaded \u2713"
    : "No image uploaded yet.";
}

function updateRangeLabels() {
  els.matrixSpeedValue.textContent = `${parseFloat(els.matrixSpeed.value).toFixed(1)}x`;
  els.matrixDensityValue.textContent = `${parseFloat(els.matrixDensity.value).toFixed(1)}x`;
  els.galaxySpeedValue.textContent = `${parseFloat(els.galaxySpeed.value).toFixed(1)}x`;
  els.cyberpunkSpeedValue.textContent = `${parseFloat(els.cyberpunkSpeed.value).toFixed(1)}x`;
  els.teamspiritSpeedValue.textContent = `${parseFloat(els.teamspiritSpeed.value).toFixed(1)}x`;
  els.panelOpacityValue.textContent = `${Math.round(parseFloat(els.panelOpacity.value) * 100)}%`;
}

// ---------------------------------------------------------------------------
// "UI Theme" (Tactical HUD vs. Tactical Glass) - a purely cosmetic
// cards/nav/buttons reskin, independent of the "App Background" setting
// above (see DEFAULT_SETTINGS.uiTheme doc comment in settings-store.js
// and theme-glass.css for the actual overrides). Applies instantly, no
// restart needed, and persists via the same settings store.
// ---------------------------------------------------------------------------
function setUiTheme(uiTheme) {
  window.OverlaySettingsStore.applyUiTheme(uiTheme);
  els.uiThemeToggle.querySelectorAll(".mp-toggle").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-ui-theme") === uiTheme);
  });
}

els.uiThemeToggle.querySelectorAll(".mp-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const uiTheme = btn.getAttribute("data-ui-theme");
    const { loadSettings, saveSettings } = window.OverlaySettingsStore;
    saveSettings({ ...loadSettings(), uiTheme });
    setUiTheme(uiTheme);
  });
});

function updatePreview() {
  const settings = currentFormValues();
  const { applyBackground } = window.OverlaySettingsStore;

  if (!previewMatrix) {
    previewMatrix = new window.MatrixRain(els.previewCanvas);
  }
  if (!previewGalaxy) {
    previewGalaxy = new window.GalaxyBackground(els.previewCanvas);
  }
  if (!previewCyberpunk) {
    previewCyberpunk = new window.CyberpunkBackground(els.previewCanvas);
  }
  if (!previewTeamSpirit) {
    previewTeamSpirit = new window.TeamSpiritBackground(els.previewCanvas);
  }
  applyBackground(settings, els.previewPanel, els.previewCanvas, {
    matrix: previewMatrix,
    galaxy: previewGalaxy,
    cyberpunk: previewCyberpunk,
    teamSpirit: previewTeamSpirit,
  });
}

/**
 * Applies the "App Background" settings to the Control Panel window
 * itself (the `#launcher` container + the full-window `#matrix-canvas`
 * behind it), the same way this previously only applied to the (now
 * removed) separate transparent overlay window - reusing the exact same
 * generic `applyBackground()` helper (see settings-store.js), just
 * pointed at this window's own elements instead.
 */
let launcherMatrix = null;
let launcherGalaxy = null;
let launcherCyberpunk = null;
let launcherTeamSpirit = null;
function applyBackgroundToLauncher(settings) {
  const { applyBackground } = window.OverlaySettingsStore;
  if (!launcherMatrix && els.matrixCanvas) {
    launcherMatrix = new window.MatrixRain(els.matrixCanvas);
  }
  if (!launcherGalaxy && els.matrixCanvas) {
    launcherGalaxy = new window.GalaxyBackground(els.matrixCanvas);
  }
  if (!launcherCyberpunk && els.matrixCanvas) {
    launcherCyberpunk = new window.CyberpunkBackground(els.matrixCanvas);
  }
  if (!launcherTeamSpirit && els.matrixCanvas) {
    launcherTeamSpirit = new window.TeamSpiritBackground(els.matrixCanvas);
  }
  applyBackground(settings, els.launcherRoot, els.matrixCanvas, {
    matrix: launcherMatrix,
    galaxy: launcherGalaxy,
    cyberpunk: launcherCyberpunk,
    teamSpirit: launcherTeamSpirit,
  });
}

// ---------------------------------------------------------------------------
// Custom background image upload ("Custom image..." backgroundMode) - lets
// the user pick any PNG/JPEG/WebP file from their computer to use as the
// background for BOTH the overlay and this Control Panel window. The file
// is downscaled client-side (canvas) and stored as a data URL directly in
// the shared settings store (localStorage) - never uploaded anywhere, and
// no extra Tauri filesystem permissions are needed since it's just a
// regular <input type="file"> + FileReader/canvas, same as any web page.
// ---------------------------------------------------------------------------
const CUSTOM_BACKGROUND_MAX_DIMENSION = 1920;
const CUSTOM_BACKGROUND_JPEG_QUALITY = 0.85;

/** Downscales an image file to at most CUSTOM_BACKGROUND_MAX_DIMENSION on its longest edge, returning a JPEG data URL - keeps localStorage usage reasonable even for large photos/screenshots. */
function downscaleImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read the file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode the image."));
      img.onload = () => {
        const scale = Math.min(1, CUSTOM_BACKGROUND_MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", CUSTOM_BACKGROUND_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

els.customImageInput.addEventListener("change", async () => {
  const file = els.customImageInput.files?.[0];
  if (!file) return;

  els.customImageStatus.textContent = "Processing...";
  try {
    const dataUrl = await downscaleImageToDataUrl(file);
    const { saveSettings } = window.OverlaySettingsStore;
    // IMPORTANT: persist via currentFormValues() (which reads the LIVE
    // "Mode" dropdown, currently "custom" - this row is only visible/
    // interactable while it is) rather than loadSettings() alone. The
    // previous version only merged `customBackgroundImage` on top of the
    // last-SAVED settings, so if the user had just switched the dropdown
    // to "Custom image..." without clicking "Apply" first, the upload
    // would silently save the image while leaving backgroundMode on
    // whatever mode was previously applied - the image was stored, but
    // never actually shown (this was the reported "Custom image doesn't
    // work" bug: the small preview panel looked right because it renders
    // straight from the live form, but the real Control Panel background
    // and the persisted setting did not).
    const updated = saveSettings({ ...currentFormValues(), customBackgroundImage: dataUrl });
    updateCustomImageStatus(updated);
    updatePreview();
    applyBackgroundToLauncher(updated);
  } catch (err) {
    console.warn("Custom background upload failed:", err);
    els.customImageStatus.textContent = "Failed to load that image - try a different file.";
  } finally {
    els.customImageInput.value = "";
  }
});

els.customImageClearBtn.addEventListener("click", () => {
  const { saveSettings } = window.OverlaySettingsStore;
  const updated = saveSettings({ ...currentFormValues(), customBackgroundImage: null });
  updateCustomImageStatus(updated);
  updatePreview();
  applyBackgroundToLauncher(updated);
});

// ---------------------------------------------------------------------------
// Discord Alerts (see DiscordModule) - lets the user get a Discord webhook
// message when a VAC/game-banned player is detected in their roster, or
// when one of their own matches finishes, optionally filtered by match
// type (Any / Premier / Casual - see MatchContextService for the
// classification heuristic and its documented limitations).
// ---------------------------------------------------------------------------

const MATCH_TYPE_LABELS = {
  premier: "Premier / Competitive",
  casual: "Casual / Other",
  unknown: "Unknown",
};

async function pollCurrentMatchType() {
  try {
    const res = await fetch(`${BACKEND_URL}/settings/match-context`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    els.discordCurrentMatchType.textContent = MATCH_TYPE_LABELS[data.matchType] || "Unknown";
  } catch (err) {
    els.discordCurrentMatchType.textContent = "Unknown (backend unreachable)";
  }
}

async function loadDiscordSettings() {
  try {
    const res = await fetch(`${BACKEND_URL}/settings/discord`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const status = await res.json();
    setStatusDot(els.discordStatusDot, status.configured);
    els.discordEnabledToggle.checked = Boolean(status.enabled);
    els.discordVacToggle.checked = Boolean(status.alertOnVacBan);
    els.discordMatchEndToggle.checked = Boolean(status.alertOnMatchEnd);
    els.trackedPlayerLossToggle.checked = status.alertOnTrackedPlayerLoss !== false;
    els.trackedPlayerWinToggle.checked = Boolean(status.alertOnTrackedPlayerWin);
    const activeTypes = new Set(status.matchTypes || ["any"]);
    els.discordMatchTypePicker.querySelectorAll("input[type='checkbox']").forEach((cb) => {
      cb.checked = activeTypes.has(cb.value);
      cb.closest(".column-chip")?.classList.toggle("checked", cb.checked);
    });
  } catch (err) {
    console.warn("loadDiscordSettings failed (backend unreachable?):", err);
    setStatusDot(els.discordStatusDot, false);
  }
}

els.discordMatchTypePicker.querySelectorAll("input[type='checkbox']").forEach((cb) => {
  cb.addEventListener("change", () => {
    cb.closest(".column-chip")?.classList.toggle("checked", cb.checked);
  });
});

els.saveDiscordSettingsBtn.addEventListener("click", async () => {
  const matchTypes = Array.from(
    els.discordMatchTypePicker.querySelectorAll("input[type='checkbox']:checked"),
  ).map((cb) => cb.value);

  const payload = {
    webhookUrl: els.discordWebhookUrl.value.trim() || undefined,
    enabled: els.discordEnabledToggle.checked,
    alertOnVacBan: els.discordVacToggle.checked,
    alertOnMatchEnd: els.discordMatchEndToggle.checked,
    matchTypes: matchTypes.length > 0 ? matchTypes : ["any"],
  };

  els.saveDiscordSettingsBtn.disabled = true;
  try {
    const res = await fetch(`${BACKEND_URL}/settings/discord`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const status = await res.json();
    setStatusDot(els.discordStatusDot, status.configured);
    els.discordWebhookUrl.value = "";
    els.discordSaveStatus.textContent = "Saved \u2713";
    els.discordSaveStatus.classList.add("saved");
  } catch (err) {
    console.warn("saveDiscordSettings failed:", err);
    els.discordSaveStatus.textContent = "Failed to save (backend unreachable?)";
    els.discordSaveStatus.classList.remove("saved");
  } finally {
    els.saveDiscordSettingsBtn.disabled = false;
    setTimeout(() => {
      els.discordSaveStatus.textContent = "";
      els.discordSaveStatus.classList.remove("saved");
    }, 2500);
  }
});

els.sendDiscordTestBtn.addEventListener("click", async () => {
  els.sendDiscordTestBtn.disabled = true;
  const originalText = els.sendDiscordTestBtn.textContent;
  els.sendDiscordTestBtn.textContent = "Sending...";
  try {
    const res = await fetch(`${BACKEND_URL}/discord/test`, { method: "POST" });
    const result = await res.json();
    els.discordSaveStatus.textContent = result.sent
      ? "Test alert sent \u2713 - check your Discord channel"
      : `Failed: ${result.reason || "unknown error"}`;
    els.discordSaveStatus.classList.toggle("saved", Boolean(result.sent));
  } catch (err) {
    console.warn("sendDiscordTest failed:", err);
    els.discordSaveStatus.textContent = "Failed to send (backend unreachable?)";
    els.discordSaveStatus.classList.remove("saved");
  } finally {
    els.sendDiscordTestBtn.disabled = false;
    els.sendDiscordTestBtn.textContent = originalText;
    setTimeout(() => {
      els.discordSaveStatus.textContent = "";
      els.discordSaveStatus.classList.remove("saved");
    }, 4000);
  }
});

// ---------------------------------------------------------------------------
// Player Tracking (see PlayerTrackingModule) - track any FACEIT player by
// nickname (not necessarily someone you're playing with) and get a
// Discord alert whenever their next match finishes, with their personal
// K/D/stats for that match. FACEIT-only - see the section's hint text
// for why (Valve doesn't expose a public match-history API for arbitrary
// Steam/Premier players).
// ---------------------------------------------------------------------------
function renderTrackedPlayers(entries) {
  if (!entries || entries.length === 0) {
    els.trackedPlayersList.innerHTML = '<div class="empty-state">No players tracked yet.</div>';
    return;
  }
  els.trackedPlayersList.innerHTML = entries
    .map((entry) => {
      const status = entry.lastSeenMatchId
        ? "Watching for their next match..."
        : "No match history found yet.";
      return `
        <div class="tracked-player-item" data-tracked-id="${entry.id}">
          <span class="tracked-player-name">${entry.displayName || entry.identifier}</span>
          <span class="tracked-player-status">${status}</span>
          <button class="tracked-player-remove-btn" data-remove-tracked-id="${entry.id}">Remove</button>
        </div>`;
    })
    .join("");

  els.trackedPlayersList.querySelectorAll("[data-remove-tracked-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-remove-tracked-id");
      const confirmed = await showConfirmDialog(`Stop tracking this player?`);
      if (!confirmed) return;
      btn.disabled = true;
      try {
        await fetch(`${BACKEND_URL}/player-tracking/${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch (err) {
        console.warn("removeTrackedPlayer failed:", err);
      }
      loadTrackedPlayers();
    });
  });
}

async function loadTrackedPlayers() {
  try {
    const res = await fetch(`${BACKEND_URL}/player-tracking`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderTrackedPlayers(await res.json());
  } catch (err) {
    console.warn("loadTrackedPlayers failed (backend unreachable?):", err);
    els.trackedPlayersList.innerHTML =
      '<div class="empty-state">Could not load tracked players (backend unreachable?).</div>';
  }
}

els.addTrackedPlayerBtn.addEventListener("click", async () => {
  const identifier = els.trackedPlayerInput.value.trim();
  if (!identifier) return;

  els.addTrackedPlayerBtn.disabled = true;
  const originalText = els.addTrackedPlayerBtn.textContent;
  els.addTrackedPlayerBtn.textContent = "Adding...";
  try {
    const res = await fetch(`${BACKEND_URL}/player-tracking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `HTTP ${res.status}`);
    }
    els.trackedPlayerInput.value = "";
    els.trackedPlayerAddStatus.textContent = `Now tracking "${identifier}" \u2713`;
    els.trackedPlayerAddStatus.classList.add("saved");
    loadTrackedPlayers();
  } catch (err) {
    console.warn("addTrackedPlayer failed:", err);
    els.trackedPlayerAddStatus.textContent = Array.isArray(err.message) ? err.message.join(", ") : String(err.message || err);
    els.trackedPlayerAddStatus.classList.remove("saved");
  } finally {
    els.addTrackedPlayerBtn.disabled = false;
    els.addTrackedPlayerBtn.textContent = originalText;
    setTimeout(() => {
      els.trackedPlayerAddStatus.textContent = "";
      els.trackedPlayerAddStatus.classList.remove("saved");
    }, 4000);
  }
});

els.trackedPlayerInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    els.addTrackedPlayerBtn.click();
  }
});

/** The win/loss toggles auto-save immediately (like the Appearance tab's column picker) rather than riding along with the Discord Alerts section's "Save" button above, since they're visually detached from it. */
async function saveTrackedPlayerAlertToggles() {
  try {
    await fetch(`${BACKEND_URL}/settings/discord`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alertOnTrackedPlayerLoss: els.trackedPlayerLossToggle.checked,
        alertOnTrackedPlayerWin: els.trackedPlayerWinToggle.checked,
      }),
    });
  } catch (err) {
    console.warn("saveTrackedPlayerAlertToggles failed:", err);
  }
}
els.trackedPlayerLossToggle.addEventListener("change", saveTrackedPlayerAlertToggles);
els.trackedPlayerWinToggle.addEventListener("change", saveTrackedPlayerAlertToggles);

// ---------------------------------------------------------------------------
// "My Match History" - K/D trend from CS2's GSI, recorded automatically by
// the backend (GsiService) whenever a match finishes. Only ever shows the
// LOCAL player's own stats - never other players' data.
// ---------------------------------------------------------------------------

/** Simple, dependency-free canvas line chart for the K/D trend (oldest -> newest, left to right). */
function drawKdSparkline(canvas, values) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 300;
  const height = rect.height || 64;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!values || values.length === 0) return;

  const padding = 8;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const max = Math.max(...values, 1.5);
  const min = Math.min(...values, 0.5);
  const range = Math.max(max - min, 0.1);
  const toXY = (v, i) => [
    padding + (values.length > 1 ? (i / (values.length - 1)) * w : w / 2),
    padding + h - ((v - min) / range) * h,
  ];

  // Reference line at K/D = 1.0 (break-even).
  const [, refY] = toXY(1, 0);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, refY);
  ctx.lineTo(padding + w, refY);
  ctx.stroke();

  ctx.strokeStyle = "#2f6fed";
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const [x, y] = toXY(v, i);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  values.forEach((v, i) => {
    const [x, y] = toXY(v, i);
    ctx.fillStyle = v >= 1 ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderMatchHistory(entries) {
  const hasData = Boolean(entries && entries.length > 0);
  els.matchHistoryEmpty.style.display = hasData ? "none" : "flex";
  els.matchHistorySparkline.style.display = hasData ? "block" : "none";

  if (!hasData) {
    els.mhAvgKd.textContent = "N/A";
    els.mhMatchCount.textContent = "0";
    els.mhWinTrend.textContent = "N/A";
    els.mhWinTrend.className = "mh-value";
    els.matchHistoryList.innerHTML = "";
    return;
  }

  // Backend returns most-recent-first; the sparkline reads left (oldest) to right (newest).
  const chronological = [...entries].reverse();
  const kdValues = chronological.map((e) => e.kd).filter((v) => v !== null && v !== undefined);

  const avgKd = kdValues.length ? kdValues.reduce((a, b) => a + b, 0) / kdValues.length : null;
  els.mhAvgKd.textContent = avgKd !== null ? avgKd.toFixed(2) : "N/A";
  els.mhMatchCount.textContent = String(entries.length);

  if (kdValues.length >= 4) {
    const mid = Math.floor(kdValues.length / 2);
    const olderAvg = kdValues.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const recentAvg = kdValues.slice(mid).reduce((a, b) => a + b, 0) / (kdValues.length - mid);
    const delta = recentAvg - olderAvg;
    if (Math.abs(delta) < 0.05) {
      els.mhWinTrend.textContent = "\u2192 Stable";
      els.mhWinTrend.className = "mh-value";
    } else if (delta > 0) {
      els.mhWinTrend.textContent = "\u2191 Improving";
      els.mhWinTrend.className = "mh-value mh-trend-up";
    } else {
      els.mhWinTrend.textContent = "\u2193 Declining";
      els.mhWinTrend.className = "mh-value mh-trend-down";
    }
  } else {
    els.mhWinTrend.textContent = "N/A";
    els.mhWinTrend.className = "mh-value";
  }

  drawKdSparkline(els.matchHistorySparkline, kdValues);

  els.matchHistoryList.innerHTML = entries
    .slice(0, 10)
    .map((e) => {
      const kdLabel = e.kd !== null && e.kd !== undefined ? e.kd.toFixed(2) : "N/A";
      const kdClass = e.kd != null && e.kd >= 1 ? "stat-kd-good" : e.kd != null ? "stat-kd-bad" : "";
      const scoreLabel = e.ctScore != null && e.tScore != null ? `${e.ctScore}-${e.tScore}` : "N/A";
      const resultBadge =
        e.won === true
          ? '<span class="recent-badge win" title="Win">W</span>'
          : e.won === false
            ? '<span class="recent-badge loss" title="Loss">L</span>'
            : '<span class="recent-badge na" title="Result not determined">?</span>';
      return `
        <div class="match-history-row">
          <span class="mh-map">${resultBadge} ${e.map || "Unknown map"}</span>
          <span class="mh-score">${scoreLabel}</span>
          <span class="mh-kda">${e.kills ?? "?"}/${e.deaths ?? "?"}/${e.assists ?? "?"}</span>
          <span class="mh-kd-value ${kdClass}">${kdLabel}</span>
          <span class="mh-when">${formatSavedAt(e.recordedAt)}</span>
        </div>`;
    })
    .join("");
}

async function loadMatchHistory() {
  try {
    const res = await fetch(`${BACKEND_URL}/match-history?limit=20`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderMatchHistory(await res.json());
  } catch (err) {
    console.warn("loadMatchHistory failed (backend/GSI unreachable?):", err);
    renderMatchHistory([]);
  }
}

els.refreshMatchHistoryBtn.addEventListener("click", () => {
  loadMatchHistory();
  loadSessionReport();
});
els.clearMatchHistoryBtn.addEventListener("click", async () => {
  const confirmed = await showConfirmDialog(
    "Clear all recorded match history? This cannot be undone.",
  );
  if (!confirmed) return;
  try {
    await fetch(`${BACKEND_URL}/match-history`, { method: "DELETE" });
  } catch (err) {
    console.warn("clearMatchHistory failed:", err);
  }
  loadMatchHistory();
  loadSessionReport();
});

// ---------------------------------------------------------------------------
// "Session Performance Report" view (My Match History section) - clusters
// the SAME match_history data (see backend GET /match-history/sessions)
// into play sessions by time gap, showing per-session win rate, avg K/D,
// and win/loss streaks - a different "lens" on the same data as the
// "Recent" sparkline/list view, toggled via the pills next to the h2.
// ---------------------------------------------------------------------------
function renderSessionReportEmpty(message) {
  els.sessionReportRoot.innerHTML = `<div class="empty-state">${message}</div>`;
}

function renderSessionReport(sessions) {
  if (!sessions || sessions.length === 0) {
    renderSessionReportEmpty("No sessions recorded yet - play a match with GSI connected.");
    return;
  }

  els.sessionReportRoot.innerHTML = `
    <div class="session-report-list">
      ${sessions
        .map((s) => {
          const start = formatSavedAt(s.sessionStart);
          const end = formatSavedAt(s.sessionEnd);
          const wrClass = s.winRatePercent === null ? "" : s.winRatePercent >= 50 ? "good" : "bad";
          return `
        <div class="session-card">
          <div class="session-card-header">
            <span class="session-card-dates">${start} &rarr; ${end}</span>
            ${s.endedOnLosingStreak ? '<span class="session-card-tilt">ENDED ON A LOSING STREAK</span>' : ""}
          </div>
          <div class="session-stats-grid">
            <div class="session-stat">
              <span class="val ${wrClass}">${s.winRatePercent !== null ? s.winRatePercent + "%" : "N/A"}</span>
              <span class="lbl">Win Rate</span>
            </div>
            <div class="session-stat">
              <span class="val">${s.wins}-${s.losses}${s.undecided ? ` (+${s.undecided}?)` : ""}</span>
              <span class="lbl">Record</span>
            </div>
            <div class="session-stat">
              <span class="val">${s.avgKd !== null ? s.avgKd.toFixed(2) : "N/A"}</span>
              <span class="lbl">Avg K/D</span>
            </div>
            <div class="session-stat">
              <span class="val">${s.matches}</span>
              <span class="lbl">Matches</span>
            </div>
          </div>
        </div>`;
        })
        .join("")}
    </div>`;
}

async function loadSessionReport() {
  try {
    const res = await fetch(`${BACKEND_URL}/match-history/sessions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderSessionReport(data.sessions);
  } catch (err) {
    console.warn("loadSessionReport failed (backend/GSI unreachable?):", err);
    renderSessionReportEmpty("Couldn't load session report (backend unreachable?).");
  }
}

els.matchHistoryViewToggle.querySelectorAll(".mp-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.getAttribute("data-view");
    els.matchHistoryViewToggle.querySelectorAll(".mp-toggle").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    els.matchHistoryRecentView.style.display = view === "recent" ? "block" : "none";
    els.matchHistorySessionsView.style.display = view === "sessions" ? "block" : "none";
    if (view === "sessions") loadSessionReport();
  });
});

// ---------------------------------------------------------------------------
// Window & Tray Behavior - "Fully quit on close" toggle (see
// settings-store.js DEFAULT_SETTINGS.quitOnClose and
// src-tauri/src/main.rs QuitOnCloseState) and the "Quit Completely"
// button, which always fully exits regardless of the toggle (invokes the
// `quit_completely` Tauri command - see main.rs).
// ---------------------------------------------------------------------------
els.quitOnCloseToggle.addEventListener("change", () => {
  const enabled = els.quitOnCloseToggle.checked;
  const { loadSettings, saveSettings } = window.OverlaySettingsStore;
  saveSettings({ ...loadSettings(), quitOnClose: enabled });
});

els.quitCompletelyBtn.addEventListener("click", async () => {
  const confirmed = await showConfirmDialog(
    "Quit CS Tracker completely? This closes the Control Panel and stops the background backend process. You can reopen the app from your Start Menu/Applications like normal.",
  );
  if (!confirmed) return;

  const invokeFn = window.__TAURI__?.core?.invoke;
  if (!invokeFn) {
    console.warn("Not running inside the desktop app - can't fully quit from here (demo mode).");
    return;
  }
  try {
    await invokeFn("quit_completely");
  } catch (err) {
    // The app process exits as part of this call, so an error here
    // usually just means the connection was torn down mid-response -
    // not a real failure.
    console.warn("quit_completely invoke returned an error (app is likely already exiting):", err);
  }
});

// ---------------------------------------------------------------------------
// Inline Tracker (Overview tab) - the "Current Match" (live GSI roster) and
// "Manual Mode" (typed-in roster) sections both render into this SAME
// tracker instance/result area via tracker-render.js.
// ---------------------------------------------------------------------------
const inlineTracker = window.TrackerRenderer.createTracker("inline-tracker-body-root");
const INLINE_MOCK_PROFILES = window.TrackerRenderer.MOCK_PROFILES;

/**
 * Calls the backend to resolve real player identifiers into profiles.
 *
 * IMPORTANT: a failure here is NEVER silently papered over with demo
 * data - that made a genuinely failed search look identical to a
 * successful one. Instead this returns a tagged result so the caller can
 * show a clear, distinct error state - see `tracker-render.js`
 * `renderErrorState()`.
 */
async function inlineResolvePlayers(identifiers) {
  try {
    const res = await fetch(`${BACKEND_URL}/match/resolve-players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) {
          detail = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
        }
      } catch {
        // Response body wasn't JSON - keep the plain HTTP status detail.
      }
      throw new Error(detail);
    }
    return { ok: true, profiles: await res.json() };
  } catch (err) {
    console.warn("inlineResolvePlayers failed:", err);
    const isNetworkError = err instanceof TypeError;
    const detail = isNetworkError
      ? "Could not reach the backend. Is it running (npm run start:dev), and is the Control Panel's origin in CORS_ALLOWED_ORIGINS?"
      : err.message || String(err);
    return { ok: false, error: detail };
  }
}

// ---------------------------------------------------------------------------
// Inline roster "Add one player at a time" queue - mirrors app.js's
// overlay roster chips, see that file's comment block for the full
// rationale (previously the field only accepted all names pasted at
// once, comma-separated, in a single line).
// ---------------------------------------------------------------------------
const INLINE_MAX_ROSTER_SIZE = 10;
let inlineRosterQueue = [];

function renderInlineRosterChips() {
  els.inlineRosterChips.innerHTML = inlineRosterQueue
    .map(
      (identifier, index) => `
      <span class="roster-chip" data-chip-index="${index}">
        ${identifier}
        <button class="roster-chip-remove" data-remove-inline-chip-index="${index}" title="Remove">\u2715</button>
      </span>`,
    )
    .join("");

  els.inlineRosterChips.querySelectorAll("[data-remove-inline-chip-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.getAttribute("data-remove-inline-chip-index"), 10);
      inlineRosterQueue.splice(index, 1);
      renderInlineRosterChips();
    });
  });
}

function addToInlineRosterQueue() {
  const raw = els.inlineRosterInput.value.trim();
  if (!raw) return;

  const newEntries = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const entry of newEntries) {
    if (inlineRosterQueue.length >= INLINE_MAX_ROSTER_SIZE) break;
    if (!inlineRosterQueue.some((existing) => existing.toLowerCase() === entry.toLowerCase())) {
      inlineRosterQueue.push(entry);
    }
  }

  els.inlineRosterInput.value = "";
  renderInlineRosterChips();
  els.inlineRosterInput.focus();
}

els.inlineAddRosterEntryBtn.addEventListener("click", addToInlineRosterQueue);

els.inlineRosterInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addToInlineRosterQueue();
  }
});

async function runInlineRosterLookup() {
  if (inlineRosterQueue.length === 0) {
    // Explicit demo view (empty queue) - clearly labeled, never confused
    // with a real (failed or successful) lookup.
    inlineTracker.setProfiles(INLINE_MOCK_PROFILES, { isDemo: true });
    inlineTracker.render();
    return;
  }

  window.TrackerRenderer.renderLoadingState("inline-tracker-body-root", inlineRosterQueue.length);
  const result = await inlineResolvePlayers(inlineRosterQueue);
  if (result.ok) {
    inlineTracker.setProfiles(result.profiles, { isDemo: false });
    inlineTracker.render();
  } else {
    window.TrackerRenderer.renderErrorState("inline-tracker-body-root", result.error);
  }
}

els.inlineResolveBtn.addEventListener("click", runInlineRosterLookup);

els.inlineClearBtn.addEventListener("click", () => {
  els.inlineRosterInput.value = "";
  inlineRosterQueue = [];
  renderInlineRosterChips();
  inlineTracker.setProfiles([]);
  inlineTracker.render();
});

els.inlineCompactToggleBtn.addEventListener("click", () => {
  const isCompact = inlineTracker.toggleCompact();
  els.inlineCompactToggleBtn.textContent = isCompact ? "Full View" : "Compact View";
  els.inlineCompactToggleBtn.classList.toggle("active", isCompact);
  inlineTracker.render();
});

/**
 * Loads the live GSI roster into the inline tracker - shared by the
 * manual "Load Live Roster" button AND the automatic GSI polling logic
 * below (`pollGsiStatus()`), so a live match is picked up with NO
 * manual click required at all, while the button still works as an
 * explicit manual retry/refresh.
 *
 * `options.silent` (used only by the automatic path): suppresses the
 * button's own disabled/"Loading..." UI chrome AND the "no roster data
 * yet" error banner (GSI not sending `allplayers` on every single update
 * yet is completely normal seconds after a match starts - the automatic
 * path just quietly retries on the next poll tick 3s later instead of
 * flashing a scary error the user never asked for). A genuine fetch
 * failure still logs a console warning either way, but only shows a
 * visible error banner for an explicit (non-silent) manual click -
 * automatic background polling failures should never interrupt
 * whatever the user is currently looking at.
 *
 * Returns `true` if a real roster was loaded, `false` otherwise (so the
 * auto-poller knows whether to keep retrying on the next tick).
 */
async function loadLiveGsiRoster(options = {}) {
  const silent = Boolean(options.silent);
  const originalText = els.inlineGsiLoadRosterBtn.textContent;

  if (!silent) {
    els.inlineGsiLoadRosterBtn.disabled = true;
    els.inlineGsiLoadRosterBtn.textContent = "Loading...";
    window.TrackerRenderer.renderLoadingState("inline-tracker-body-root", 10);
  }

  try {
    const res = await fetch(`${BACKEND_URL}/gsi/roster`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.connected) {
      if (!silent) {
        window.TrackerRenderer.renderErrorState(
          "inline-tracker-body-root",
          "GSI isn't connected anymore - the CS2 match may have ended. Reconnect and try again.",
        );
      }
      return false;
    }
    if (!data.profiles || data.profiles.length === 0) {
      // Genuinely common right after a match is first detected - CS2's
      // GSI doesn't always send the full roster (`allplayers`) on every
      // update, especially in the first few seconds of a match.
      if (!silent) {
        window.TrackerRenderer.renderErrorState(
          "inline-tracker-body-root",
          "GSI is connected, but CS2 hasn't sent full roster data yet - this is normal right after a match starts. Wait a few seconds and click \u201cLoad Live Roster\u201d again.",
        );
      }
      return false;
    }

    inlineTracker.setProfiles(data.profiles, { isDemo: false });
    inlineTracker.render();
    return true;
  } catch (err) {
    console.warn("loadLiveGsiRoster failed:", err);
    if (!silent) {
      window.TrackerRenderer.renderErrorState(
        "inline-tracker-body-root",
        `Failed to load the live roster: ${err?.message || err}. Make sure the backend is running.`,
      );
    }
    return false;
  } finally {
    if (!silent) {
      els.inlineGsiLoadRosterBtn.disabled = false;
      els.inlineGsiLoadRosterBtn.textContent = originalText;
    }
  }
}

els.inlineGsiLoadRosterBtn.addEventListener("click", () => loadLiveGsiRoster({ silent: false }));

// ---------------------------------------------------------------------------
// "FACEIT Matchroom" - a THIRD way to feed the same tracker (alongside
// the live GSI roster and the manually-typed 10-player queue): paste a
// FACEIT matchroom link (or raw match ID) and both team rosters are
// pulled in automatically via the backend's POST /match/resolve-matchroom
// (official FACEIT Data API GET /matches/{match_id} - public match
// lineup data, no scraping). See PlayersService.resolveMatchroom().
// ---------------------------------------------------------------------------
async function loadFromMatchroom() {
  const input = els.matchroomInput.value.trim();
  if (!input) {
    els.matchroomStatus.textContent = "Paste a FACEIT matchroom link or match ID first.";
    els.matchroomStatus.classList.remove("saved");
    return;
  }

  els.matchroomLoadBtn.disabled = true;
  els.matchroomStatus.textContent = "";
  window.TrackerRenderer.renderLoadingState("inline-tracker-body-root", 10);

  try {
    const res = await fetch(`${BACKEND_URL}/match/resolve-matchroom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: input }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) {
          detail = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
        }
      } catch {
        // Response body wasn't JSON - keep the plain HTTP status detail.
      }
      throw new Error(detail);
    }

    const result = await res.json();
    // The tracker's setProfiles() always splits a flat array into
    // "Team A" = first 5 / "Team B" = next 5 by POSITION (see
    // tracker-render.js render()) - concatenating teamA then teamB here
    // reproduces the correct FACEIT faction assignment for the normal
    // 5v5 case. (Uneven team sizes - e.g. a forfeit/disconnect - are a
    // rare edge case not perfectly handled by this simple concatenation,
    // same documented limitation as elsewhere in this file.)
    const combined = [...result.teamA, ...result.teamB];
    inlineTracker.setProfiles(combined, { isDemo: false });
    inlineTracker.render();

    const label = result.competitionName ? ` (${result.competitionName})` : "";
    els.matchroomStatus.textContent = `Loaded ${combined.length} players from match ${result.matchId}${label} \u2713`;
    els.matchroomStatus.classList.add("saved");

    // Reveal the "Dodge or Play" quick-access badge now that a matchroom
    // has successfully loaded - see the click handler below for what it
    // does (jumps to the Dodge or Play tab and runs the same analysis
    // for this same matchroom link).
    els.dodgeOrPlayLink.style.display = "flex";
    els.dodgeOrPlayLink.dataset.matchroomUrl = input;
  } catch (err) {
    console.warn("loadFromMatchroom failed:", err);
    window.TrackerRenderer.renderErrorState("inline-tracker-body-root", err?.message || String(err));
    els.matchroomStatus.textContent = "";
  } finally {
    els.matchroomLoadBtn.disabled = false;
  }
}

els.matchroomLoadBtn.addEventListener("click", loadFromMatchroom);
els.matchroomInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    loadFromMatchroom();
  }
});

els.dodgeOrPlayLink.addEventListener("click", (e) => {
  e.preventDefault();
  const url = els.dodgeOrPlayLink.dataset.matchroomUrl || "";
  activateTab("tab-dodge-or-play");
  window.DodgeOrPlay?.runFromUrl(url);
});

// ---------------------------------------------------------------------------
// Form events
// ---------------------------------------------------------------------------
[
  els.bgMode,
  els.solidColor,
  els.gradientFrom,
  els.gradientTo,
  els.matrixColor,
  els.matrixSpeed,
  els.matrixDensity,
  els.galaxySpeed,
  els.cyberpunkSpeed,
  els.teamspiritSpeed,
  els.panelOpacity,
].forEach((el) => {
  el.addEventListener("input", () => {
    updateRowVisibility();
    updateRangeLabels();
    updatePreview();
    applyBackgroundToLauncher(currentFormValues());
  });
});

els.applyBtn.addEventListener("click", () => {
  const { saveSettings } = window.OverlaySettingsStore;
  const settings = currentFormValues();
  saveSettings(settings);
  applyBackgroundToLauncher(settings);
  els.saveStatus.textContent = "Applied \u2713";
  els.saveStatus.classList.add("saved");
  setTimeout(() => {
    els.saveStatus.textContent = "";
    els.saveStatus.classList.remove("saved");
  }, 2500);
});

els.resetBtn.addEventListener("click", () => {
  // Only reset the BACKGROUND-related fields this section owns (mode,
  // colors, matrix params, opacity, custom image) - NOT the entire
  // settings blob, which would otherwise also wipe unrelated settings
  // (Discord Alerts, Display/column preferences, etc.) since
  // saveSettings() persists whatever full object it's given.
  const { DEFAULT_SETTINGS, loadSettings, saveSettings } = window.OverlaySettingsStore;
  const resetValues = {
    ...loadSettings(),
    backgroundMode: DEFAULT_SETTINGS.backgroundMode,
    solidColor: DEFAULT_SETTINGS.solidColor,
    gradientFrom: DEFAULT_SETTINGS.gradientFrom,
    gradientTo: DEFAULT_SETTINGS.gradientTo,
    panelOpacity: DEFAULT_SETTINGS.panelOpacity,
    matrixColor: DEFAULT_SETTINGS.matrixColor,
    matrixSpeed: DEFAULT_SETTINGS.matrixSpeed,
    matrixDensity: DEFAULT_SETTINGS.matrixDensity,
    galaxySpeed: DEFAULT_SETTINGS.galaxySpeed,
    cyberpunkSpeed: DEFAULT_SETTINGS.cyberpunkSpeed,
    teamSpiritSpeed: DEFAULT_SETTINGS.teamSpiritSpeed,
    customBackgroundImage: DEFAULT_SETTINGS.customBackgroundImage,
  };
  populateForm(resetValues);
  updatePreview();
  applyBackgroundToLauncher(resetValues);
  saveSettings(resetValues);
});

// ---------------------------------------------------------------------------
// Confirm dialog - a small reusable modal used for destructive actions
// (e.g. removing a saved player), so a single misplaced click can't
// destroy data with no way back.
// ---------------------------------------------------------------------------
function showConfirmDialog(message) {
  return new Promise((resolve) => {
    els.confirmDialogMessage.textContent = message;
    els.confirmDialogOverlay.style.display = "flex";

    const cleanup = (result) => {
      els.confirmDialogOverlay.style.display = "none";
      els.confirmDialogConfirm.removeEventListener("click", onConfirm);
      els.confirmDialogCancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);

    els.confirmDialogConfirm.addEventListener("click", onConfirm);
    els.confirmDialogCancel.addEventListener("click", onCancel);
  });
}

// ---------------------------------------------------------------------------
// Setup Wizard - API key configuration, so the user never has to edit a
// `.env` file or open a terminal. Calls the backend's SettingsController.
// ---------------------------------------------------------------------------
async function loadSettingsStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/settings/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const status = await res.json();
    setStatusDot(els.faceitStatusDot, status.faceitConfigured);
    setStatusDot(els.steamStatusDot, status.steamConfigured);
    // NOTE: "configured" here only means both the Leetify key AND base
    // URL are saved on the backend - it does NOT mean Leetify stats will
    // actually load, since there is no official public Leetify API (see
    // the hint text under this field, and LeetifyClient's doc comment).
    setStatusDot(els.leetifyStatusDot, status.leetifyConfigured);
  } catch (err) {
    console.warn("loadSettingsStatus failed (backend unreachable?):", err);
    setStatusDot(els.faceitStatusDot, false);
    setStatusDot(els.steamStatusDot, false);
    setStatusDot(els.leetifyStatusDot, false);
  }
}

// Exposed so onboarding.js (loaded before this file - see launcher.html)
// can refresh the Setup & GSI tab's status dots right after the
// first-launch wizard saves the FACEIT/Steam keys, without needing any
// direct coupling between the two files.
window.refreshSettingsStatusDots = loadSettingsStatus;

function setStatusDot(el, configured) {
  if (!el) return;
  el.classList.toggle("dot-ok", Boolean(configured));
  el.classList.toggle("dot-missing", !configured);
  el.title = configured ? "Configured" : "Not configured";
}

els.saveApiKeysBtn.addEventListener("click", async () => {
  const payload = {
    faceitApiKey: els.faceitApiKey.value.trim() || undefined,
    steamApiKey: els.steamApiKey.value.trim() || undefined,
    leetifyApiKey: els.leetifyApiKey.value.trim() || undefined,
  };
  els.saveApiKeysBtn.disabled = true;
  try {
    const res = await fetch(`${BACKEND_URL}/settings/api-keys`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const status = await res.json();
    setStatusDot(els.faceitStatusDot, status.faceitConfigured);
    setStatusDot(els.steamStatusDot, status.steamConfigured);
    setStatusDot(els.leetifyStatusDot, status.leetifyConfigured);
    els.apiKeysSaveStatus.textContent = "Saved \u2713";
    els.apiKeysSaveStatus.classList.add("saved");
    // Clear the password fields after a successful save - the dot
    // indicators show configured state without needing to redisplay keys.
    els.faceitApiKey.value = "";
    els.steamApiKey.value = "";
    els.leetifyApiKey.value = "";
  } catch (err) {
    console.warn("saveApiKeys failed:", err);
    els.apiKeysSaveStatus.textContent = "Failed to save (backend unreachable?)";
    els.apiKeysSaveStatus.classList.remove("saved");
  } finally {
    els.saveApiKeysBtn.disabled = false;
    setTimeout(() => {
      els.apiKeysSaveStatus.textContent = "";
      els.apiKeysSaveStatus.classList.remove("saved");
    }, 2500);
  }
});

// ---------------------------------------------------------------------------
// Live Match Data (GSI) - status polling + config file download.
// ---------------------------------------------------------------------------
// Tracks GSI connection state ACROSS poll ticks (see pollGsiStatus()
// below) so a live match's roster is loaded AUTOMATICALLY the moment
// GSI detects it - no manual "Load Live Roster" click required. Reset
// whenever GSI disconnects, so the NEXT match (even if it's the same
// map again) gets its own fresh auto-load attempt rather than being
// mistaken for the same still-ongoing match.
let gsiAutoLoadedForCurrentMatch = false;

async function pollGsiStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/gsi/state`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const state = await res.json();
    if (state.connected) {
      els.gsiStatusDot.classList.add("dot-ok");
      els.gsiStatusDot.classList.remove("dot-missing");
      const mapName = state.map?.name || "unknown map";
      els.gsiStatusLabel.textContent = `Connected - ${mapName}`;

      // "Current Match" section (Overview tab) - mirrors the same
      // connected/waiting state, plus reveals the "Load Live Roster"
      // shortcut now that a live match was actually detected.
      els.liveMatchStatusDot.classList.add("dot-ok");
      els.liveMatchStatusDot.classList.remove("dot-missing");
      els.liveMatchStatusLabel.textContent = `Match found - ${mapName}`;
      els.inlineGsiBanner.style.display = "flex";

      // Automatic roster load - silent (no error banner spam) so it can
      // safely retry on every 3s poll tick until CS2 actually sends the
      // full `allplayers` roster block; stops retrying once it succeeds
      // for this match (see the reset below when GSI disconnects).
      if (!gsiAutoLoadedForCurrentMatch) {
        const loaded = await loadLiveGsiRoster({ silent: true });
        if (loaded) gsiAutoLoadedForCurrentMatch = true;
      }
    } else {
      els.gsiStatusDot.classList.remove("dot-ok");
      els.gsiStatusDot.classList.add("dot-missing");
      els.gsiStatusLabel.textContent = "Not connected";

      els.liveMatchStatusDot.classList.remove("dot-ok");
      els.liveMatchStatusDot.classList.add("dot-missing");
      els.liveMatchStatusLabel.textContent = "Waiting for match...";
      els.inlineGsiBanner.style.display = "none";
      // Reset so the NEXT match GSI detects gets its own automatic
      // load attempt, instead of being silently skipped forever because
      // a PREVIOUS match already satisfied the "already loaded" flag.
      gsiAutoLoadedForCurrentMatch = false;
    }
  } catch (err) {
    els.gsiStatusDot.classList.remove("dot-ok");
    els.gsiStatusDot.classList.add("dot-missing");
    els.gsiStatusLabel.textContent = "Not connected (backend unreachable)";

    els.liveMatchStatusDot.classList.remove("dot-ok");
    els.liveMatchStatusDot.classList.add("dot-missing");
    els.liveMatchStatusLabel.textContent = "Waiting for match... (backend unreachable)";
    els.inlineGsiBanner.style.display = "none";
    gsiAutoLoadedForCurrentMatch = false;
  }
}

/**
 * Downloads/saves the GSI config file.
 *
 * IMPORTANT: a plain `window.open(url)` does NOT reliably trigger a real
 * file-save flow inside a Tauri webview (unlike in a normal browser tab)
 * - at best it silently does nothing, which is exactly the "I click it
 * and nothing downloads" symptom. The correct fix: fetch the config
 * file's TEXT content via a normal same-origin `fetch()` (this part
 * always worked fine), then hand that text to the Rust
 * `save_gsi_config_file` command (see src-tauri/src/main.rs), which
 * shows a native "Save As" dialog and writes the file once the user
 * picks a location. Falls back to the old `window.open()` behavior when
 * not running inside the desktop app (e.g. previewing launcher.html in a
 * plain browser during development), where it works fine.
 */
els.downloadGsiConfigBtn.addEventListener("click", async () => {
  const invokeFn = window.__TAURI__?.core?.invoke;
  if (!invokeFn) {
    window.open(`${BACKEND_URL}/gsi/config-file`, "_blank");
    return;
  }

  const originalText = els.downloadGsiConfigBtn.textContent;
  els.downloadGsiConfigBtn.disabled = true;
  els.downloadGsiConfigBtn.textContent = "Preparing...";
  try {
    const res = await fetch(`${BACKEND_URL}/gsi/config-file`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contents = await res.text();

    const savedPath = await invokeFn("save_gsi_config_file", { contents });
    if (savedPath) {
      els.gsiStatusLabel.textContent = `Not connected (saved config to ${savedPath} - copy it into your CS2 game/csgo/cfg/ folder if it isn't there already, then restart CS2)`;
    }
  } catch (err) {
    console.warn("Failed to save the GSI config file:", err);
    alert(
      `Failed to save the GSI config file: ${err?.message || err}. Make sure the backend is running (see the "backend unreachable" indicator).`,
    );
  } finally {
    els.downloadGsiConfigBtn.disabled = false;
    els.downloadGsiConfigBtn.textContent = originalText;
  }
});

// ---------------------------------------------------------------------------
// Saved players - list loading, card rendering, note/refresh/remove
// handling, plus search/sort. This section shows the players that were
// clicked on by name on the overlay.
// ---------------------------------------------------------------------------
function formatSavedAt(iso) {
  if (!iso) return "N/A";
  try {
    return new Date(iso).toLocaleString("en-US");
  } catch (err) {
    return iso;
  }
}

function renderRecentResultsBadges(results) {
  if (!results || results.length === 0) {
    return '<span class="recent-badge na">?</span>';
  }
  return results
    .map(
      (r) => `<span class="recent-badge ${r === "W" ? "win" : "loss"}">${r}</span>`,
    )
    .join("");
}

function renderSavedPlayerCard(entry) {
  const profile = entry.profile || {};
  const name = profile.nickname || profile.faceit?.nickname || entry.identifier;
  const level = profile.faceit?.level;
  const elo = profile.faceit?.elo;
  const kd = profile.stats?.kd;
  const winRate = profile.stats?.winRate;
  const avatarUrl = profile.avatarUrl;
  const initials = (name || "?").slice(0, 2).toUpperCase();

  return `
    <div class="saved-player-item" data-identifier="${entry.identifier}">
      <div class="saved-player-card">
        <div class="hero-row">
          <div>
            <div class="hero-name-row">
              <h3 class="hero-name">${name}</h3>
            </div>
            <div class="badges">
              <span class="badge lvl">Lvl ${level ?? "?"}</span>
              <span class="badge elo">ELO ${elo ?? "N/A"}</span>
            </div>
          </div>
          <div class="avatar-wrap">
            <div class="avatar-ring"></div>
            ${
              avatarUrl
                ? `<img class="saved-player-avatar" src="${avatarUrl}" alt="" />`
                : `<div class="saved-player-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--text-secondary);">${initials}</div>`
            }
          </div>
        </div>
        <div class="saved-player-stats stat-grid">
          <div class="tile blue"><span class="lbl">K/D</span><span class="val">${kd != null ? kd.toFixed(2) : "N/A"}</span></div>
          <div class="tile green"><span class="lbl">Win Rate</span><span class="val">${winRate != null ? winRate + "%" : "N/A"}</span></div>
          <div class="tile gold recent-tile">
            <span class="lbl">Recent Results</span>
            <div class="recent-badges">${renderRecentResultsBadges(profile.recentResults)}</div>
          </div>
        </div>
      </div>
      <div class="saved-player-note">
        <textarea
          data-note-id="${entry.identifier}"
          placeholder="Note about this player..."
        >${entry.note || ""}</textarea>
        <div class="note-status" data-note-status="${entry.identifier}"></div>
      </div>
      <div class="saved-player-actions">
        <button class="primary-btn refresh-btn" data-refresh-id="${entry.identifier}">Refresh</button>
        <button class="secondary-btn danger-btn remove-btn" data-remove-id="${entry.identifier}">Delete</button>
      </div>
      <div class="saved-player-meta">Saved: ${formatSavedAt(entry.savedAt)}</div>
    </div>
  `;
}

function renderSavedPlayers(entries) {
  if (!entries || entries.length === 0) {
    els.savedPlayersList.innerHTML =
      '<div class="empty-state">No saved players yet. Click a name on the overlay.</div>';
    return;
  }
  els.savedPlayersList.innerHTML = entries.map(renderSavedPlayerCard).join("");
  attachSavedPlayerHandlers();
}

function attachSavedPlayerHandlers() {
  document.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-remove-id");
      const confirmed = await showConfirmDialog(
        "Are you sure you want to delete this saved player? This also deletes their note. This cannot be undone.",
      );
      if (!confirmed) return;
      btn.disabled = true;
      await window.SavedPlayersClient.removeSavedPlayer(id);
      await loadSavedPlayers();
    });
  });

  document.querySelectorAll(".refresh-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-refresh-id");
      btn.disabled = true;
      btn.textContent = "Refreshing...";
      await window.SavedPlayersClient.refreshSavedPlayer(id);
      await loadSavedPlayers();
    });
  });

  document.querySelectorAll("textarea[data-note-id]").forEach((textarea) => {
    let timer = null;
    textarea.addEventListener("input", () => {
      const id = textarea.getAttribute("data-note-id");
      const statusEl = document.querySelector(`[data-note-status="${id}"]`);
      if (statusEl) statusEl.textContent = "saving...";
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await window.SavedPlayersClient.setSavedPlayerNote(id, textarea.value);
        if (statusEl) {
          statusEl.textContent = "saved \u2713";
          statusEl.classList.add("saved");
        }
      }, 600);
    });
  });
}

async function loadSavedPlayers() {
  const search = els.savedPlayersSearch.value.trim();
  const sortBy = els.savedPlayersSortBy.value;
  const sortDir = savedPlayersSortDir;

  if (!window.SavedPlayersClient) {
    renderSavedPlayers(MOCK_SAVED_PLAYERS);
    return;
  }
  const list = await window.SavedPlayersClient.listSavedPlayers({ search, sortBy, sortDir });
  // null -> backend unreachable, fall back to demo data; [] -> genuinely empty list
  renderSavedPlayers(list === null ? MOCK_SAVED_PLAYERS : list);
}

let savedPlayersSearchTimer = null;
els.savedPlayersSearch.addEventListener("input", () => {
  clearTimeout(savedPlayersSearchTimer);
  savedPlayersSearchTimer = setTimeout(loadSavedPlayers, 300);
});
els.savedPlayersSortBy.addEventListener("change", loadSavedPlayers);
els.savedPlayersSortDirBtn.addEventListener("click", () => {
  savedPlayersSortDir = savedPlayersSortDir === "asc" ? "desc" : "asc";
  els.savedPlayersSortDirBtn.textContent = savedPlayersSortDir === "asc" ? "\u2191" : "\u2193";
  loadSavedPlayers();
});

// ---------------------------------------------------------------------------
// Tab navigation - splits the Control Panel into Overview / Appearance /
// Setup & GSI / Saved Players tabs instead of one long scrolling page.
// ---------------------------------------------------------------------------
function activateTab(targetId) {
  els.navTabs.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab-target") === targetId);
  });
  els.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
  // Refresh "My Match History" whenever the Player Summary tab becomes
  // active, so new matches recorded while another tab was open show up
  // without needing a manual "Refresh" click.
  if (targetId === "tab-player-summary") {
    loadMatchHistory();
    loadSessionReport();
  }
  // Refresh the Discord Alerts status whenever the Setup & GSI tab
  // becomes active, so the "configured"/enabled state stays accurate.
  if (targetId === "tab-setup") {
    loadDiscordSettings();
    loadTrackedPlayers();
  }
}
// Exposed explicitly so account.js's header avatar button can switch to
// the "Account" tab (which deliberately has no nav-tab button of its
// own - see launcher.html) without duplicating this tab/panel-toggling
// logic in a second file.
window.activateTab = activateTab;

els.navTabs.forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.getAttribute("data-tab-target")));
});

// ---------------------------------------------------------------------------
// Display settings (Appearance tab) - which stat columns show on the
// tracker table, the default view (full/compact) on startup, and whether
// the team-vs-team comparison bar shows. Persisted through the same
// settings store as the background customization, so it also reaches the
// overlay window live via the Tauri event bus (see settings-store.js).
// ---------------------------------------------------------------------------
function populateDisplayForm(settings) {
  const visible = new Set(settings.visibleColumns || []);
  els.columnPicker.querySelectorAll("input[type='checkbox']").forEach((cb) => {
    cb.checked = visible.has(cb.value);
    // Mirrors the CSS `:has()` selector (styles.css .column-chip:has(input:checked))
    // with a JS fallback class, since older WebKitGTK builds on Linux may
    // not support `:has()` yet.
    cb.closest(".column-chip")?.classList.toggle("checked", cb.checked);
  });
  els.defaultViewSelect.value = settings.defaultCompactView ? "compact" : "full";
  els.teamComparisonToggle.checked = settings.showTeamComparison !== false;
  els.winProbabilityToggle.checked = settings.showWinProbability !== false;
}

function collectVisibleColumns() {
  return Array.from(els.columnPicker.querySelectorAll("input[type='checkbox']:checked")).map(
    (cb) => cb.value,
  );
}

function saveDisplaySettings() {
  const { loadSettings, saveSettings } = window.OverlaySettingsStore;
  saveSettings({
    ...loadSettings(),
    visibleColumns: collectVisibleColumns(),
    defaultCompactView: els.defaultViewSelect.value === "compact",
    showTeamComparison: els.teamComparisonToggle.checked,
    showWinProbability: els.winProbabilityToggle.checked,
  });
  // Re-render immediately so the tracker reflects the change without
  // needing to re-run a lookup.
  inlineTracker.render();
  els.displaySaveStatus.textContent = "Saved \u2713";
  els.displaySaveStatus.classList.add("saved");
  setTimeout(() => {
    els.displaySaveStatus.textContent = "";
    els.displaySaveStatus.classList.remove("saved");
  }, 2000);
}

els.columnPicker.querySelectorAll("input[type='checkbox']").forEach((cb) => {
  cb.addEventListener("change", () => {
    cb.closest(".column-chip")?.classList.toggle("checked", cb.checked);
    saveDisplaySettings();
  });
});
els.defaultViewSelect.addEventListener("change", saveDisplaySettings);
els.teamComparisonToggle.addEventListener("change", saveDisplaySettings);
els.winProbabilityToggle.addEventListener("change", saveDisplaySettings);

// ---------------------------------------------------------------------------
// On startup: load existing settings into the form + preview, load the
// saved players list, load the API key configuration status, and start
// polling the GSI connection status. Also subscribes to the live
// "player saved" event so a save from the tracker shows up here
// instantly, with no restart/manual refresh needed.
// ---------------------------------------------------------------------------
/**
 * Hides the full-window "Starting CS Tracker..." overlay shown while the
 * Control Panel performs its initial settings/backend checks - see the
 * CSS transition on #startup-loading-overlay for the fade-out. A tiny
 * minimum display time avoids an unpleasant "flash" if everything
 * happens to resolve near-instantly.
 */
function hideStartupLoadingOverlay() {
  const overlay = document.getElementById("startup-loading-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  setTimeout(() => overlay.remove(), 300);
}

(async function init() {
  const startedAt = Date.now();
  const { loadSettings, saveSettings } = window.OverlaySettingsStore;
  const settings = loadSettings();
  populateForm(settings);
  populateDisplayForm(settings);
  updatePreview();
  applyBackgroundToLauncher(settings);
  setUiTheme(settings.uiTheme);

  inlineTracker.setCompact(Boolean(settings.defaultCompactView));
  els.inlineCompactToggleBtn.textContent = inlineTracker.isCompact() ? "Full View" : "Compact View";
  els.inlineCompactToggleBtn.classList.toggle("active", inlineTracker.isCompact());

  els.quitOnCloseToggle.checked = Boolean(settings.quitOnClose);

  // Re-broadcast the persisted settings once on startup. This is the only
  // way the Rust side (main.rs) learns the persisted "Fully quit on
  // close" value after an app restart, since Rust has no direct access
  // to the webview's localStorage.
  saveSettings(settings);

  loadSavedPlayers();
  loadSettingsStatus();
  loadMatchHistory();
  loadDiscordSettings();
  loadTrackedPlayers();
  pollGsiStatus();
  pollCurrentMatchType();
  setInterval(pollGsiStatus, 3000);
  setInterval(pollCurrentMatchType, 5000);

  if (window.SavedPlayersClient) {
    window.SavedPlayersClient.onPlayerSaved(() => {
      loadSavedPlayers();
    });
  }

  // First-launch Onboarding Wizard gate (see onboarding.js/onboarding.html):
  // the wizard overlay is visible by default and sits on top of both the
  // startup-loading overlay and the rest of the Control Panel, so it is
  // never possible to reach/interact with the full app before both the
  // FACEIT and Steam API keys are configured. checkAndShow() resolves
  // immediately if they already are (hiding the wizard right away, same
  // as before this feature existed) - otherwise it only resolves once the
  // user completes the wizard.
  await window.OnboardingWizard?.checkAndShow?.();

  // Keep the loading overlay visible for at least 400ms total, so it
  // never just flickers on/off on a fast/local connection. If the
  // onboarding wizard was shown, this has no visible effect (the wizard
  // itself already covered the startup overlay this whole time) - it
  // just makes sure the startup overlay is definitely removed by now.
  const elapsed = Date.now() - startedAt;
  setTimeout(hideStartupLoadingOverlay, Math.max(0, 400 - elapsed));
})();
