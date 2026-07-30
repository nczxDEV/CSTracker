// Shared overlay settings store.
// The launcher and overlay windows load from the same origin (Tauri asset
// protocol), so localStorage is shared between both windows - we use that
// for persistence. For live sync (instant updates - the localStorage
// "storage" event doesn't fire within the same window), we use Tauri's
// global event system (window.__TAURI__.event).

const SETTINGS_KEY = "cs2-overlay-settings";
const SETTINGS_EVENT = "cs2-overlay-settings-updated";

const DEFAULT_SETTINGS = {
  backgroundMode: "default", // 'default' | 'solid' | 'gradient' | 'matrix' | 'galaxy-live' | 'cyberpunk' | 'teamspirit' | 'custom'
  solidColor: "#0a0d12",
  gradientFrom: "#0a0d12",
  gradientTo: "#12161d",
  panelOpacity: 0.92,
  matrixColor: "#22c55e",
  matrixSpeed: 1,
  matrixDensity: 1,
  // 'galaxy-live' backgroundMode - animated Milky Way canvas effect (see
  // galaxy-bg.js GalaxyBackground) - drift/twinkle speed multiplier,
  // same "Speed" slider pattern as the Matrix rain effect above.
  galaxySpeed: 1,
  // 'cyberpunk' backgroundMode - animated synthwave skyline canvas effect
  // (see cyberpunk-bg.js CyberpunkBackground) - overall animation speed
  // multiplier (grid scroll / particle drift), same "Speed" slider
  // pattern as the other animated background effects above.
  cyberpunkSpeed: 1,
  // 'teamspirit' backgroundMode - animated mono-tactical radar canvas
  // effect with the Team Spirit logo centered (see teamspirit-bg.js
  // TeamSpiritBackground) - radar sweep/drift speed multiplier.
  teamSpiritSpeed: 1,
  // UI Theme - purely cosmetic "chrome" swap for cards/nav/buttons
  // (Tactical HUD's bracket-corner cards + scanline header vs. Tactical
  // Glass's blurred glassmorphism cards + pill nav), INDEPENDENT of
  // backgroundMode above (which controls the app window's background
  // fill/effect, not its card/component styling). See theme-glass.css -
  // applied by toggling a `theme-glass` class on <body> (see launcher.js
  // `applyUiTheme`); 'hud' needs no extra class since it's the default
  // look already baked into styles.css/launcher.css.
  uiTheme: "hud", // 'hud' | 'glass'
  // 'custom' backgroundMode - a user-uploaded image, stored as a data URL
  // (see launcher.js `handleCustomBackgroundFile` - downscaled client-side
  // before storing, to keep localStorage usage reasonable). `null` until
  // the user picks a file in the Appearance tab's "Custom Image" option.
  customBackgroundImage: null,
  // Stored in the Rust-parseable "Modifier+...+KeyboardEventCode" format
  // (e.g. "Alt+Shift+KeyS") - see src-tauri/src/main.rs `key_to_code` /
  // `parse_modifiers_and_code`. This is exactly the format the real
  // hotkey-capture UI (launcher.js `comboFromEvent`) produces from a
  // KeyboardEvent, so no translation table is needed on either side. Use
  // `hotkeyLabel()` below to get a human-readable display string.
  hotkey: "Alt+Shift+KeyS",
  clickThroughHotkey: "Alt+Shift+KeyX",
  // ---------------------------------------------------------------------
  // Display / stats settings - which stat columns show on the tracker
  // table, whether the compact "pill" view is the default on startup, and
  // whether the team-vs-team comparison bar is shown. Exposed in the
  // Control Panel's "Display" section (see launcher.html/launcher.js) and
  // consumed live by tracker-render.js on every render() call.
  // ---------------------------------------------------------------------
  visibleColumns: ["rank", "level", "matches", "kd", "kr", "wr", "csrating", "leetify", "hs"],
  defaultCompactView: false,
  showTeamComparison: true,
  // "Team Strength" prediction - a rough heuristic estimate (NOT a
  // guarantee) of each team's relative win chance, based on average
  // ELO/K-D/win rate. See tracker-render.js `computeWinProbability`.
  showWinProbability: true,
  // FACEIT Mode: when enabled, the always-on-top overlay window is never
  // shown (neither via hotkey nor the Control Panel button) - the tracker
  // is instead displayed inline inside the Control Panel window. This is
  // a precaution against anti-cheat systems (e.g. FACEIT AC) potentially
  // flagging always-on-top transparent overlay windows, since technique-
  // wise they resemble how some ESP/wallhack cheats render. See
  // launcher.js and src-tauri/src/main.rs for the enforcement (both the
  // JS and the native Rust side refuse to show the overlay window while
  // this is enabled).
  faceitMode: false,
  // "Fully quit on close" - see src-tauri/src/main.rs QuitOnCloseState
  // doc comment. `false` (default): closing the Control Panel window
  // minimizes it to the system tray (the backend sidecar keeps running
  // in the background - the app is still reachable via the tray icon).
  // `true`: closing the window fully quits the app (terminates the
  // sidecar, exits the process) - same as the tray menu's/Control
  // Panel's "Quit Completely" action.
  quitOnClose: false,
};

/**
 * Migrates settings values from removed/renamed options so existing
 * users never end up with a broken/blank background after an update.
 * Currently: the static "galaxy" (built-in image) backgroundMode option
 * was removed from the Appearance tab (superseded by the animated
 * "galaxy-live" Milky Way effect) - any previously-persisted "galaxy"
 * value is transparently remapped to "galaxy-live" on load.
 */
function migrateSettings(settings) {
  if (settings.backgroundMode === "galaxy") {
    return { ...settings, backgroundMode: "galaxy-live" };
  }
  return settings;
}

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return migrateSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch (err) {
    console.warn("loadSettings failed, using defaults:", err);
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));

  // Live notification to other (e.g. overlay) windows through the Tauri
  // event bus. If the preview is running outside Tauri (a plain browser),
  // the __TAURI__ object is missing - in that case we silently skip this.
  if (window.__TAURI__?.event?.emit) {
    window.__TAURI__.event.emit(SETTINGS_EVENT, merged).catch((err) => {
      console.warn("settings emit failed:", err);
    });
  }
  return merged;
}

/**
 * Subscribes to live settings updates. `callback(settings)` is called
 * every time the launcher saves a new setting.
 * Returns the "unlisten" function (if the Tauri event API is available).
 */
function onSettingsUpdated(callback) {
  if (!window.__TAURI__?.event?.listen) {
    return () => {};
  }
  let unlistenFn = () => {};
  window.__TAURI__.event
    .listen(SETTINGS_EVENT, (event) => callback(event.payload))
    .then((unlisten) => {
      unlistenFn = unlisten;
    })
    .catch((err) => console.warn("settings listen failed:", err));
  return () => unlistenFn();
}

/**
 * Applies the background style to the given DOM elements.
 * @param {object} settings
 * @param {HTMLElement} appEl - the main #app container (panel background/opacity)
 * @param {HTMLCanvasElement} canvasEl - the shared animated-background canvas (matrix / galaxy / cyberpunk / team spirit - only one mode is ever active at a time)
 * @param {object} effects - the animated-effect instances for this window, all optional:
 *   @param {MatrixRain} [effects.matrix] - matrix-bg.js MatrixRain instance
 *   @param {GalaxyBackground} [effects.galaxy] - galaxy-bg.js GalaxyBackground instance (animated "galaxy-live" mode)
 *   @param {CyberpunkBackground} [effects.cyberpunk] - cyberpunk-bg.js CyberpunkBackground instance
 *   @param {TeamSpiritBackground} [effects.teamSpirit] - teamspirit-bg.js TeamSpiritBackground instance
 */
function applyBackground(settings, appEl, canvasEl, effects = {}) {
  const opacity = settings.panelOpacity ?? DEFAULT_SETTINGS.panelOpacity;
  const { matrix: matrixInstance, galaxy: galaxyInstance, cyberpunk: cyberpunkInstance, teamSpirit: teamSpiritInstance } = effects;

  if (matrixInstance) matrixInstance.stop();
  if (galaxyInstance) galaxyInstance.stop();
  if (cyberpunkInstance) cyberpunkInstance.stop();
  if (teamSpiritInstance) teamSpiritInstance.stop();
  if (canvasEl) canvasEl.style.display = "none";

  // Reset any image-mode styling first - each case below sets only what
  // it needs, so a leftover backgroundImage from a previous mode can
  // never bleed through (e.g. switching from "custom" to "solid").
  appEl.style.backgroundImage = "";
  appEl.style.backgroundSize = "";
  appEl.style.backgroundPosition = "";
  appEl.style.backgroundRepeat = "";

  switch (settings.backgroundMode) {
    case "solid": {
      appEl.style.background = hexToRgba(settings.solidColor, opacity);
      appEl.style.backdropFilter = "none";
      break;
    }
    case "gradient": {
      appEl.style.background = `linear-gradient(160deg, ${hexToRgba(
        settings.gradientFrom,
        opacity,
      )}, ${hexToRgba(settings.gradientTo, opacity)})`;
      appEl.style.backdropFilter = "none";
      break;
    }
    case "matrix": {
      if (canvasEl) {
        canvasEl.style.display = "block";
        if (matrixInstance) {
          matrixInstance.start({
            color: settings.matrixColor,
            speed: settings.matrixSpeed,
            density: settings.matrixDensity,
          });
        }
      }
      appEl.style.background = hexToRgba("#0a0d12", opacity);
      appEl.style.backdropFilter = "blur(2px)";
      break;
    }
    case "galaxy-live": {
      // Animated Milky Way canvas effect (see galaxy-bg.js) - parallax
      // twinkling stars, drifting nebula glows, occasional shooting stars.
      if (canvasEl) {
        canvasEl.style.display = "block";
        if (galaxyInstance) {
          galaxyInstance.start({ speed: settings.galaxySpeed });
        }
      }
      appEl.style.background = hexToRgba("#05060a", opacity);
      appEl.style.backdropFilter = "blur(1px)";
      break;
    }
    case "cyberpunk": {
      // Animated synthwave skyline canvas effect (see cyberpunk-bg.js).
      if (canvasEl) {
        canvasEl.style.display = "block";
        if (cyberpunkInstance) {
          cyberpunkInstance.start({ speed: settings.cyberpunkSpeed });
        }
      }
      appEl.style.background = hexToRgba("#05010a", opacity);
      appEl.style.backdropFilter = "blur(1px)";
      break;
    }
    case "teamspirit": {
      // Animated mono-tactical radar canvas effect with the Team Spirit
      // logo centered (see teamspirit-bg.js).
      if (canvasEl) {
        canvasEl.style.display = "block";
        if (teamSpiritInstance) {
          teamSpiritInstance.start({ speed: settings.teamSpiritSpeed });
        }
      }
      appEl.style.background = hexToRgba("#050505", opacity);
      appEl.style.backdropFilter = "blur(1px)";
      break;
    }
    case "custom": {
      if (settings.customBackgroundImage) {
        applyImageBackground(appEl, settings.customBackgroundImage, opacity);
      } else {
        // No image uploaded yet - fall back to the default theme rather
        // than showing a blank/broken background.
        console.warn('backgroundMode is "custom" but no customBackgroundImage is set - falling back to default.');
        appEl.style.background = "";
        appEl.style.backdropFilter = "";
      }
      break;
    }
    default: {
      // 'default': the original dark theme (styles.css --bg-app variable).
      // Also the graceful fallback for the removed static "galaxy" image
      // mode in the unlikely case migrateSettings() didn't already remap
      // it (see loadSettings()).
      appEl.style.background = "";
      appEl.style.backdropFilter = "";
    }
  }
}

/**
 * Applies the "UI Theme" setting (Tactical HUD vs. Tactical Glass) by
 * toggling a `theme-glass` class on <body> - see theme-glass.css for the
 * actual overrides (this is deliberately just a class toggle, no other
 * logic, so it can be called both on load and instantly on change).
 * INDEPENDENT of `applyBackground()` above - see DEFAULT_SETTINGS.uiTheme
 * doc comment for why these two are kept separate.
 */
function applyUiTheme(uiTheme) {
  document.body.classList.toggle("theme-glass", uiTheme === "glass");
}

/**
 * Applies an image (URL or data: URL) as a cover-fit background, with a
 * dark overlay for text readability. Reuses `panelOpacity` as the
 * overlay's darkness (higher = darker overlay = more readable text, less
 * visible image) - same slider, same semantics as the solid/gradient
 * modes, just applied as an overlay instead of a solid fill.
 */
function applyImageBackground(appEl, imageUrl, opacity) {
  const overlay = hexToRgba("#0a0d12", opacity);
  // IMPORTANT (bug fix - this was the actual cause of "Custom image
  // doesn't work"): the `background` shorthand property, even when set
  // to an EMPTY string, resets every one of its longhand sub-properties
  // (background-image/-size/-position/-repeat/etc.) to their initial
  // (unset) value - this is documented CSSOM/shorthand behavior, not a
  // browser bug. The previous version set `backgroundImage` etc. FIRST
  // and then `background = ""` AFTER, which immediately wiped out the
  // very `backgroundImage` (and size/position/repeat) it had just set,
  // one JS statement earlier - so the custom image was silently cleared
  // the instant this function ran, every time. Clearing the shorthand
  // must happen FIRST (or not at all), never after setting the
  // longhands - see also `applyBackground()` above, which already
  // resets `backgroundImage`/`backgroundSize`/`backgroundPosition`/
  // `backgroundRepeat` individually (not via the shorthand) at the top
  // of every call, so clearing `background` here again is redundant
  // anyway.
  appEl.style.backgroundImage = `linear-gradient(${overlay}, ${overlay}), url('${imageUrl}')`;
  appEl.style.backgroundSize = "cover";
  appEl.style.backgroundPosition = "center";
  appEl.style.backgroundRepeat = "no-repeat";
  appEl.style.backdropFilter = "none";
}

/**
 * Converts a stored combo string (e.g. "Alt+Shift+KeyS") into a
 * human-readable label (e.g. "Alt+Shift+S") for display in the overlay
 * header badge and the Control Panel's hotkey buttons. Strips the
 * "Key"/"Digit" prefixes that `KeyboardEvent.code` uses but that would
 * otherwise look redundant to a user ("KeyS" -> "S", "Digit5" -> "5").
 */
function hotkeyLabel(combo) {
  if (!combo || typeof combo !== "string") return "";
  return combo
    .split("+")
    .map((token) => token.replace(/^Key/, "").replace(/^Digit/, ""))
    .join("+");
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

window.OverlaySettingsStore = {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  onSettingsUpdated,
  applyBackground,
  applyUiTheme,
  hexToRgba,
  hotkeyLabel,
};
