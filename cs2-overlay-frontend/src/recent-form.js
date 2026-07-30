// CS Tracker - "Recent Form" card (Player Summary tab).
//
// GSI-FREE: unlike "My Match History" (which needs a live GSI connection
// and only ever covers the LOCAL player), this works for ANY player,
// purely from the official FACEIT Data API's match history endpoint -
// see the backend's PlayerProfile.recentForm field (players.normalizer.ts
// `computeRecentForm()`), which is already included in the same
// GET /players/:identifier/summary response player-summary.js fetches -
// no extra request needed here, this module just renders that field.
(function () {
  const root = document.getElementById("rf-root");
  if (!root) return;

  function renderEmpty(message) {
    root.innerHTML = `<div class="ps-card"><h2>Recent Form <span class="badge-optional">GSI-free</span></h2><div class="na">${message}</div></div>`;
  }

  function render(recentForm, nickname) {
    if (!recentForm || !recentForm.matchesConsidered) {
      renderEmpty(`No recent FACEIT match history available for "${nickname}" yet.`);
      return;
    }

    const badges = recentForm.last20Results
      .map((r) => `<span class="recent-badge ${r === "W" ? "win" : "loss"}" title="${r === "W" ? "Win" : "Loss"}">${r}</span>`)
      .join("");

    const streakLabel = recentForm.currentStreak
      ? `${recentForm.currentStreak.count}-match ${recentForm.currentStreak.type === "win" ? "win" : "loss"} streak`
      : "N/A";
    const streakCls = recentForm.currentStreak?.type === "win" ? "up" : recentForm.currentStreak?.type === "loss" ? "down" : "";

    root.innerHTML = `
      <div class="ps-card">
        <h2>Recent Form <span class="badge-optional">Last ${recentForm.matchesConsidered} &middot; GSI-free</span></h2>
        <div class="rf-badges">${badges}</div>
        <div class="rf-stats-row">
          <div class="rf-stat"><span class="val">${recentForm.winRateLast20Percent}%</span><span class="lbl">Win Rate</span></div>
          <div class="rf-stat"><span class="val ${streakCls}">${streakLabel}</span><span class="lbl">Current Streak</span></div>
          <div class="rf-stat"><span class="val">${recentForm.longestWinStreak}</span><span class="lbl">Best Win Streak</span></div>
          <div class="rf-stat"><span class="val">${recentForm.longestLossStreak}</span><span class="lbl">Worst Loss Streak</span></div>
        </div>
      </div>`;
  }

  renderEmpty("Check your stats above to see your recent form.");

  window.RecentForm = { render };
})();
