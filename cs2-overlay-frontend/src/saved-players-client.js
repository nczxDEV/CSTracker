// "Saved players" client - shared between the overlay and the launcher.
// The overlay ONLY ever uses savePlayer() (when clicking a player's name).
// Listing, note-taking, deleting, and refreshing exclusively happen in
// launcher.js (Control Panel / main app) - NOT on the overlay.

const SAVED_PLAYERS_BACKEND_URL = "http://localhost:3000";
const PLAYER_SAVED_EVENT = "cs2-overlay-player-saved";

async function savePlayer(identifier) {
  try {
    const res = await fetch(
      `${SAVED_PLAYERS_BACKEND_URL}/saved-players/${encodeURIComponent(identifier)}`,
      { method: "POST" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entry = await res.json();

    if (window.__TAURI__?.event?.emit) {
      window.__TAURI__.event
        .emit(PLAYER_SAVED_EVENT, { identifier })
        .catch((err) => console.warn("player-saved emit failed:", err));
    }
    return entry;
  } catch (err) {
    console.warn("savePlayer failed:", err);
    return null;
  }
}

/**
 * @param options.search - filter by name (case-insensitive, partial match)
 * @param options.sortBy - 'savedAt' | 'elo' | 'kd' | 'name'
 * @param options.sortDir - 'asc' | 'desc'
 */
async function listSavedPlayers(options) {
  try {
    const params = new URLSearchParams();
    if (options?.search) params.set("search", options.search);
    if (options?.sortBy) params.set("sortBy", options.sortBy);
    if (options?.sortDir) params.set("sortDir", options.sortDir);
    const query = params.toString();
    const url = `${SAVED_PLAYERS_BACKEND_URL}/saved-players${query ? `?${query}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("listSavedPlayers failed:", err);
    return null; // null tells the launcher to fall back to demo/mock data
  }
}

async function removeSavedPlayer(identifier) {
  try {
    await fetch(
      `${SAVED_PLAYERS_BACKEND_URL}/saved-players/${encodeURIComponent(identifier)}`,
      { method: "DELETE" },
    );
    return true;
  } catch (err) {
    console.warn("removeSavedPlayer failed:", err);
    return false;
  }
}

async function refreshSavedPlayer(identifier) {
  try {
    const res = await fetch(
      `${SAVED_PLAYERS_BACKEND_URL}/saved-players/${encodeURIComponent(identifier)}/refresh`,
      { method: "POST" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("refreshSavedPlayer failed:", err);
    return null;
  }
}

async function setSavedPlayerNote(identifier, text) {
  try {
    const res = await fetch(
      `${SAVED_PLAYERS_BACKEND_URL}/saved-players/${encodeURIComponent(identifier)}/note`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("setSavedPlayerNote failed:", err);
    return null;
  }
}

/**
 * Subscribes to the live "player saved" event (fired from the overlay
 * window). The launcher listens to this to automatically refresh the
 * saved-players list as soon as someone saves a player.
 */
function onPlayerSaved(callback) {
  if (!window.__TAURI__?.event?.listen) {
    return () => {};
  }
  let unlistenFn = () => {};
  window.__TAURI__.event
    .listen(PLAYER_SAVED_EVENT, (event) => callback(event.payload))
    .then((unlisten) => {
      unlistenFn = unlisten;
    })
    .catch((err) => console.warn("player-saved listen failed:", err));
  return () => unlistenFn();
}

window.SavedPlayersClient = {
  savePlayer,
  listSavedPlayers,
  removeSavedPlayer,
  refreshSavedPlayer,
  setSavedPlayerNote,
  onPlayerSaved,
};
