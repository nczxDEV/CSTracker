// CS Tracker - "FACEIT Match History" card (Player Summary tab).
//
// GSI-FREE: unlike "My Match History" (which needs a live GSI connection
// and only ever covers the LOCAL player's own stats), this works for ANY
// FACEIT nickname, sourced purely from the official FACEIT Data API's
// match history endpoint (see the backend's
// GET /players/:identifier/faceit-match-history). Triggered by
// player-summary.js right after a successful lookup (see
// `window.FaceitMatchHistory.load()` below), same convention as
// elo-forecast.js/map-pool-radar.js/recent-form.js.
//
// Clicking a match row opens the full per-match summary (both team
// rosters, K/D/A, ADR/HS%, MVP) in a SEPARATE popup window (see
// match-summary.html/.js) via the Rust `open_match_summary_window`
// command (src-tauri/src/main.rs) - not a Tauri capability-gated JS
// `WebviewWindow` call, so no extra capability entries are needed (see
// that command's doc comment for why).
(function () {
  const FMH_BACKEND_URL = "http://localhost:3000";

  const root = document.getElementById("fmh-root");
  if (!root) return;

  function renderEmpty(message) {
    root.innerHTML = `<div class="ps-card"><h2>FACEIT Match History <span class="badge-optional">GSI-free</span></h2><div class="na">${message}</div></div>`;
  }

  function renderLoading() {
    root.innerHTML = `
      <div class="ps-card">
        <h2>FACEIT Match History <span class="badge-optional">GSI-free</span></h2>
        <div class="lookup-loading-state">
          <div class="lookup-spinner"></div>
          <div class="lookup-loading-text">Loading match history...</div>
        </div>
      </div>`;
  }

  function formatWhen(iso) {
    if (!iso) return "Unknown date";
    try {
      const date = new Date(iso);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 60) return `${Math.max(1, diffMins)}m ago`;
      const diffHours = Math.round(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.round(diffHours / 24);
      if (diffDays < 30) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return "Unknown date";
    }
  }

  function render(matches, identifier) {
    if (!matches || matches.length === 0) {
      renderEmpty(`No recent FACEIT matches found for "${identifier}".`);
      return;
    }

    const rows = matches
      .map((m) => {
        const resultCls = m.result === "W" ? "win" : m.result === "L" ? "loss" : "na";
        const resultLabel = m.result || "?";
        const scoreLabel =
          m.teamScore !== null && m.opponentScore !== null ? `${m.teamScore}:${m.opponentScore}` : "N/A";
        const opponentLabel = m.opponentTeamName || "Unknown opponent";
        const competitionLabel = m.competitionName || "FACEIT match";
        const whenLabel = formatWhen(m.finishedAt || m.startedAt);
        return `
          <div class="fmh-row" data-match-id="${escapeAttr(m.matchId)}" data-identifier="${escapeAttr(identifier)}" tabindex="0" role="button">
            <span class="recent-badge ${resultCls}">${resultLabel}</span>
            <div class="fmh-row-main">
              <div class="fmh-row-title">vs ${escapeHtml(opponentLabel)}</div>
              <div class="fmh-row-sub">${escapeHtml(competitionLabel)} &middot; ${whenLabel}</div>
            </div>
            <div class="fmh-row-score">${scoreLabel}</div>
          </div>`;
      })
      .join("");

    root.innerHTML = `
      <div class="ps-card">
        <h2>FACEIT Match History <span class="badge-optional">Last ${matches.length} &middot; GSI-free</span></h2>
        <p class="hint" style="margin-top:0;">Click a match to see the full breakdown (both rosters, K/D/A, ADR/HS%, MVP) in a separate window.</p>
        <div class="fmh-list">${rows}</div>
      </div>`;

    root.querySelectorAll(".fmh-row").forEach((rowEl) => {
      const openHandler = () => openMatchSummary(rowEl.dataset.matchId, rowEl.dataset.identifier);
      rowEl.addEventListener("click", openHandler);
      rowEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openHandler();
        }
      });
    });
  }

  async function openMatchSummary(matchId, identifier) {
    const invokeFn = window.__TAURI__?.core?.invoke;
    if (!invokeFn) {
      // Plain-browser preview fallback (not running inside Tauri) - open
      // the same page in a regular new tab instead of a native window.
      window.open(`match-summary.html?matchId=${encodeURIComponent(matchId)}&identifier=${encodeURIComponent(identifier)}`, "_blank");
      return;
    }
    try {
      await invokeFn("open_match_summary_window", { matchId, identifier });
    } catch (err) {
      console.warn("Failed to open the match summary window:", err);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  async function load(identifier) {
    renderLoading();
    try {
      const res = await fetch(`${FMH_BACKEND_URL}/players/${encodeURIComponent(identifier)}/faceit-match-history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const matches = await res.json();
      render(matches, identifier);
    } catch (err) {
      console.warn("FaceitMatchHistory load failed:", err);
      renderEmpty(`Couldn't load match history for "${identifier}" - make sure the backend is running.`);
    }
  }

  renderEmpty("Check your stats above to see your recent FACEIT matches.");

  window.FaceitMatchHistory = { load };
})();
